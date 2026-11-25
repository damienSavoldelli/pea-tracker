"""New E harness tests only: native loopback, synthetic workers and D seams."""
from datetime import datetime, timedelta, timezone
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import signal
import threading
import time
from types import SimpleNamespace

import pytest

from experiments.yahoo_session_capture import (Budget, CampaignStop, SessionCapture, TransportGuard,
    campaign, category, evaluate_capture, main, sample_mapping, unique_yahoo_targets)
from pea_collector.model import CollectorError, normalize
from pea_collector.runner import read_journal


def synthetic_worker(connection, directory):
    while True:
        try:
            symbol = connection.recv()
        except EOFError:
            return
        if symbol == "CW8.PA":
            connection.send(("unavailable", None))
            continue
        for _ in range(3):  # Includes synthetic setup/internal requests.
            connection.send(("http", None))
            if connection.recv() != "allow":
                return
        connection.send(("result", {"raw": {"symbol": symbol}, "events": []}))


def hanging_worker(connection, directory):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    connection.recv()
    connection.send(("http", None))
    connection.recv()
    while True:
        signal.pause()


def test_default_is_zero_io_even_when_campaign_is_unavailable(monkeypatch, capsys):
    monkeypatch.setattr("experiments.yahoo_session_capture.campaign", lambda *_: pytest.fail("No live campaign"))
    assert main([]) == 0
    assert json.loads(capsys.readouterr().out) == {"event": "yahoo_capture_plan", "execute": False,
        "get_info_max": 12, "http_attempts_max": 80, "ingestion_writes": 0, "automatic_retries": 0}


@pytest.mark.parametrize("url", ["http://query1.finance.yahoo.com/v7/finance/quote",
    "https://query1.finance.yahoo.com.evil.invalid/v7/finance/quote",
    "https://user:password@query1.finance.yahoo.com/v7/finance/quote",
    "https://query1.finance.yahoo.com:444/v7/finance/quote",
    "https://query1.finance.yahoo.com/v8/finance/chart/AIR.PA",
    "https://guce.yahoo.com/consent"])
def test_unqualified_endpoints_fail_closed(url):
    with pytest.raises(CampaignStop, match="unexpected_endpoint"):
        category(url)


def test_budget_is_conservative_and_save_failure_prevents_permission():
    budget = Budget(http_limit=2)
    budget.charge("http"); budget.charge("http")
    with pytest.raises(CollectorError, match="budget_exhausted"):
        budget.charge("http")
    assert budget.http == 2
    broken = Budget(save=lambda: (_ for _ in ()).throw(OSError()))
    with pytest.raises(OSError):
        broken.charge("http")
    assert broken.http == 1


def test_thirteenth_get_info_is_refused_before_worker_io():
    budget = Budget()
    for _ in range(12):
        budget.charge("fetch")
    with pytest.raises(CollectorError, match="budget_exhausted"):
        budget.charge("fetch")
    assert budget.fetches == 12 and budget.http == 0


def test_fetch_budget_is_global_across_individual_worker_resets():
    budget = Budget(http_limit=5)
    provider = SessionCapture(budget, shared=False, target=synthetic_worker, timeout=3)
    try:
        assert provider.fetch("AIR.PA")["raw"]["symbol"] == "AIR.PA"
        assert provider.process is None and budget.http == 3
        with pytest.raises(CollectorError, match="budget_exhausted"):
            provider.fetch("WPEA.PA")
        assert budget.http == 5 and budget.fetches == 2 and provider.process is None
    finally:
        provider.close()
    assert not Path(provider.cache.name).exists()


def test_partial_failure_keeps_prior_result_and_continues_without_retry():
    budget = Budget()
    provider = SessionCapture(budget, shared=True, target=synthetic_worker, timeout=3)
    try:
        first = provider.fetch("AIR.PA")
        assert provider.fetch("CW8.PA") is None
        assert provider.fetch("WPEA.PA")["raw"]["symbol"] == "WPEA.PA"
        assert first["raw"]["symbol"] == "AIR.PA" and budget.fetches == 3 and budget.http == 6
        assert len(provider.reaped) == 1
    finally:
        provider.close()


@pytest.mark.skipif(not hasattr(signal, "SIGKILL"), reason="POSIX cleanup qualification")
def test_timeout_kills_worker_without_refunding_inflight_attempt():
    budget = Budget()
    provider = SessionCapture(budget, shared=True, target=hanging_worker, timeout=1)
    start = time.monotonic()
    try:
        with pytest.raises(CollectorError, match="capture_attempt_timeout"):
            provider.fetch("AIR.PA")
        assert budget.http == 1 and budget.fetches == 1
        assert provider.reaped == [-signal.SIGKILL] and provider.process is None
        assert time.monotonic() - start < 3
    finally:
        provider.close()


def test_parent_interruption_reaps_worker(monkeypatch):
    budget = Budget()
    provider = SessionCapture(budget, shared=True, target=synthetic_worker, timeout=3)
    provider.fetch("AIR.PA")
    monkeypatch.setattr(budget, "charge", lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    # The outer campaign owns cleanup even when interruption precedes fetch.
    try:
        with pytest.raises(KeyboardInterrupt):
            provider.fetch("AIR.PA")
    finally:
        provider.close()
    assert provider.process is None and not Path(provider.cache.name).exists()


def test_native_reissues_require_additional_budget_before_request():
    budget = Budget(http_limit=2)
    guard = TransportGuard(lambda: budget.charge("http"))
    guard.active = "synthetic"
    callbacks = {}
    guard.lib = SimpleNamespace(_curl_easy_setopt=lambda _curl, _option, cb: callbacks.update(callback=cb) or 0)
    curl = SimpleNamespace(_curl=None, setopt=lambda *_: None,
                           getinfo=lambda *_: 200)
    permitted = []

    def repeated(_curl):
        for _ in range(4):
            if callbacks["callback"](guard.ffi.NULL, guard.ffi.NULL, guard.ffi.NULL, 0, 0):
                break
            permitted.append(True)

    guard.original_perform = repeated
    with pytest.raises(CampaignStop):
        guard.perform(curl)
    assert len(permitted) == budget.http == 2


@pytest.mark.parametrize("status", [200, 302, 401, 429])
def test_native_prereq_callback_is_installed_and_local_redirect_is_not_followed(status):
    from curl_cffi import Curl, CurlOpt
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            calls.append(self.path)
            self.send_response(status)
            self.send_header("Location", "/must-not-follow")
            self.send_header("Content-Length", "2")
            self.end_headers(); self.wfile.write(b"{}")

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    budget = Budget(http_limit=1)
    guard = TransportGuard(lambda: budget.charge("http")); guard.active = "synthetic"
    try:
        with closing(Curl()) as curl:
            curl.setopt(CurlOpt.URL, f"http://127.0.0.1:{server.server_port}/sample")
            curl.setopt(CurlOpt.FOLLOWLOCATION, 1)  # Guard must override this.
            curl.setopt(CurlOpt.WRITEFUNCTION, lambda data: len(data))
            curl.setopt(CurlOpt.TIMEOUT_MS, 1000)
            if status == 200:
                guard.perform(curl)
            else:
                with pytest.raises(CampaignStop):
                    guard.perform(curl)
            with pytest.raises(CollectorError, match="budget_exhausted"):
                guard.perform(curl)
        assert calls == ["/sample"] and budget.http == 1
        assert len(guard.events) == 1
        assert guard.prereq_calls == 1
    finally:
        server.shutdown(); server.server_close(); thread.join()


def test_portfolio_demands_reuse_d_mapping_validation_without_duplicate_fetches():
    one, two = sample_mapping(0), sample_mapping(1)
    assert len(unique_yahoo_targets([one, two, one])) == 2
    from dataclasses import replace
    with pytest.raises(CollectorError):
        unique_yahoo_targets([one, replace(one, symbol="CONFLICT.PA")])


def test_capture_review_uses_d_nonregression_and_keeps_old_source_time(now):
    mapping = sample_mapping(0)
    raw = {"symbol": mapping.symbol, "currency": "EUR", "exchange": "PAR", "exchangeTimezoneName": "Europe/Paris",
           "quoteType": "EQUITY", "regularMarketPrice": "12.3400", "regularMarketTime": int(now.timestamp())}
    first = normalize(mapping, raw, now)
    second = normalize(mapping, {**raw, "regularMarketTime": int(now.timestamp()) - 900}, now + timedelta(seconds=1))
    state = {"status": "captured_requires_review", "get_info_attempts": 2, "http_attempts": 4,
             "results": [{"round": 0, "sample": 0, "shared": shared, "http_attempts": 2,
                          "observation": row, "parent_received_at": row["fetched_at"]}
                         for shared, row in [(False, first), (True, second)]]}
    report = evaluate_capture(state)
    assert report["market_time_regressions"] == 1 and report["quality_gate"] == "no_go"
    assert report["market_age_seconds"] == [0, 901]
    assert "12.34" not in json.dumps(report) and mapping.instrument_id not in json.dumps(report)


@pytest.mark.parametrize("interrupt", [False, True])
def test_campaign_claim_and_receipt_prevent_resume_or_new_budget(tmp_path, monkeypatch, interrupt):
    import experiments.yahoo_session_capture as module
    fixed = datetime(2026, 11, 25, 10, 0, tzinfo=timezone.utc)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed

    class FakeCapture:
        def __init__(self, budget, **_options):
            self.budget = budget

        def fetch(self, symbol):
            self.budget.charge("fetch")
            self.budget.charge("http")
            if interrupt:
                raise KeyboardInterrupt()
            mapping = sample_mapping(next(i for i in range(3) if sample_mapping(i).symbol == symbol))
            return {"raw": {"symbol": symbol, "currency": "EUR", "exchange": "PAR",
                "exchangeTimezoneName": "Europe/Paris", "quoteType": mapping.quote_type,
                "regularMarketPrice": "10", "regularMarketTime": int(fixed.timestamp())}, "events": []}

        def close(self):
            pass

    monkeypatch.setattr(module, "datetime", Clock)
    monkeypatch.setattr(module, "SessionCapture", FakeCapture)
    monkeypatch.setattr(module.time, "sleep", lambda *_: None)
    directory = tmp_path / "private"
    if interrupt:
        with pytest.raises(KeyboardInterrupt):
            campaign(directory, "2026-11-25")
    else:
        assert campaign(directory, "2026-11-25")["get_info_attempts"] == 12
    saved = read_journal(next(directory.glob("*.json")))["payload"]
    assert saved["get_info_attempts"] == saved["http_attempts"] == (1 if interrupt else 12)
    assert saved["status"] == ("interrupted" if interrupt else "captured_requires_review")
    assert len(saved["results"]) == (0 if interrupt else 12)
    with pytest.raises(CollectorError, match="already_started"):
        campaign(directory, "2026-11-25")
    assert directory.stat().st_mode & 0o077 == 0


def test_campaign_date_is_required_before_private_claim(tmp_path):
    with pytest.raises(CollectorError, match="session_window_required"):
        campaign(tmp_path / "absent", "1900-01-01")
    assert not (tmp_path / "absent").exists()
