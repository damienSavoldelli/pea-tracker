"""Exercise strict metadata validation and the non-rounding decimal boundary."""
from dataclasses import replace
from decimal import Decimal
import pytest

from pea_collector.model import CollectorError, ProviderError, InstrumentMapping, exact_price, normalize, parse_mappings, unavailable
from conftest import raw_quote


@pytest.mark.parametrize("value", [None, True, False, 0, -1, "NaN", "Infinity", float("inf"), "0.0000000000001", "1e999999999", "9" * 31, "1,25", {}])
def test_rejects_ambiguous_or_unsupported_prices(value):
    """Invalid prices must fail instead of being rounded or substituted."""
    with pytest.raises(ProviderError, match="invalid_provider_data"):
        exact_price(value)


@pytest.mark.parametrize("value,expected", [("12.3400", "12.3400"), ("9007199254740993.12", "9007199254740993.12"), (Decimal("0.000000000001"), "0.000000000001"), (12.34, "12.34"), ("1e2", "100")])
def test_decimal_boundary_never_rounds(value, expected):
    """Supported declarations retain their available decimal representation."""
    assert exact_price(value) == expected


def test_normalizes_only_verified_metadata_and_actual_provider_time(mappings, now):
    """Normalization preserves provenance and separates market and fetch clocks."""
    row = normalize(mappings[0], raw_quote(mappings[0]), now)
    assert row["price"] == "12.3400" and row["currency"] == "EUR" and row["price_unit"] == "currency_unit"
    assert row["market_timestamp"] != row["fetched_at"]
    assert row["session_date"] == "2026-11-09"
    assert row["provider_delay_seconds"] is None
    assert row["price_kind"] == "last_trade" and row["adjustment"] == "unadjusted"
    assert "precision unverified" in row["provenance"]["source"]


@pytest.mark.parametrize("field,value", [("symbol", "OTHER.PA"), ("currency", "USD"), ("exchange", "OTHER"), ("exchangeTimezoneName", "UTC"), ("quoteType", "MUTUALFUND"), ("regularMarketTime", None), ("regularMarketTime", True), ("regularMarketTime", "1794218400"), ("regularMarketTime", 9999999999999999)])
def test_rejects_mismatches_without_guessing(mappings, now, field, value):
    """Conflicting or absent metadata cannot be inferred from the symbol."""
    raw = {**raw_quote(mappings[0]), field: value}
    with pytest.raises(ProviderError):
        normalize(mappings[0], raw, now)


def test_future_market_time_rejected_and_failure_has_no_fictitious_quote(mappings, now):
    """Future observations fail, and failure declarations contain no price data."""
    with pytest.raises(ProviderError):
        normalize(mappings[0], {**raw_quote(mappings[0]), "regularMarketTime": int(now.timestamp()) + 1}, now)
    failed = unavailable(mappings[0], now, "rate_limited")
    assert all(failed[key] is None for key in ["price", "currency", "price_unit", "market_timestamp", "session_date", "provider_delay_seconds"])
    assert failed["error_code"] == "rate_limited"


def test_hundredth_units_are_labels_not_python_financial_conversion(mappings, now):
    """The collector labels supported subunits without calculating market values."""
    mapping = InstrumentMapping.parse({**vars(mappings[0]), "currency": "GBP", "reported_currency": "GBp", "price_unit": "hundredth_currency_unit"})
    row = normalize(mapping, raw_quote(mapping), now)
    assert row["price"] == "12.3400" and row["price_unit"] == "hundredth_currency_unit"


@pytest.mark.parametrize("patch", [{"instrument_id": "bad"}, {"symbol": "https://untrusted.invalid"}, {"timezone": "Invalid/Zone"}, {"price_unit": "hundredth_currency_unit"}, {"unexpected": "value"}])
def test_mapping_is_explicit_and_strict(mappings, patch):
    """Unsupported mapping fields and ambiguous unit declarations are rejected."""
    with pytest.raises(CollectorError):
        parse_mappings([{**vars(mappings[0]), **patch}])


def test_duplicates_and_unbounded_mapping_are_rejected(mappings):
    """A cycle accepts a bounded set of distinct instruments and symbols."""
    for value in [[], [vars(mappings[0])] * 2, [vars(mappings[0])] * 21]:
        with pytest.raises(CollectorError):
            parse_mappings(value)
