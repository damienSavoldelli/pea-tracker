"""Synthetic JSON-byte checks only; no external samples, credentials or network."""
from dataclasses import replace
from decimal import Decimal
import json

import pytest

from pea_collector.eodhd_http import RawEodhdResponse
from pea_collector.eodhd_response import parse_eodhd_response, normalize_eodhd_snapshot
from pea_collector.model import CollectorError, ProviderError
from pea_collector.provider_mapping import ProviderMapping

A, B = "SYNTHETIC-A.PA", "SYNTHETIC-B.PA"
PROVENANCE = {"source": "Synthetic parser qualification", "reference": "synthetic-case"}


def response(body, status=200, content_type="application/json; charset=utf-8"):
    return RawEodhdResponse(status, body if isinstance(body, bytes) else json.dumps(body).encode(), content_type)


@pytest.fixture
def mapping(mappings):
    return ProviderMapping.parse({**vars(mappings[0]), "symbol": A, "exchange": "PA",
                                  "provider": "eodhd", "data_kind": "last_trade", "adjustment": "unadjusted"})


def test_raw_bytes_to_d2_preserve_decimal_lexemes_and_unknown_delay(mapping, now):
    raw = response(b'{"code":"SYNTHETIC-A.PA","timestamp":1794218400,"close":12.340000000001}')
    rows = parse_eodhd_response(raw, [A])
    assert rows[A]["close"] == Decimal("12.340000000001")
    result = normalize_eodhd_snapshot(mapping, rows[A], now, provenance=PROVENANCE)
    assert result["price"] == "12.340000000001"
    assert result["market_timestamp"] == "2026-11-09T10:00:00.000Z"
    assert result["fetched_at"] == "2026-11-10T12:00:00.000Z"
    assert result["provider_delay_seconds"] is None
    assert result["provider"] == "eodhd" and result["instrument_id"] == mapping.instrument_id
    assert result["provenance"] == PROVENANCE


def test_batch_is_keyed_by_code_not_position_and_invalid_price_is_local(mapping, now):
    rows = parse_eodhd_response(response([
        {"code": B, "timestamp": 1794218400, "close": "invalid"},
        {"code": A, "timestamp": 1794218400, "close": "12.3400"},
    ]), [A, B])
    assert normalize_eodhd_snapshot(mapping, rows[A], now, provenance=PROVENANCE,
                                    provider_delay_seconds=900)["price"] == "12.3400"
    with pytest.raises(ProviderError, match="^invalid_provider_data$"):
        normalize_eodhd_snapshot(replace(mapping, symbol=B), rows[B], now, provenance=PROVENANCE)


def test_missing_symbol_is_unavailable_without_fabricating_observation(mapping, now):
    rows = parse_eodhd_response(response([]), [A])
    assert rows == {}
    with pytest.raises(ProviderError, match="^provider_unavailable$"):
        normalize_eodhd_snapshot(mapping, rows.get(A), now, provenance=PROVENANCE)


@pytest.mark.parametrize("body", [b'null', b'42', b'"text"', b'{', b'\xff',
    b'{"code":"SYNTHETIC-A.PA","close":1,"close":2}',
    b'{"code":"SYNTHETIC-A.PA","close":NaN}',
    b'{"code":"SYNTHETIC-A.PA","close":Infinity}',
    b'{"code":"SYNTHETIC-A.PA","close":1e999999999999999999999}',
    b'{"error":"synthetic-sensitive-body"}',
    b'[{"code":"SYNTHETIC-A.PA"},{"code":"SYNTHETIC-A.PA"}]',
    b'[{"code":"OTHER.PA"}]'])
def test_invalid_or_ambiguous_envelope_has_only_fixed_error(body):
    with pytest.raises(ProviderError, match="^invalid_provider_data$"):
        parse_eodhd_response(response(body), [A, B])


@pytest.mark.parametrize("status,code", [(429, "rate_limited"), (500, "provider_unavailable"),
                                       (401, "provider_unavailable"), (302, "provider_unavailable")])
def test_http_errors_do_not_interpret_or_expose_body(status, code):
    with pytest.raises(ProviderError, match=f"^{code}$"):
        parse_eodhd_response(response(b'synthetic-sensitive-body', status), [A])


@pytest.mark.parametrize("body,content_type", [(b'{}', 'text/html'), (b'{}', ''),
                                            (b' ' * 65537, 'application/json')])
def test_body_and_media_type_are_bounded(body, content_type):
    with pytest.raises(ProviderError, match="^invalid_provider_data$"):
        parse_eodhd_response(response(body, content_type=content_type), [A])


@pytest.mark.parametrize("field,value", [("close", None), ("close", False), ("close", -1),
    ("close", "NaN"), ("close", "0.1234567890123"), ("close", 1.25),
    ("timestamp", True), ("timestamp", "2026-11-09"), ("timestamp", 1794218400000),
    ("timestamp", 0), ("timestamp", 99999999999999999999)])
def test_bad_price_or_time_cannot_be_normalized(mapping, now, field, value):
    row = {"code": A, "timestamp": 1794218400, "close": "12.34", field: value}
    with pytest.raises(ProviderError, match="^invalid_provider_data$"):
        normalize_eodhd_snapshot(mapping, row, now, provenance=PROVENANCE)


@pytest.mark.parametrize("field", ["close", "timestamp"])
def test_missing_fields_are_not_rebuilt_from_other_fields(mapping, now, field):
    row = {"code": A, "timestamp": 1794218400, "close": "12.34", "previousClose": "12", "change": "0.34"}
    del row[field]
    with pytest.raises(ProviderError):
        normalize_eodhd_snapshot(mapping, row, now, provenance=PROVENANCE)


def test_future_time_wrong_identity_and_wrong_context_are_refused(mapping, now):
    for row in ({"code": B, "timestamp": 1794218400, "close": "12"},
                {"code": A, "timestamp": int(now.timestamp()) + 1, "close": "12"}):
        with pytest.raises(ProviderError):
            normalize_eodhd_snapshot(mapping, row, now, provenance=PROVENANCE)
    for changed in (replace(mapping, provider="yahoo"), replace(mapping, data_kind="session_close"),
                    replace(mapping, adjustment="adjusted")):
        with pytest.raises(CollectorError, match="^invalid_mapping$"):
            normalize_eodhd_snapshot(changed, None, now, provenance=PROVENANCE)


def test_extra_fields_never_become_provenance_or_reconstructed_prices(mapping, now):
    rows = parse_eodhd_response(response({"code": A, "timestamp": 1794218400, "close": "12",
        "error": "synthetic-sensitive-body", "previousClose": "999", "change": "999"}), [A])
    assert set(rows[A]) == {"code", "timestamp", "close"}
    result = normalize_eodhd_snapshot(mapping, rows[A], now, provenance=PROVENANCE)
    assert "synthetic-sensitive-body" not in repr(result)


@pytest.mark.parametrize("symbols", [[], [A, A], [A] * 21, [None], ["bad symbol"]])
def test_request_identities_are_bounded(symbols):
    with pytest.raises(CollectorError, match="^invalid_eodhd_symbols$"):
        parse_eodhd_response(response([]), symbols)
