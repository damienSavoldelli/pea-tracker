"""Strict provider-to-ingestion boundary. All numeric prices leave as strings."""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import math
import re
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class CollectorError(Exception):
    """Only fixed, non-sensitive error codes may reach CLI output."""


class ProviderError(CollectorError):
    """Represent a sanitized provider failure suitable for a failure declaration."""

    pass


def utc(value: datetime) -> str:
    """Serialize an aware clock value as a millisecond UTC timestamp."""
    if value.tzinfo is None:
        raise CollectorError("invalid_clock")
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class InstrumentMapping:
    """Bind one instrument to explicitly verified Yahoo identity and quote units."""

    instrument_id: str
    symbol: str
    currency: str
    price_unit: str
    reported_currency: str
    exchange: str
    timezone: str
    quote_type: str

    @classmethod
    def parse(cls, value: object):
        """Validate the exact mapping shape and reject unsupported unit meanings."""
        fields = set(cls.__dataclass_fields__)
        if not isinstance(value, dict) or set(value) != fields or not all(isinstance(v, str) for v in value.values()):
            raise CollectorError("invalid_mapping")
        try:
            mapping = cls(**value)
            if str(UUID(mapping.instrument_id, version=4)) != mapping.instrument_id or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", mapping.instrument_id):
                raise ValueError()
            if not re.fullmatch(r"[A-Za-z0-9.^=_-]{1,64}", mapping.symbol) or not re.fullmatch(r"[A-Z]{3}", mapping.currency):
                raise ValueError()
            if not re.fullmatch(r"[A-Z0-9]{1,12}", mapping.exchange) or mapping.quote_type not in {"EQUITY", "ETF"}:
                raise ValueError()
            ZoneInfo(mapping.timezone)
            units = (mapping.reported_currency == mapping.currency and mapping.price_unit == "currency_unit") or (
                mapping.reported_currency in {"GBp", "GBX"} and mapping.currency == "GBP" and mapping.price_unit == "hundredth_currency_unit")
            if not units:
                raise ValueError()
            return mapping
        except (ValueError, TypeError, ZoneInfoNotFoundError):
            raise CollectorError("invalid_mapping") from None


def parse_mappings(value: object) -> list[InstrumentMapping]:
    """Validate a bounded unique mapping set and return stable instrument order."""
    if not isinstance(value, list) or not 1 <= len(value) <= 20:
        raise CollectorError("invalid_mapping")
    mappings = [InstrumentMapping.parse(item) for item in value]
    if len({m.instrument_id for m in mappings}) != len(mappings) or len({m.symbol for m in mappings}) != len(mappings):
        raise CollectorError("duplicate_mapping")
    return sorted(mappings, key=lambda m: m.instrument_id)


def exact_price(value: object) -> str:
    """Serialize a positive supported price without rounding or unit conversion.

    Existing provider floats retain only their available decimal representation;
    this boundary cannot recover precision lost before the value reached Python.
    """
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ProviderError("invalid_provider_data")
    # yfinance may already have decoded JSON into binary floats. Preserve its
    # shortest decimal representation, never claim recovered exchange precision.
    if isinstance(value, float) and not math.isfinite(value):
        raise ProviderError("invalid_provider_data")
    text = str(value)
    if len(text) > 64:
        raise ProviderError("invalid_provider_data")
    try:
        price = Decimal(text)
        if not price.is_finite() or price <= 0:
            raise ValueError()
        if price.adjusted() >= 30 or price.as_tuple().exponent < -12:
            raise ValueError()
        plain = format(price, "f")
        whole, _, fraction = plain.partition(".")
        if len(plain) > 64 or len(fraction) > 12 or len((whole + fraction).lstrip("0")) > 30:
            raise ValueError()
        return plain
    except (InvalidOperation, ValueError):
        raise ProviderError("invalid_provider_data") from None


def selector(mapping: InstrumentMapping) -> dict:
    """Identify the unadjusted Yahoo last-trade stream for an instrument."""
    return {"instrument_id": mapping.instrument_id, "provider": "yahoo", "price_kind": "last_trade", "adjustment": "unadjusted"}


def normalize(mapping: InstrumentMapping, raw: object, fetched_at: datetime) -> dict:
    """Build an ingestion declaration only when provider metadata matches.

    Market time comes from Yahoo; the session date uses its verified time zone.
    Retrieval time remains separate, and unknown provider delay stays null.
    """
    if not isinstance(raw, dict) or any(raw.get(key) != expected for key, expected in {
        "symbol": mapping.symbol, "currency": mapping.reported_currency, "exchange": mapping.exchange,
        "exchangeTimezoneName": mapping.timezone, "quoteType": mapping.quote_type,
    }.items()):
        raise ProviderError("invalid_provider_data")
    timestamp = raw.get("regularMarketTime")
    if isinstance(timestamp, bool) or not isinstance(timestamp, int) or timestamp <= 0:
        raise ProviderError("invalid_provider_data")
    try:
        market = datetime.fromtimestamp(timestamp, timezone.utc)
        if market > fetched_at:
            raise ValueError()
        session = market.astimezone(ZoneInfo(mapping.timezone)).date().isoformat()
    except (ValueError, OverflowError, OSError):
        raise ProviderError("invalid_provider_data") from None
    return {**selector(mapping), "outcome": "success", "price": exact_price(raw.get("regularMarketPrice")),
            "currency": mapping.currency, "price_unit": mapping.price_unit, "market_timestamp": utc(market),
            "fetched_at": utc(fetched_at), "session_date": session, "provider_delay_seconds": None, "error_code": None,
            "provenance": {"source": "Yahoo Finance via yfinance regularMarketPrice/Time; session date via verified exchangeTimezoneName; decimal(str(value)); provider precision unverified",
                           "reference": mapping.symbol}}


def unavailable(mapping: InstrumentMapping, fetched_at: datetime, reason: str) -> dict:
    """Declare a sanitized failed retrieval with every quote value explicitly null."""
    if reason not in {"provider_unavailable", "rate_limited", "invalid_provider_data"}:
        raise CollectorError("invalid_failure_reason")
    return {**selector(mapping), "outcome": "unavailable", "price": None, "currency": None, "price_unit": None,
            "market_timestamp": None, "fetched_at": utc(fetched_at), "session_date": None,
            "provider_delay_seconds": None, "error_code": reason,
            "provenance": {"source": "Yahoo Finance via yfinance; retrieval failure", "reference": mapping.symbol}}
