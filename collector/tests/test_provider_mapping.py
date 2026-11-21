"""Synthetic-only checks for prepared mappings, quote types and source clocks."""
from dataclasses import replace

import pytest

from pea_collector.model import CollectorError, ProviderError
from pea_collector.provider_mapping import ProviderMapping, normalize_provider, parse_provider_mappings


def mapping_for(mapping, **changes):
    """Declare a synthetic provider stream using existing instrument metadata."""
    return ProviderMapping.parse({**vars(mapping), "provider": "synthetic_a",
                                  "data_kind": "last_trade", "adjustment": "unadjusted", **changes})


def response_for(mapping, **changes):
    """Supply explicit source fields, distinct from Yahoo's raw response shape."""
    return {"provider": mapping.provider, "symbol": mapping.symbol, "exchange": mapping.exchange,
            "timezone": mapping.timezone, "quote_type": mapping.quote_type,
            "currency": mapping.reported_currency, "data_kind": mapping.data_kind,
            "adjustment": mapping.adjustment, "price": "12.3400",
            "market_timestamp": "2026-11-09T11:00:00+01:00", "provider_delay_seconds": None,
            "provenance": {"source": "Synthetic local fixture", "reference": None}, **changes}


def test_many_providers_can_share_one_instrument_with_distinct_symbols(mappings, now):
    """No two-provider cap or symbol alias guessing is introduced."""
    variants = [mapping_for(mappings[0], provider=f"synthetic_{n}", symbol=f"EXAMPLE{n}.PA",
                            exchange="XPAR" if n else "PAR") for n in range(3)]
    parsed = parse_provider_mappings([vars(item) for item in reversed(variants)])
    rows = [normalize_provider(item, response_for(item), now) for item in parsed]
    assert {row["instrument_id"] for row in rows} == {mappings[0].instrument_id}
    assert [row["provider"] for row in rows] == [item.provider for item in variants]
    assert [item.symbol for item in parsed] == [item.symbol for item in variants]


def test_trade_and_close_remain_distinct_streams(mappings, now):
    """The same provider's daily close cannot accidentally become a last trade."""
    trade = mapping_for(mappings[0])
    close = replace(trade, data_kind="session_close")
    assert len(parse_provider_mappings([vars(trade), vars(close)])) == 2
    rows = [normalize_provider(item, response_for(item), now) for item in (trade, close)]
    assert [row["price_kind"] for row in rows] == ["last_trade", "session_close"]
    with pytest.raises(ProviderError):
        normalize_provider(trade, response_for(close), now)


@pytest.mark.parametrize("kind,adjustment", [("ohlcv_bar", "unadjusted"), ("last_trade", "adjusted"), ("session_close", "adjusted")])
def test_bar_and_adjusted_mappings_cannot_enter_existing_quote_contract(mappings, now, kind, adjustment):
    """Descriptive support does not expand the financial ingestion contract."""
    mapping = mapping_for(mappings[0], data_kind=kind, adjustment=adjustment)
    assert parse_provider_mappings([vars(mapping)]) == [mapping]
    with pytest.raises(ProviderError, match="invalid_provider_data"):
        normalize_provider(mapping, response_for(mapping), now)


def test_preserves_units_provenance_and_independent_clocks(mappings, now):
    """No unit conversion, rounding, fabricated delay or clock substitution."""
    mapping = mapping_for(mappings[0], currency="GBP", reported_currency="GBX", price_unit="hundredth_currency_unit")
    raw = response_for(mapping, provider_delay_seconds=900)
    row = normalize_provider(mapping, raw, now)
    assert row == {"instrument_id": mapping.instrument_id, "provider": "synthetic_a",
        "price_kind": "last_trade", "adjustment": "unadjusted", "outcome": "success",
        "price": "12.3400", "currency": "GBP", "price_unit": "hundredth_currency_unit",
        "market_timestamp": "2026-11-09T10:00:00.000Z", "fetched_at": "2026-11-10T12:00:00.000Z",
        "session_date": "2026-11-09", "provider_delay_seconds": 900, "error_code": None,
        "provenance": {"source": "Synthetic local fixture", "reference": None}}
    assert normalize_provider(mapping, response_for(mapping), now)["provider_delay_seconds"] is None


@pytest.mark.parametrize("field", ["price", "market_timestamp", "currency", "symbol", "exchange", "timezone", "quote_type", "provider", "data_kind", "adjustment", "provenance"])
def test_missing_fields_are_not_invented(mappings, now, field):
    """Every required source declaration is independently necessary."""
    mapping = mapping_for(mappings[0])
    raw = response_for(mapping)
    del raw[field]
    with pytest.raises(ProviderError):
        normalize_provider(mapping, raw, now)


@pytest.mark.parametrize("patch", [
    {"provider": "synthetic_other"}, {"symbol": "WRONG.PA"}, {"currency": "USD"},
    {"exchange": "WRONG"}, {"timezone": "UTC"}, {"quote_type": "ETF"},
    {"data_kind": "ohlcv_bar"}, {"adjustment": "adjusted"}, {"price": "NaN"},
    {"market_timestamp": "2026-11-09"}, {"market_timestamp": "2026-11-09T10:00:00"},
    {"market_timestamp": "2026-11-11T00:00:00Z"}, {"market_timestamp": True},
    {"provider_delay_seconds": True}, {"provider_delay_seconds": -1},
    {"provenance": {"source": "", "reference": None}},
])
def test_invalid_or_mismatched_data_fails_closed(mappings, now, patch):
    """Metadata mismatch, ambiguity and future market timestamps are refused."""
    mapping = mapping_for(mappings[0])
    with pytest.raises(ProviderError):
        normalize_provider(mapping, response_for(mapping, **patch), now)


def test_duplicate_and_conflicting_mappings_fail(mappings):
    """Canonical metadata and provider-symbol associations must be unambiguous."""
    first = mapping_for(mappings[0])
    ambiguous_symbol = replace(first, instrument_id=mappings[1].instrument_id)
    foreign_currency = replace(first, provider="synthetic_b", currency="USD", reported_currency="USD")
    for other in (first, ambiguous_symbol, foreign_currency):
        with pytest.raises(CollectorError):
            parse_provider_mappings([vars(first), vars(other)])


@pytest.mark.parametrize("patch", [{"provider": "Bad Provider"}, {"data_kind": "close"}, {"adjustment": "unknown"}, {"extra": "field"}])
def test_mapping_shape_and_stream_semantics_are_explicit(mappings, patch):
    """Provider names and data types are validated without alias inference."""
    original = mapping_for(mappings[0])
    with pytest.raises(CollectorError):
        ProviderMapping.parse({**vars(original), **patch})
