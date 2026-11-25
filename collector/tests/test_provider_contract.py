"""Exercise the provider boundary with synthetic data and no external requests."""
import json
import sys
from types import ModuleType, SimpleNamespace

import pytest

from pea_collector.model import ProviderError, normalize
from pea_collector.provider import QuotationProvider, YFinanceProvider
from pea_collector.runner import collect, run
from conftest import raw_quote


class SyntheticQuotationProvider:
    """Test-only implementation; never selectable by the production CLI."""

    def __init__(self, mappings, failures=None):
        self.quotes = {mapping.symbol: raw_quote(mapping) for mapping in mappings}
        self.failures = failures or {}
        self.calls = []

    def fetch(self, symbol: str) -> dict:
        """Return independent synthetic fields or an instrument-specific error."""
        self.calls.append(symbol)
        if symbol in self.failures:
            raise ProviderError(self.failures[symbol])
        return dict(self.quotes[symbol])


def synthetic_yahoo_child(symbol, connection, cache_directory):
    """Run the real Yahoo child adapter against an entirely local module stub."""
    class RateLimitError(Exception):
        pass

    def get_info():
        if symbol == "RATE_LIMITED":
            raise RateLimitError()
        if symbol == "UNAVAILABLE":
            raise RuntimeError("private upstream response must not escape")
        return {"symbol": symbol, "currency": "EUR", "exchange": "PAR",
                "exchangeTimezoneName": "Europe/Paris", "quoteType": "EQUITY",
                "regularMarketPrice": "12.3400", "regularMarketTime": 1794218400,
                "unused_profile": "must not cross the provider boundary"}

    fake = ModuleType("yfinance")
    fake.Ticker = lambda _: SimpleNamespace(get_info=get_info)
    fake.set_tz_cache_location = lambda _: None
    errors = ModuleType("yfinance.exceptions")
    errors.YFRateLimitError = RateLimitError
    sys.modules["yfinance"] = fake
    sys.modules["yfinance.exceptions"] = errors
    from pea_collector.provider import _fetch
    _fetch(symbol, connection, cache_directory)


def test_yahoo_child_preserves_exact_raw_fields():
    """The protocol does not change Yahoo's selected fields or price precision."""
    provider: QuotationProvider = YFinanceProvider(target=synthetic_yahoo_child)
    assert provider.fetch("SYNTHETIC.PA") == {
        "symbol": "SYNTHETIC.PA", "currency": "EUR", "exchange": "PAR",
        "exchangeTimezoneName": "Europe/Paris", "quoteType": "EQUITY",
        "regularMarketPrice": "12.3400", "regularMarketTime": 1794218400,
    }


@pytest.mark.parametrize("symbol,code", [("RATE_LIMITED", "rate_limited"), ("UNAVAILABLE", "provider_unavailable")])
def test_yahoo_child_keeps_sanitized_failures(symbol, code):
    """The existing error mapping survives process isolation unchanged."""
    with pytest.raises(ProviderError, match=f"^{code}$"):
        YFinanceProvider(target=synthetic_yahoo_child).fetch(symbol)


def test_provider_boundary_preserves_normalization(mappings, now):
    """Source clocks, exact decimals and Yahoo provenance remain unchanged."""
    provider: QuotationProvider = SyntheticQuotationProvider(mappings)
    payload = collect(mappings, provider, clock=lambda: now)
    assert payload == {"observations": [normalize(mapping, raw_quote(mapping), now) for mapping in mappings]}
    assert provider.calls == [mapping.symbol for mapping in mappings]


def test_partial_failure_and_replay_keep_original_bytes(mappings, now, tmp_path):
    """Replay preserves a mixed cycle, its receipt key and clocks without refetch."""
    provider: QuotationProvider = SyntheticQuotationProvider(mappings, {mappings[1].symbol: "rate_limited"})
    deliveries = []
    client = SimpleNamespace(deliver=lambda body, key, count: deliveries.append((body, key, count)))
    state = tmp_path / "state"
    first = run(mappings, provider, client, state, "synthetic-provider-cycle", clock=lambda: now)
    original = next(state.glob("*.json")).read_bytes()
    assert first["unavailable"] == 1
    rows = json.loads(deliveries[0][0])["observations"]
    assert rows[0] == normalize(mappings[0], raw_quote(mappings[0]), now)
    assert rows[1]["outcome"] == "unavailable" and rows[1]["price"] is None
    assert rows[1]["market_timestamp"] is None and rows[1]["error_code"] == "rate_limited"

    provider.quotes.clear()
    provider.failures = {mapping.symbol: "provider_unavailable" for mapping in mappings}
    replay = run(mappings, provider, client, state, "synthetic-provider-cycle", require_existing=True,
                 clock=lambda: pytest.fail("A replay must not read the collection clock"))
    assert replay == first and deliveries[0] == deliveries[1]
    assert deliveries[0][1].startswith("yf-")
    assert provider.calls == [mapping.symbol for mapping in mappings]
    assert next(state.glob("*.json")).read_bytes() == original
