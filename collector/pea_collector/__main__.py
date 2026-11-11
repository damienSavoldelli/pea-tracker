"""Run a synthetic collection cycle or an explicitly approved live ingestion."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

from .http import ClientCredentials, IngestionClient, StaticToken, HttpTransport, checked_url
from .model import CollectorError, parse_mappings
from .provider import YFinanceProvider
from .runner import run


class SyntheticProvider:
    """Generate deterministic provider-shaped data without contacting Yahoo."""

    def __init__(self, mappings):
        """Index the supplied mappings for synthetic metadata responses."""
        self.mappings = {mapping.symbol: mapping for mapping in mappings}

    def fetch(self, symbol):
        """Return a fixed quotation using the selected mapping's metadata."""
        mapping = self.mappings[symbol]
        return {"symbol": symbol, "currency": mapping.reported_currency, "exchange": mapping.exchange,
                "exchangeTimezoneName": mapping.timezone, "quoteType": mapping.quote_type,
                "regularMarketPrice": "12.3400", "regularMarketTime": 1794218400}


def machine_client(environment, *, local=False):
    """Build a dedicated ingestion client from private environment configuration.

    Loopback tests use an injected short-lived token. Live delivery obtains a
    machine token through client credentials, independently of interactive MCP.
    """
    origin = environment.get("COLLECTOR_API_ORIGIN", "")
    if local:
        tokens = StaticToken(environment.get("COLLECTOR_ACCESS_TOKEN", ""))
    else:
        # No human interactive MCP identity, refresh token or Cloudflare credential.
        tokens = ClientCredentials(environment.get("COLLECTOR_TOKEN_URL", ""), environment.get("COLLECTOR_CLIENT_ID", ""),
                                   environment.get("COLLECTOR_CLIENT_SECRET", ""), environment.get("COLLECTOR_AUDIENCE", ""))
    return IngestionClient(origin, tokens, allow_loopback=local)


def main(argv=None, environment=None) -> int:
    """Validate execution gates, run one journaled cycle and emit safe counters.

    Live collection requires all prerequisite flags and a secret mapping. A
    GitHub rerun must retain its original journal rather than fetch a new payload.
    """
    environment = os.environ if environment is None else environment
    parser = argparse.ArgumentParser(description="Synthetic-by-default quotation collector. Logs contain counters only.")
    parser.add_argument("--mode", choices=["synthetic", "live"], default="synthetic")
    parser.add_argument("--mapping", type=Path)
    parser.add_argument("--state", type=Path, default=Path(".collector-state"))
    parser.add_argument("--cycle-id", required=True)
    parser.add_argument("--deliver-local", action="store_true")
    parser.add_argument("--require-existing", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.mode == "live" and args.deliver_local:
            raise CollectorError("live_loopback_forbidden")
        if args.mode == "live" and any(environment.get(name) != "true" for name in (
            "COLLECTOR_PROVIDER_APPROVED", "COLLECTOR_COVERAGE_APPROVED", "COLLECTOR_SECURITY_APPROVED")):
            raise CollectorError("live_prerequisites_missing")
        if args.mode == "live" and args.mapping:
            raise CollectorError("live_mapping_must_use_secret")
        if args.mode == "live":
            raw = environment.get("COLLECTOR_MAPPING_JSON", "")
        else:
            path = args.mapping or Path(__file__).resolve().parent / "mapping.synthetic.json"
            raw = path.read_text()
        if len(raw.encode()) > 32768:
            raise CollectorError("mapping_too_large")
        mappings = parse_mappings(json.loads(raw))
        provider = YFinanceProvider() if args.mode == "live" else SyntheticProvider(mappings)
        client = machine_client(environment, local=args.deliver_local) if args.mode == "live" or args.deliver_local else None
        result = run(mappings, provider, client, args.state, args.cycle_id,
                     require_existing=args.require_existing or environment.get("GITHUB_RUN_ATTEMPT", "1") != "1")
        heartbeat = environment.get("COLLECTOR_HEARTBEAT_URL")
        if args.mode == "live" and not result["unavailable"] and heartbeat:
            status, _ = HttpTransport().post(checked_url(heartbeat), b"", {})
            if status not in {200, 204}:
                raise CollectorError("heartbeat_failed")
        print(json.dumps(result, sort_keys=True))
        return 1 if result["unavailable"] else 0
    except CollectorError as error:
        # CollectorError values are fixed internal codes, never provider exception text.
        print(json.dumps({"event": "cycle_failed", "code": str(error)}))
        return 1
    except Exception:
        print(json.dumps({"event": "cycle_failed", "code": "collector_failed"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
