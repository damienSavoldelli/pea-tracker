"""Synthetic EODHD-format checks, with no HTTP transport or production wiring."""
from copy import deepcopy
from dataclasses import replace
import json
from pathlib import Path

import pytest

from pea_collector.eodhd_fixture import EodhdFixtureProvider
from pea_collector.model import CollectorError, ProviderError, normalize
from pea_collector.provider import QuotationProvider
from pea_collector.provider_mapping import ProviderMapping, normalize_provider


@pytest.fixture
def fixture():
    return json.loads((Path(__file__).parent / "fixtures/eodhd_snapshot.synthetic.json").read_text())


@pytest.fixture
def source_mappings(mappings):
    return [ProviderMapping.parse({**vars(item), "provider": "eodhd", "exchange": "PA",
            "symbol": f"SYNTHETIC-{letter}.PA", "data_kind": "last_trade", "adjustment": "unadjusted"})
            for item, letter in zip(mappings, ("A", "B"))]


def test_snapshot_adapter_and_d2_preserve_source_fields(source_mappings, fixture, now):
    provider: QuotationProvider = EodhdFixtureProvider(source_mappings, fixture)
    rows = [normalize_provider(mapping, provider.fetch(mapping.symbol), now) for mapping in source_mappings]
    assert [row["price"] for row in rows] == ["12.3400", "23.4500"]
    assert [row["market_timestamp"] for row in rows] == ["2026-11-09T10:00:00.000Z", "2026-11-09T10:01:00.000Z"]
    assert [row["provider_delay_seconds"] for row in rows] == [None, 900]
    for row, mapping in zip(rows, source_mappings):
        assert row["instrument_id"] == mapping.instrument_id
        assert row["provider"] == "eodhd" and row["currency"] == "EUR"
        assert row["price_kind"] == "last_trade" and row["adjustment"] == "unadjusted"
        assert row["fetched_at"] == "2026-11-10T12:00:00.000Z"
        assert row["session_date"] == "2026-11-09"
        assert row["provenance"]["reference"] == mapping.symbol
        assert "Synthetic" in row["provenance"]["source"]


@pytest.mark.parametrize("field,value", [("close", None), ("close", "NaN"), ("close", -1),
    ("timestamp", None), ("timestamp", True), ("timestamp", "2026-11-09"),
    ("timestamp", 1794218400000), ("timestamp", -1)])
def test_invalid_snapshot_is_local_to_one_symbol(source_mappings, fixture, now, field, value):
    fixture["responses"][0][field] = value
    provider = EodhdFixtureProvider(source_mappings, fixture)
    with pytest.raises(ProviderError, match="^invalid_provider_data$"):
        normalize_provider(source_mappings[0], provider.fetch(source_mappings[0].symbol), now)
    second = normalize_provider(source_mappings[1], provider.fetch(source_mappings[1].symbol), now)
    assert second["outcome"] == "success" and second["price"] == "23.4500"


@pytest.mark.parametrize("field", ["close", "timestamp"])
def test_missing_price_or_timestamp_is_not_reconstructed(source_mappings, fixture, field):
    del fixture["responses"][0][field]
    with pytest.raises(ProviderError):
        EodhdFixtureProvider(source_mappings, fixture).fetch(source_mappings[0].symbol)


@pytest.mark.parametrize("field,value", [("currency", None), ("exchange", "WRONG"), ("timezone", "UTC"),
    ("quote_type", "ETF"), ("price_unit", "hundredth_currency_unit"),
    ("data_kind", "session_close"), ("data_kind", "ohlcv_bar"), ("adjustment", "adjusted"),
    ("provider_delay_seconds", True)])
def test_ambiguous_fixture_context_is_rejected(source_mappings, fixture, field, value):
    fixture["metadata"][source_mappings[0].symbol][field] = value
    with pytest.raises(ProviderError, match="invalid_provider_data"):
        EodhdFixtureProvider(source_mappings, fixture).fetch(source_mappings[0].symbol)


def test_missing_symbol_is_unavailable_without_poisoning_other_result(source_mappings, fixture):
    fixture["responses"].pop(0)
    provider = EodhdFixtureProvider(source_mappings, fixture)
    with pytest.raises(ProviderError, match="^provider_unavailable$"):
        provider.fetch(source_mappings[0].symbol)
    assert provider.fetch(source_mappings[1].symbol)["price"] == "23.4500"


def test_future_timestamp_is_rejected_by_d2(source_mappings, fixture, now):
    fixture["responses"][0]["timestamp"] = int(now.timestamp()) + 1
    provider = EodhdFixtureProvider(source_mappings, fixture)
    with pytest.raises(ProviderError):
        normalize_provider(source_mappings[0], provider.fetch(source_mappings[0].symbol), now)


def test_wrong_provider_and_yahoo_normalization_refuse_secondary_data(source_mappings, fixture, mappings, now):
    provider = EodhdFixtureProvider(source_mappings, fixture)
    raw = provider.fetch(source_mappings[0].symbol)
    with pytest.raises(ProviderError):
        normalize_provider(replace(source_mappings[0], provider="yahoo"), raw, now)
    with pytest.raises(ProviderError):
        normalize(mappings[0], raw, now)
    with pytest.raises(CollectorError):
        EodhdFixtureProvider([replace(source_mappings[0], provider="yahoo")], fixture)


def test_fixture_is_explicit_synthetic_and_unambiguous(source_mappings, fixture):
    for flag in (False, 1, None):
        with pytest.raises(CollectorError, match="invalid_fixture"):
            EodhdFixtureProvider(source_mappings, {**fixture, "synthetic": flag})
    fixture["responses"].append(deepcopy(fixture["responses"][0]))
    with pytest.raises(CollectorError, match="invalid_fixture"):
        EodhdFixtureProvider(source_mappings, fixture)


def test_caller_mutations_cannot_change_snapshot(source_mappings, fixture):
    provider = EodhdFixtureProvider(source_mappings, fixture)
    raw = provider.fetch(source_mappings[0].symbol)
    fixture["responses"][0]["close"] = "999"
    fixture["metadata"][source_mappings[0].symbol]["currency"] = "USD"
    raw["price"] = "999"
    assert provider.fetch(source_mappings[0].symbol)["price"] == "12.3400"
