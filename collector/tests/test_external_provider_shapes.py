"""Synthetic structures modeled on inspected captures, without vendor datasets."""
from dataclasses import replace
import json

import pytest

from pea_collector.eodhd_http import RawEodhdResponse
from pea_collector.eodhd_response import parse_eodhd_response, normalize_eodhd_snapshot
from pea_collector.model import ProviderError
from pea_collector.provider_mapping import ProviderMapping


def test_three_record_snapshot_preserves_individual_times_and_same_time_revision(mappings, now):
    # All identifiers, prices and times are synthetic; only the envelope/field names
    # and per-symbol update pattern reflect the inspected external structures.
    body = b'''[
      {"code":"SYNTHETIC-A.PA","timestamp":1794218400,"gmtoffset":0,"open":11,"high":14,"low":10,"close":12.3400,"volume":12,"previousClose":11,"change":1.34,"change_p":12},
      {"code":"SYNTHETIC-B.PA","timestamp":1794218340,"gmtoffset":0,"open":21,"high":24,"low":20,"close":22.5600,"volume":15,"previousClose":21,"change":1.56,"change_p":7},
      {"code":"SYNTHETIC-C.PA","timestamp":1794218400,"gmtoffset":0,"open":31,"high":34,"low":30,"close":32.7800,"volume":18,"previousClose":31,"change":1.78,"change_p":6}
    ]'''
    symbols = [f"SYNTHETIC-{letter}.PA" for letter in "ABC"]
    rows = parse_eodhd_response(RawEodhdResponse(200, body, "application/json"), symbols)
    base = ProviderMapping.parse({**vars(mappings[0]), "provider": "eodhd", "exchange": "PA",
                                  "data_kind": "last_trade", "adjustment": "unadjusted"})
    context = {"source": "Synthetic envelope qualification", "reference": None}
    outputs = [normalize_eodhd_snapshot(replace(base, symbol=symbol), rows[symbol], now,
                                        provenance=context) for symbol in symbols]
    assert [r["price"] for r in outputs] == ["12.3400", "22.5600", "32.7800"]
    assert [r["market_timestamp"] for r in outputs] == [
        "2026-11-09T10:00:00.000Z", "2026-11-09T09:59:00.000Z", "2026-11-09T10:00:00.000Z"]
    revised = body.replace(b'22.5600', b'22.5700')
    updated = parse_eodhd_response(RawEodhdResponse(200, revised, "application/json"), symbols)
    result = normalize_eodhd_snapshot(replace(base, symbol=symbols[1]), updated[symbols[1]], now,
                                     provenance=context)
    assert result["market_timestamp"] == outputs[1]["market_timestamp"]
    assert result["price"] != outputs[1]["price"]
    assert result["provider_delay_seconds"] is None


@pytest.mark.parametrize("payload", [
    {"pagination": {"limit": 100, "offset": 0, "count": 1, "total": 1},
     "data": [{"symbol": "SYNTHETIC-A.XPAR", "exchange": "XPAR", "date": "2026-11-06T00:00:00+0000",
               "open": 11, "high": 14, "low": 10, "close": 12, "adj_close": 12,
               "split_factor": 1, "dividend": 0}]},
    {"Global Quote": {"01. symbol": "SYNTHETIC-A.PAR", "02. open": "11.0000",
                      "05. price": "12.0000", "07. latest trading day": "2026-11-06"}},
])
def test_close_envelopes_are_not_interpreted_as_eodhd_intraday_snapshots(payload):
    with pytest.raises(ProviderError, match="^invalid_provider_data$"):
        parse_eodhd_response(RawEodhdResponse(200, json.dumps(payload).encode(), "application/json"),
                             ["SYNTHETIC-A.PA"])
