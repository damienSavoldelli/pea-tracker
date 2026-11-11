"""Provide synthetic mappings, fixed clocks and an external-network test guard."""
from datetime import datetime, timezone
import json
from pathlib import Path
import socket

import pytest

from pea_collector.model import parse_mappings


@pytest.fixture(autouse=True)
def no_external_network(monkeypatch):
    """Reject non-loopback socket connections made by the current test process."""
    original = socket.socket.connect

    def connect(sock, address):
        """Preserve local HTTP tests while preventing accidental provider access."""
        if isinstance(address, tuple) and address[0] not in {"127.0.0.1", "::1"}:
            raise AssertionError("External network prohibited in synthetic tests")
        return original(sock, address)

    monkeypatch.setattr(socket.socket, "connect", connect)


@pytest.fixture
def mappings():
    """Load the tracked synthetic example through the production validator."""
    return parse_mappings(json.loads((Path(__file__).parents[1] / "pea_collector/mapping.synthetic.json").read_text()))


@pytest.fixture
def now():
    """Supply a fixed aware clock after the synthetic market observation."""
    return datetime(2026, 11, 10, 12, tzinfo=timezone.utc)


def raw_quote(mapping):
    """Build provider-shaped synthetic metadata matching one explicit mapping."""
    return {"symbol": mapping.symbol, "currency": mapping.reported_currency, "exchange": mapping.exchange,
            "exchangeTimezoneName": mapping.timezone, "quoteType": mapping.quote_type,
            "regularMarketPrice": "12.3400", "regularMarketTime": 1794218400}
