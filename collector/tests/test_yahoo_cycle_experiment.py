"""Offline session comparison, financial-field preservation and journal replay."""
from datetime import timedelta
from types import SimpleNamespace

import pytest

from experiments.yahoo_cycle import SimulatedCycleProvider, SimulatedYahooTransport, compare_cycles
from pea_collector.model import normalize, parse_mappings
from pea_collector.runner import run
from conftest import raw_quote


def examples(mappings, count):
    """Generate unique artificial equity/ETF mappings through existing validation."""
    return parse_mappings([{**vars(mappings[i % 2]), "instrument_id": f"00000000-0000-4000-8000-{i + 1:012d}",
                            "symbol": f"SYNTHETIC-{i}.PA"} for i in range(count)])


def clocks(now, count):
    """Give each branch the same explicit per-observation collection timeline."""
    # Invalid raw data consumes a validation clock read and a failure-declaration read.
    return lambda: iter([now + timedelta(seconds=i) for i in range(2 * count)]).__next__


@pytest.mark.parametrize("count", [1, 3, 20])
def test_individual_and_shared_cycles_preserve_every_normalized_field(mappings, now, count):
    """Full observations, including provenance, units and both clocks, must match."""
    selected = examples(mappings, count)
    script = {item.symbol: [raw_quote(item)] for item in selected}
    report = compare_cycles(selected, script, clock_factory=clocks(now, count))
    expected = [normalize(item, raw_quote(item), now + timedelta(seconds=i)) for i, item in enumerate(selected)]
    assert report["equivalent"] and report["measurement"] == "synthetic_model_only"
    assert report["individual"]["payload"] == report["shared"]["payload"] == {"observations": expected}
    for mode in ("individual", "shared"):
        assert report[mode]["logical_calls"] == report[mode]["attempts"] == count
    assert report["individual"]["sessions_created"] == count
    assert report["shared"]["sessions_created"] == 1
    # These are toy-model events, never empirical Yahoo HTTP counts or savings.
    assert report["individual"]["simulated_http_requests"] == 2 * count
    assert report["shared"]["simulated_http_requests"] == count + 1


@pytest.mark.parametrize("failure,retry", [("timeout", True), ("session_failure", True),
                                          ("missing", True), ("rate_limited", False), (None, False)])
def test_partial_errors_do_not_refetch_successes_or_poison_following_symbols(mappings, now, failure, retry):
    """The runner retries only the failed symbol and retains independent results."""
    selected = examples(mappings, 3)
    script = {item.symbol: [raw_quote(item)] for item in selected}
    script[selected[1].symbol] = [failure, failure]
    report = compare_cycles(selected, script, clock_factory=clocks(now, 3))
    assert report["equivalent"]
    for mode in ("individual", "shared"):
        result = report[mode]
        rows = result["payload"]["observations"]
        assert [row["outcome"] for row in rows] == ["success", "unavailable", "success"]
        assert rows[1]["price"] is None and rows[1]["market_timestamp"] is None
        assert result["attempts"] == 3 + int(retry) and result["logical_calls"] == 3
        quotes = [symbol for _, kind, symbol in result["trace"] if kind == "quote"]
        assert quotes.count(selected[0].symbol) == quotes.count(selected[2].symbol) == 1
        assert quotes.count(selected[1].symbol) == 1 + int(retry)


@pytest.mark.parametrize("failure", ["timeout", "session_failure", "missing"])
def test_transient_failure_recovers_only_its_symbol(mappings, now, failure):
    selected = examples(mappings, 3)
    script = {item.symbol: [raw_quote(item)] for item in selected}
    script[selected[1].symbol].insert(0, failure)
    report = compare_cycles(selected, script, clock_factory=clocks(now, 3))
    assert report["equivalent"]
    assert all(row["outcome"] == "success" for row in report["shared"]["payload"]["observations"])
    assert report["shared"]["attempts"] == 4


@pytest.mark.parametrize("patch", [{"regularMarketTime": None}, {"regularMarketPrice": "NaN"},
                                   {"currency": "USD"}, {"Close": "12.3400", "regularMarketPrice": None}])
def test_ambiguous_or_bar_fields_never_replace_last_trade(mappings, now, patch):
    selected = examples(mappings, 1)
    report = compare_cycles(selected, {selected[0].symbol: [{**raw_quote(selected[0]), **patch}]}, clock_factory=clocks(now, 1))
    assert report["equivalent"]
    for mode in ("individual", "shared"):
        row = report[mode]["payload"]["observations"][0]
        assert row["error_code"] == "invalid_provider_data" and row["price"] is None
        assert report[mode]["attempts"] == 1


def test_journal_bytes_key_and_replay_are_independent_of_session_policy(mappings, now, tmp_path):
    """Both policies produce identical private journals and delivery/replay bytes."""
    selected = examples(mappings, 3)
    script = {item.symbol: [raw_quote(item)] for item in selected}
    script[selected[1].symbol] = ["rate_limited"]
    snapshots, deliveries = [], []
    for shared in (False, True):
        transport = SimulatedYahooTransport(script)
        provider = SimulatedCycleProvider(transport, shared=shared)
        sent = []
        client = SimpleNamespace(deliver=lambda body, key, count: sent.append((body, key, count)))
        state = tmp_path / str(shared)
        first = run(selected, provider, client, state, "synthetic-session-cycle", clock=clocks(now, 3)(), sleep=lambda _: None)
        snapshot = next(state.glob("*.json")).read_bytes()
        before = (provider.attempts, list(transport.requests))
        transport.script.clear()
        replay = run(selected, provider, client, state, "synthetic-session-cycle", require_existing=True,
                     clock=lambda: pytest.fail("Replay must not collect"))
        assert replay == first and sent[0] == sent[1]
        assert snapshot == next(state.glob("*.json")).read_bytes()
        assert before == (provider.attempts, transport.requests)
        snapshots.append(snapshot)
        deliveries.append(sent)
    assert snapshots[0] == snapshots[1] and deliveries[0] == deliveries[1]


def test_exact_price_and_hundredth_units_are_preserved(mappings, now):
    """Shared sessions must not round large decimals or convert quotation units."""
    selected = parse_mappings([{**vars(mappings[0]), "currency": "GBP", "reported_currency": "GBX",
                               "price_unit": "hundredth_currency_unit"}])
    raw = {**raw_quote(selected[0]), "regularMarketPrice": "9007199254740993.1200"}
    report = compare_cycles(selected, {selected[0].symbol: [raw]}, clock_factory=clocks(now, 1))
    assert report["equivalent"]
    row = report["shared"]["payload"]["observations"][0]
    assert row["price"] == "9007199254740993.1200" and row["currency"] == "GBP"
    assert row["price_unit"] == "hundredth_currency_unit"


def test_future_market_time_is_not_replaced_by_collection_time(mappings, now):
    """A synthetic future timestamp fails rather than receiving a plausible time."""
    selected = examples(mappings, 1)
    raw = {**raw_quote(selected[0]), "regularMarketTime": int(now.timestamp()) + 1}
    report = compare_cycles(selected, {selected[0].symbol: [raw]}, clock_factory=clocks(now, 1))
    assert report["equivalent"]
    row = report["shared"]["payload"]["observations"][0]
    assert row["error_code"] == "invalid_provider_data" and row["market_timestamp"] is None


def test_new_comparison_cycle_does_not_reuse_quotes_or_sessions(mappings, now):
    """A new cycle fetches again and preserves its own market and collection time."""
    selected = examples(mappings, 1)
    first = compare_cycles(selected, {selected[0].symbol: [raw_quote(selected[0])]}, clock_factory=clocks(now, 1))
    changed = {**raw_quote(selected[0]), "regularMarketPrice": "13.0000", "regularMarketTime": int(now.timestamp())}
    second = compare_cycles(selected, {selected[0].symbol: [changed]}, clock_factory=clocks(now + timedelta(minutes=1), 1))
    assert first["shared"]["payload"] != second["shared"]["payload"]
    assert second["shared"]["sessions_created"] == second["shared"]["attempts"] == 1
    assert second["shared"]["payload"]["observations"][0]["price"] == "13.0000"
