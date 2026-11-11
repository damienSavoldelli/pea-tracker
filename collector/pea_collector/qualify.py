"""Qualify public examples offline by default; only --live contacts Yahoo.

The command reports normalization outcomes without recording or printing prices.
It does not establish provider usage rights or complete portfolio coverage.
"""
from datetime import datetime, timezone
import argparse
import json
import sys

from .__main__ import SyntheticProvider
from .model import InstrumentMapping, ProviderError, normalize
from .provider import YFinanceProvider


def main(argv=None):
    """Normalize two public sample shapes, using network retrieval only on request."""
    parser = argparse.ArgumentParser(description="Validate public examples offline by default; --live requires network authorization.", allow_abbrev=False)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true", dest="offline", default=True)
    mode.add_argument("--live", action="store_false", dest="offline")
    arguments = list(sys.argv[1:] if argv is None else argv)
    options = parser.parse_args(arguments[:-1] if arguments and arguments[-1] == "--" else arguments)
    provider = YFinanceProvider(timeout=15)
    # Public representative symbols, NOT a mapping of the owner's holdings.
    for label, symbol, kind in [("public_euronext_equity", "AIR.PA", "EQUITY"), ("public_pea_etf", "WPEA.PA", "ETF")]:
        mapping = InstrumentMapping.parse({"instrument_id": "00000000-0000-4000-8000-000000000001", "symbol": symbol,
                  "currency": "EUR", "reported_currency": "EUR", "price_unit": "currency_unit", "exchange": "PAR",
                  "timezone": "Europe/Paris", "quote_type": kind})
        try:
            raw = SyntheticProvider([mapping]).fetch(symbol) if options.offline else provider.fetch(symbol)
            normalize(mapping, raw, datetime.now(timezone.utc))
            result = "metadata_and_normalization_pass"
        except ProviderError as error:
            result = str(error)
        except Exception:
            result = "qualification_unavailable"
        print(json.dumps({"sample": label, "result": result, "offline": options.offline}))


if __name__ == "__main__":
    main()
