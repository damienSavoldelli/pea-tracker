"""Prepared local mappings/normalization; not wired to live collection or routing."""
from dataclasses import dataclass
from datetime import datetime
import re
from zoneinfo import ZoneInfo

from .model import CollectorError, InstrumentMapping, ProviderError, exact_price, utc


@dataclass(frozen=True)
class ProviderMapping(InstrumentMapping):
    """Reuse validated identity/units while declaring a provider-specific stream.

    Exchange is the provider's venue code, not a claim of canonical MIC equivalence.
    Bar and adjusted mappings are descriptive only; ingestion cannot accept them.
    """

    provider: str
    data_kind: str
    adjustment: str

    @classmethod
    def parse(cls, value: object):
        """Require explicit provider, metadata, data kind and adjustment semantics."""
        if not isinstance(value, dict) or set(value) != set(cls.__dataclass_fields__):
            raise CollectorError("invalid_mapping")
        legacy = InstrumentMapping.parse({key: value[key] for key in InstrumentMapping.__dataclass_fields__})
        if (not isinstance(value["provider"], str)
                or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", value["provider"])
                or value["data_kind"] not in ("last_trade", "session_close", "ohlcv_bar")
                or value["adjustment"] not in ("unadjusted", "adjusted")):
            raise CollectorError("invalid_mapping")
        return cls(**vars(legacy), provider=value["provider"], data_kind=value["data_kind"], adjustment=value["adjustment"])


def parse_provider_mappings(value: object) -> list[ProviderMapping]:
    """Allow N providers/streams per UUID, rejecting ambiguous local associations.

    This internal parser does not change the live CLI's existing 20-mapping limit.
    No catalogue or authorization lookup is implied by a successful parse.
    """
    if not isinstance(value, list) or not value:
        raise CollectorError("invalid_mapping")
    mappings = [ProviderMapping.parse(item) for item in value]
    identities, symbols, canonical = set(), set(), {}
    for mapping in mappings:
        stream = (mapping.provider, mapping.data_kind, mapping.adjustment)
        identity = (mapping.instrument_id, *stream)
        symbol = (mapping.symbol, mapping.exchange, *stream)
        metadata = (mapping.currency, mapping.price_unit, mapping.quote_type, mapping.timezone)
        if identity in identities or symbol in symbols:
            raise CollectorError("duplicate_mapping")
        if mapping.instrument_id in canonical and canonical[mapping.instrument_id] != metadata:
            raise CollectorError("invalid_mapping")
        identities.add(identity)
        symbols.add(symbol)
        canonical[mapping.instrument_id] = metadata
    return sorted(mappings, key=lambda m: (m.instrument_id, m.provider, m.data_kind, m.adjustment))


def normalize_provider(mapping: ProviderMapping, raw: object, fetched_at: datetime) -> dict:
    """Normalize explicit neutral fields into the existing unadjusted quote shape.

    This function is not a vendor adapter. Source identity and type must match the
    trusted mapping. No bar-to-trade conversion, timestamp inference, FX or price
    adjustment is permitted; missing required fields fail instead of being filled.
    """
    mapping = ProviderMapping.parse(vars(mapping))
    fetched = utc(fetched_at)
    if mapping.data_kind not in {"last_trade", "session_close"} or mapping.adjustment != "unadjusted":
        raise ProviderError("invalid_provider_data")
    expected = {"provider": mapping.provider, "symbol": mapping.symbol,
                "exchange": mapping.exchange, "timezone": mapping.timezone,
                "quote_type": mapping.quote_type, "currency": mapping.reported_currency,
                "data_kind": mapping.data_kind, "adjustment": mapping.adjustment}
    if not isinstance(raw, dict) or any(raw.get(key) != value for key, value in expected.items()):
        raise ProviderError("invalid_provider_data")
    try:
        timestamp = raw.get("market_timestamp")
        if not isinstance(timestamp, str) or len(timestamp) > 64:
            raise ValueError()
        market = datetime.fromisoformat(timestamp)
        if market.tzinfo is None or market > fetched_at:
            raise ValueError()
        session = market.astimezone(ZoneInfo(mapping.timezone)).date().isoformat()
        delay = raw.get("provider_delay_seconds")
        if delay is not None and (type(delay) is not int or not 0 <= delay <= 86400):
            raise ValueError()
        provenance = raw.get("provenance")
        if not isinstance(provenance, dict) or set(provenance) != {"source", "reference"}:
            raise ValueError()
        for key, text in provenance.items():
            if key == "reference" and text is None:
                continue
            if not isinstance(text, str) or not 1 <= len(text) <= 512 or re.search(r"[\x00-\x1f\x7f-\x9f]", text):
                raise ValueError()
    except (ValueError, TypeError, OverflowError):
        raise ProviderError("invalid_provider_data") from None
    return {"instrument_id": mapping.instrument_id, "provider": mapping.provider,
            "price_kind": mapping.data_kind, "adjustment": mapping.adjustment,
            "outcome": "success", "price": exact_price(raw.get("price")),
            "currency": mapping.currency, "price_unit": mapping.price_unit,
            "market_timestamp": utc(market), "fetched_at": fetched, "session_date": session,
            "provider_delay_seconds": delay, "error_code": None, "provenance": dict(provenance)}
