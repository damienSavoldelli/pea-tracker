"""Installed-library qualification under blocked native/Python network exits."""
from datetime import timedelta
import os
from pathlib import Path
import signal
import time
from types import SimpleNamespace

import pytest

from experiments.yfinance_offline import OfflineYFinanceCycle
from pea_collector.model import CollectorError, ProviderError, normalize, parse_mappings
from pea_collector.runner import collect, run
from conftest import raw_quote


@pytest.fixture
def selected(mappings):
    return parse_mappings([{**vars(mappings[i % 2]), "instrument_id": f"00000000-0000-4000-8000-{i + 1:012d}",
                            "symbol": f"SYNTHETIC-{i}.PA"} for i in range(3)])


def script_for(selected):
    return {item.symbol: [raw_quote(item)] for item in selected}


def check_traces(provider):
    """Unexpected transport paths must never be hidden as supplier unavailability."""
    assert provider.traces
    for stats in provider.traces.values():
        assert stats["blocked_network_attempts"] == 0
        assert stats["versions"] == {"yfinance": "1.8.0", "curl_cffi": "0.17.0"}
        assert not any(event["category"] == "chart" for event in stats["requests"])


def test_installed_library_reuses_one_session_and_crumb_without_changing_quotes(selected, now):
    """Run real get_info in both policies and compare full normalized results."""
    payloads, counts, sessions, crumbs = [], [], [], []
    for shared in (False, True):
        with OfflineYFinanceCycle(script_for(selected), shared=shared) as provider:
            payloads.append(collect(selected, provider, clock=lambda: now, sleep=lambda _: None))
            check_traces(provider)
            events = [event for stats in provider.traces.values() for event in stats["requests"]]
            counts.append(len(events))
            sessions.append(provider.generations)
            crumbs.append(sum(event["category"] == "crumb" for event in events))
            assert all(len({event["session"] for event in stats["requests"]}) == 1 for stats in provider.traces.values())
            assert provider.attempts == 3
    expected = {"observations": [normalize(item, raw_quote(item), now) for item in selected]}
    assert payloads[0] == payloads[1] == expected
    assert sessions == crumbs == [3, 1]
    print({"measurement": "installed_library_mocked_http_only", "individual_requests": counts[0], "shared_requests": counts[1]})


@pytest.mark.parametrize("failure", [None, "timeout", "http_error", "rate_limited"])
def test_failures_leave_previous_and_following_observations_independent(selected, now, failure):
    script = script_for(selected)
    script[selected[1].symbol] = [failure, failure]
    with OfflineYFinanceCycle(script) as provider:
        rows = collect(selected, provider, clock=lambda: now, sleep=lambda _: None)["observations"]
        check_traces(provider)
        assert [row["outcome"] for row in rows] == ["success", "unavailable", "success"]
        assert rows[0] == normalize(selected[0], raw_quote(selected[0]), now)
        assert rows[2] == normalize(selected[2], raw_quote(selected[2]), now)
        assert rows[1]["price"] is None and rows[1]["market_timestamp"] is None
        if failure == "rate_limited":
            assert rows[1]["error_code"] == "rate_limited" and provider.attempts == 3
        requests = [event for stats in provider.traces.values() for event in stats["requests"]]
        assert sum(event["category"] == "quote" and event["symbol"] == selected[0].symbol for event in requests) == 1


def test_fresh_ticker_uses_updated_price_without_relabelling_old_market_time(selected, now):
    item = selected[0]
    old = raw_quote(item)
    new = {**old, "regularMarketPrice": "13.0000", "regularMarketTime": int(now.timestamp())}
    with OfflineYFinanceCycle({item.symbol: [old, old, new]}) as provider:
        first = normalize(item, provider.fetch(item.symbol), now)
        repeated = normalize(item, provider.fetch(item.symbol), now + timedelta(seconds=1))
        second = normalize(item, provider.fetch(item.symbol), now + timedelta(seconds=2))
        check_traces(provider)
        assert provider.generations == 1
        assert first["market_timestamp"] == "2026-11-09T10:00:00.000Z"
        assert first["fetched_at"] == "2026-11-10T12:00:00.000Z"
        assert repeated["market_timestamp"] == first["market_timestamp"]
        assert repeated["fetched_at"] != first["fetched_at"]
        assert second["market_timestamp"] == "2026-11-10T12:00:00.000Z" and second["price"] == "13.0000"
        assert sum(event["category"] == "quote" for event in provider.traces[1]["requests"]) == 3


@pytest.mark.parametrize("patch", [
    {"regularMarketPrice": None, "previousClose": "99", "regularMarketPreviousClose": "99", "Close": "99", "daily_close": "99", "adjclose": "99"},
    {"regularMarketTime": None}, {"currency": "USD"}, {"regularMarketTime": 9999999999999},
])
def test_library_cannot_silently_supply_an_alternative_financial_field(selected, now, patch):
    item = selected[0]
    with OfflineYFinanceCycle({item.symbol: [{**raw_quote(item), **patch}]}) as provider:
        rows = collect([item], provider, clock=lambda: now, sleep=lambda _: None)["observations"]
        check_traces(provider)
        assert rows[0]["price"] is None and rows[0]["market_timestamp"] is None
        assert rows[0]["error_code"] == "invalid_provider_data"


@pytest.mark.skipif(os.name != "posix", reason="Controlled native wait uses POSIX signals")
def test_total_deadline_kills_a_native_wait_and_preserves_validated_results(selected, now):
    """Actual signal.pause ignores SIGTERM; parent must kill/reap the child."""
    script = script_for(selected)
    script[selected[1].symbol] = ["block_ignore_terminate"]
    with OfflineYFinanceCycle(script) as provider:
        first = normalize(selected[0], provider.fetch(selected[0].symbol), now)
        provider.timeout = 0.75
        started = time.monotonic()
        with pytest.raises(ProviderError, match="^provider_unavailable$"):
            provider.fetch(selected[1].symbol)
        elapsed = time.monotonic() - started
        assert provider.block_entered and 0.7 <= elapsed < 2
        assert provider.process is None
        assert provider.reaped[-1]["killed"] and provider.reaped[-1]["exitcode"] == -signal.SIGKILL
        provider.timeout = 3
        third = normalize(selected[2], provider.fetch(selected[2].symbol), now)
        assert third == normalize(selected[2], raw_quote(selected[2]), now)
        assert first == normalize(selected[0], raw_quote(selected[0]), now)
        assert provider.generations == 2
        check_traces(provider)
        cache = provider.cache.name
    assert not Path(cache).exists() and provider.process is None


@pytest.mark.parametrize("probe", ["probe_native", "probe_socket"])
def test_network_exit_guards_fail_before_io(selected, probe):
    with OfflineYFinanceCycle({selected[0].symbol: [probe]}) as provider:
        with pytest.raises(CollectorError, match="^offline_network_forbidden$"):
            provider.fetch(selected[0].symbol)
        assert provider.traces[1]["blocked_network_attempts"] == 1


def test_real_library_provider_keeps_journal_replay_offline_and_byte_identical(selected, now, tmp_path):
    snapshots = []
    for shared in (False, True):
        with OfflineYFinanceCycle(script_for(selected), shared=shared) as provider:
            calls = []
            client = SimpleNamespace(deliver=lambda *args: calls.append(args))
            state = tmp_path / str(shared)
            first = run(selected, provider, client, state, "synthetic-offline-yfinance", clock=lambda: now)
            snapshot = next(state.glob("*.json")).read_bytes()
            attempts = provider.attempts
            provider.script.clear()
            replay = run(selected, provider, client, state, "synthetic-offline-yfinance", require_existing=True,
                         clock=lambda: pytest.fail("Replay must not collect"))
            assert first == replay and calls[0] == calls[1] and provider.attempts == attempts
            assert snapshot == next(state.glob("*.json")).read_bytes()
            check_traces(provider)
            snapshots.append(snapshot)
    assert snapshots[0] == snapshots[1]
