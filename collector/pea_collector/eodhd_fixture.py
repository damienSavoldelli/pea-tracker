"""Offline EODHD-shaped snapshot adapter; not an integrated supplier client."""
from copy import deepcopy
from datetime import datetime, timezone

from .model import CollectorError, ProviderError, exact_price, utc
from .provider_mapping import ProviderMapping, parse_provider_mappings


class EodhdFixtureProvider:
    """Implement QuotationProvider.fetch structurally using in-memory fixtures.

    Returns D2 neutral fields, NOT the Yahoo-shaped fields required by the live
    runner. Never select this adapter in that composition. Synthetic context is
    explicit qualification input, not metadata claimed to come from EODHD.
    """

    def __init__(self, mappings: list[ProviderMapping], fixture: dict):
        self._mappings = {}
        for mapping in parse_provider_mappings([vars(item) for item in mappings]):
            if (mapping.provider != "eodhd" or mapping.data_kind != "last_trade"
                    or mapping.adjustment != "unadjusted" or mapping.symbol in self._mappings):
                raise CollectorError("invalid_mapping")
            self._mappings[mapping.symbol] = mapping
        if (not isinstance(fixture, dict) or set(fixture) != {"synthetic", "metadata", "responses"}
                or fixture["synthetic"] is not True or not isinstance(fixture["metadata"], dict)
                or not isinstance(fixture["responses"], list)):
            raise CollectorError("invalid_fixture")
        self._metadata = deepcopy(fixture["metadata"])
        self._snapshots = {}
        for row in fixture["responses"]:
            if (not isinstance(row, dict) or not isinstance(row.get("code"), str)
                    or row["code"] not in self._mappings or row["code"] in self._snapshots):
                raise CollectorError("invalid_fixture")
            self._snapshots[row["code"]] = deepcopy(row)

    def fetch(self, symbol: str) -> dict:
        """Read one snapshot without I/O; errors affect only the requested symbol.

        `close` is interpreted solely under the fixture's explicit last-price,
        unadjusted declaration. `previousClose` and `change` never supply a price.
        D2 normalization must subsequently check market time against collection time.
        """
        if symbol not in self._mappings:
            raise ProviderError("invalid_provider_data")
        snapshot = self._snapshots.get(symbol)
        if snapshot is None:
            raise ProviderError("provider_unavailable")
        mapping = self._mappings[symbol]
        metadata = self._metadata.get(symbol)
        expected = {"currency": mapping.reported_currency, "exchange": mapping.exchange,
                    "timezone": mapping.timezone, "quote_type": mapping.quote_type,
                    "price_unit": mapping.price_unit, "data_kind": "last_trade", "adjustment": "unadjusted"}
        if (not isinstance(metadata, dict) or set(metadata) - set(expected) - {"provider_delay_seconds"}
                or any(metadata.get(key) != value for key, value in expected.items())):
            raise ProviderError("invalid_provider_data")
        timestamp = snapshot.get("timestamp")
        delay = metadata.get("provider_delay_seconds")
        if (type(timestamp) is not int or timestamp <= 0
                or delay is not None and (type(delay) is not int or not 0 <= delay <= 86400)):
            raise ProviderError("invalid_provider_data")
        try:
            market = utc(datetime.fromtimestamp(timestamp, timezone.utc))
        except (ValueError, OverflowError, OSError):
            raise ProviderError("invalid_provider_data") from None
        return {"provider": "eodhd", "symbol": snapshot["code"],
                "currency": metadata["currency"], "exchange": metadata["exchange"],
                "timezone": metadata["timezone"], "quote_type": metadata["quote_type"],
                "data_kind": metadata["data_kind"], "adjustment": metadata["adjustment"],
                "price": exact_price(snapshot.get("close")), "market_timestamp": market,
                "provider_delay_seconds": delay,
                "provenance": {"source": "Synthetic EODHD-format snapshot; supplier not qualified",
                               "reference": snapshot["code"]}}
