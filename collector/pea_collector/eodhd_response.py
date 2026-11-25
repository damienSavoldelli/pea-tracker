"""Isolated delayed-snapshot parsing; no network, live wiring or feed admission."""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
import re

from .eodhd_http import RawEodhdResponse
from .model import CollectorError, ProviderError, exact_price, utc
from .provider_mapping import ProviderMapping, normalize_provider


def _object(pairs):
    """Reject duplicate JSON keys instead of silently choosing one declaration."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def _constant(_value):
    raise ValueError()


def parse_eodhd_response(response: RawEodhdResponse, symbols: list[str]) -> dict[str, dict]:
    """Index a bounded JSON object/array by exact requested code, without I/O.

    Missing symbols remain absent. A malformed price/time is checked per symbol by
    normalize_eodhd_snapshot; ambiguous identity/envelopes reject the whole batch.
    Error bodies and unknown fields never become provenance or exception messages.
    """
    if (not isinstance(symbols, list) or not 1 <= len(symbols) <= 20
            or any(not isinstance(s, str) or not re.fullmatch(r"[A-Za-z0-9.^=_-]{1,64}", s) for s in symbols)
            or len(set(symbols)) != len(symbols)):
        raise CollectorError("invalid_eodhd_symbols")
    if response.status == 429:
        raise ProviderError("rate_limited")
    if response.status != 200:
        raise ProviderError("provider_unavailable")
    if (not isinstance(response.body, bytes) or len(response.body) > 65536
            or response.content_type.split(";", 1)[0].strip().lower() != "application/json"):
        raise ProviderError("invalid_provider_data")
    try:
        payload = json.loads(response.body.decode("utf-8"), parse_float=Decimal,
                             parse_constant=_constant, object_pairs_hook=_object)
        rows = [payload] if isinstance(payload, dict) else payload
        if not isinstance(rows, list) or len(rows) > len(symbols):
            raise ValueError()
        indexed = {}
        for row in rows:
            if (not isinstance(row, dict) or not isinstance(row.get("code"), str)
                    or row["code"] not in symbols or row["code"] in indexed):
                raise ValueError()
            indexed[row["code"]] = {key: row[key] for key in ("code", "close", "timestamp") if key in row}
        return indexed
    except (ValueError, TypeError, UnicodeError, RecursionError, InvalidOperation):
        raise ProviderError("invalid_provider_data") from None


def normalize_eodhd_snapshot(mapping: ProviderMapping, snapshot: object, fetched_at: datetime,
                             *, provenance: dict, provider_delay_seconds: int | None = None) -> dict:
    """Bridge one parsed row to D2 using caller-supplied trusted feed context.

    Mapping/provenance must be independently qualified before any live use. Neither
    code suffix nor a successful parse establishes listing, currency, adjustment or
    last-trade equivalence. Unknown delay stays unknown; no 15-minute default.
    """
    mapping = ProviderMapping.parse(vars(mapping))
    if mapping.provider != "eodhd" or mapping.data_kind != "last_trade" or mapping.adjustment != "unadjusted":
        raise CollectorError("invalid_mapping")
    if snapshot is None:
        raise ProviderError("provider_unavailable")
    if not isinstance(snapshot, dict) or snapshot.get("code") != mapping.symbol:
        raise ProviderError("invalid_provider_data")
    timestamp = snapshot.get("timestamp")
    price = snapshot.get("close")
    if type(timestamp) is not int or timestamp <= 0 or isinstance(price, float):
        raise ProviderError("invalid_provider_data")
    try:
        market = utc(datetime.fromtimestamp(timestamp, timezone.utc))
    except (ValueError, OverflowError, OSError):
        raise ProviderError("invalid_provider_data") from None
    return normalize_provider(mapping, {
        "provider": "eodhd", "symbol": mapping.symbol, "exchange": mapping.exchange,
        "timezone": mapping.timezone, "quote_type": mapping.quote_type,
        "currency": mapping.reported_currency, "data_kind": mapping.data_kind,
        "adjustment": mapping.adjustment, "price": exact_price(price),
        "market_timestamp": market, "provider_delay_seconds": provider_delay_seconds,
        "provenance": provenance,
    }, fetched_at)
