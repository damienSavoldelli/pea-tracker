"""Verify private retry journals, bounded collection and safe CLI outcomes."""
from dataclasses import replace
from pathlib import Path
import json
import os
import stat
import time

import pytest
from pea_collector.__main__ import main
from pea_collector.model import CollectorError, ProviderError
from pea_collector.provider import YFinanceProvider
from pea_collector.runner import collect, run, journal
from conftest import raw_quote


class Provider:
    """Supply synthetic quotes after an optional sequence of provider failures."""

    def __init__(self, mapping, errors=()):
        """Retain one mapping and a test-owned failure sequence."""
        self.mapping, self.errors, self.calls = mapping, list(errors), 0

    def fetch(self, _):
        """Count retrievals and return the next failure or a synthetic quotation."""
        self.calls += 1
        if self.errors:
            raise ProviderError(self.errors.pop(0))
        return raw_quote(self.mapping)


class Client:
    """Capture delivery attempts and optionally simulate ingestion unavailability."""

    def __init__(self, fail=False):
        """Initialize isolated captured calls and the requested failure mode."""
        self.calls, self.fail = [], fail

    def deliver(self, body, key, expected):
        """Retain delivery inputs before simulating success or transport failure."""
        self.calls.append((body, key, expected))
        if self.fail:
            raise CollectorError("ingestion_unavailable")


def test_restarts_replay_original_journal_without_refetch(mappings, now, tmp_path):
    """Retrying a journaled cycle preserves its payload and private file modes."""
    provider = Provider(mappings[0]); client = Client(True)
    state = tmp_path / "private"
    with pytest.raises(CollectorError):
        run(mappings[:1], provider, client, state, "synthetic-cycle", clock=lambda: now)
    client.fail = False
    result = run(mappings[:1], provider, client, state, "synthetic-cycle", clock=lambda: now)
    assert result["delivered"] and provider.calls == 1
    assert client.calls[0] == client.calls[1]
    assert stat.S_IMODE(state.stat().st_mode) == 0o700
    assert all(stat.S_IMODE(path.stat().st_mode) == 0o600 for path in state.iterdir())
    assert "token" not in next(state.glob("*.json")).read_text()


def test_rejects_changed_mapping_and_missing_retry_journal(mappings, now, tmp_path):
    """A replay cannot silently change its mapping or recollect a missing journal."""
    state = tmp_path / "state"; provider = Provider(mappings[0])
    run(mappings[:1], provider, None, state, "cycle", clock=lambda: now)
    with pytest.raises(CollectorError, match="cycle_mapping_changed"):
        run([replace(mappings[0], symbol="OTHER.PA")], provider, None, state, "cycle")
    with pytest.raises(CollectorError, match="retry_journal_missing"):
        run(mappings[:1], provider, None, state, "new-cycle", require_existing=True)
    assert provider.calls == 1


def test_corruption_permissions_symlinks_and_concurrent_run_fail_closed(mappings, now, tmp_path):
    """Unsafe journal state and competing executions fail before replay."""
    state = tmp_path / "state"; provider = Provider(mappings[0])
    run(mappings[:1], provider, None, state, "cycle", clock=lambda: now)
    path = next(state.glob("*.json")); original = path.read_text()
    path.write_text(original.replace('"12.3400"', '"99"'))
    with pytest.raises(CollectorError, match="invalid_journal"):
        run(mappings[:1], provider, None, state, "cycle")
    path.write_text(original); path.chmod(0o644)
    with pytest.raises(CollectorError, match="unsafe_journal_file"):
        run(mappings[:1], provider, None, state, "cycle")
    path.chmod(0o600)
    with journal(state, "cycle"):
        with pytest.raises(CollectorError, match="cycle_in_progress"):
            run(mappings[:1], provider, None, state, "cycle")
    link = tmp_path / "symlink"; link.symlink_to(state, target_is_directory=True)
    with pytest.raises(CollectorError, match="unsafe_journal_directory"):
        run(mappings[:1], provider, None, link, "cycle")


@pytest.mark.parametrize("errors,calls,outcome", [(["provider_unavailable"], 2, "success"), (["provider_unavailable"] * 2, 2, "unavailable"), (["rate_limited"], 1, "unavailable"), (["invalid_provider_data"], 1, "unavailable")])
def test_provider_retry_is_bounded_and_does_not_invent_prices(mappings, now, errors, calls, outcome):
    """Retry policy emits either a valid quotation or an explicit null-price failure."""
    provider = Provider(mappings[0], errors)
    result = collect(mappings[:1], provider, clock=lambda: now, sleep=lambda _: None)
    assert provider.calls == calls and result["observations"][0]["outcome"] == outcome
    if outcome == "unavailable":
        assert result["observations"][0]["price"] is None


def test_cli_default_is_synthetic_and_logs_only_counters(tmp_path, capsys):
    """Default execution stays synthetic and missing live gates prevent collection."""
    assert main(["--cycle-id", "synthetic-cli", "--state", str(tmp_path / "state")], {}) == 0
    output = capsys.readouterr().out
    assert json.loads(output) == {"event": "cycle_complete", "observations": 2, "unavailable": 0, "delivered": False}
    assert "SYNTHETIC" not in output and "12.3400" not in output
    assert main(["--mode", "live", "--cycle-id", "blocked", "--state", str(tmp_path / "blocked")], {}) == 1
    assert "live_prerequisites_missing" in capsys.readouterr().out
    assert not (tmp_path / "blocked").exists()


@pytest.mark.parametrize("error", ["rate_limited", "invalid_provider_data"])
def test_partial_live_cycle_is_delivered_but_cannot_satisfy_healthy_monitoring(mappings, tmp_path, monkeypatch, capsys, error):
    """A single failed instrument must fail the real CLI even when ingestion succeeds."""
    import pea_collector.__main__ as cli
    from datetime import datetime, timezone
    from pea_collector.monitor import missing

    class PartialProvider:
        def fetch(self, symbol):
            if symbol == mappings[1].symbol:
                raise ProviderError(error)
            return raw_quote(mappings[0])

    client = Client()
    monkeypatch.setattr(cli, "YFinanceProvider", PartialProvider)
    monkeypatch.setattr(cli, "machine_client", lambda *_args, **_kwargs: client)
    environment = {"COLLECTOR_MAPPING_JSON": json.dumps([vars(mapping) for mapping in mappings]),
                   "COLLECTOR_PROVIDER_APPROVED": "true", "COLLECTOR_COVERAGE_APPROVED": "true", "COLLECTOR_SECURITY_APPROVED": "true"}
    exit_code = main(["--mode", "live", "--cycle-id", "synthetic-partial-live", "--state", str(tmp_path / "state")], environment)
    assert exit_code == 1
    assert json.loads(capsys.readouterr().out) == {"event": "cycle_complete", "observations": 2, "unavailable": 1, "delivered": True}
    assert len(client.calls) == 1
    observations = json.loads(client.calls[0][0])["observations"]
    assert [item["outcome"] for item in observations] == ["success", "unavailable"]
    assert observations[1]["price"] is None

    run_metadata = {"id": 1, "display_title": "quotation-collector/live/2026-11-19T09:47:00.000Z",
                    "head_branch": "main", "conclusion": "failure" if exit_code else "success", "updated_at": "2026-11-19T09:48:00Z"}
    job = {"conclusion": run_metadata["conclusion"], "steps": [{"name": "Run collector", "conclusion": run_metadata["conclusion"]}]}
    def fetch(path):
        return {"jobs": [job]} if path.endswith("/jobs") else {"workflow_runs": [run_metadata]}

    now = datetime(2026, 11, 19, 10, 9, tzinfo=timezone.utc)
    assert missing(fetch, now, 30, paris=True)
    # Recovery is recognized; identical prices are not treated as failed retrievals.
    run_metadata["conclusion"] = job["conclusion"] = job["steps"][0]["conclusion"] = "success"
    assert not missing(fetch, now, 30, paris=True)


def slow_fetch(symbol, connection, directory):
    """Keep a child busy long enough to exercise the parent's process deadline."""
    time.sleep(5)


def test_provider_has_real_process_deadline_and_cleans_up():
    """A stalled provider child is terminated within a bounded elapsed time."""
    started = time.monotonic()
    with pytest.raises(ProviderError, match="provider_unavailable"):
        YFinanceProvider(timeout=1, target=slow_fetch).fetch("SYNTHETIC.PA")
    assert time.monotonic() - started < 4


def test_installed_yfinance_imports_and_has_required_api():
    """The locked local dependency exposes the adapter's required methods."""
    import yfinance
    assert callable(yfinance.Ticker.get_info) and callable(yfinance.set_tz_cache_location)
