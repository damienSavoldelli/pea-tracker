"""Synthetic cycle-session comparison; no yfinance import, HTTP or live mode."""
from copy import deepcopy

from pea_collector.model import ProviderError, parse_mappings
from pea_collector.provider import QuotationProvider
from pea_collector.runner import collect


class SimulatedYahooTransport:
    """Model one setup request/session and one quote request/attempt, not Yahoo HTTP.

    The request trace is deliberately a toy protocol. It does not model Yahoo's
    cookies, crumb, metadata endpoints, rate policy or network request counts.
    """

    def __init__(self, script):
        self.script = deepcopy(script)
        self.requests = []
        self.sessions_created = 0

    def new_session(self):
        """Create cycle-local state and record a simulated setup request."""
        self.sessions_created += 1
        session = {"id": self.sessions_created, "usable": True}
        self.requests.append((session["id"], "setup", None))
        return session

    def get_info(self, session, symbol):
        """Return the next synthetic raw response or explicit per-symbol failure."""
        self.requests.append((session["id"], "quote", symbol))
        outcomes = self.script.get(symbol, [])
        if not outcomes:
            raise ProviderError("provider_unavailable")
        result = outcomes.pop(0)
        if result in ("timeout", "session_failure"):
            session["usable"] = False
            raise TimeoutError()
        if result == "rate_limited":
            raise ProviderError("rate_limited")
        if result == "missing":
            raise ProviderError("provider_unavailable")
        return deepcopy(result)


class SimulatedCycleProvider:
    """Use separate or shared sessions inside one synthetic collection cycle.

    Only sessions are shared: quote responses are never cached. Simulated broken
    sessions are discarded while earlier observations remain owned by the runner.
    This class is not a replacement for the operational process-isolated adapter.
    """

    def __init__(self, transport, *, shared):
        self.transport, self.shared = transport, shared
        self.session = None
        self.attempts = 0

    def fetch(self, symbol: str) -> dict:
        """Keep the production raw-field contract and sanitized error mapping."""
        self.attempts += 1
        if not self.shared or self.session is None:
            self.session = self.transport.new_session()
        try:
            return self.transport.get_info(self.session, symbol)
        except TimeoutError:
            raise ProviderError("provider_unavailable") from None
        finally:
            if not self.shared or not self.session["usable"]:
                self.session = None


def compare_cycles(mappings, script, *, clock_factory):
    """Compare independent runs using existing validation/normalization/retry logic.

    The clock factory must return a fresh deterministic clock for each branch.
    Metrics are explicit: logical calls = requested instruments; attempts include
    runner retries; simulated HTTP requests include model setup/quote events only.
    """
    mappings = parse_mappings([vars(mapping) for mapping in mappings])
    results = {}
    for name, shared in (("individual", False), ("shared", True)):
        transport = SimulatedYahooTransport(script)
        provider: QuotationProvider = SimulatedCycleProvider(transport, shared=shared)
        try:
            payload = collect(mappings, provider, clock=clock_factory(), sleep=lambda _: None)
        finally:
            provider.session = None
        results[name] = {"payload": payload, "logical_calls": len(mappings),
                         "attempts": provider.attempts, "simulated_http_requests": len(transport.requests),
                         "sessions_created": transport.sessions_created, "trace": transport.requests}
    return {"equivalent": results["individual"]["payload"] == results["shared"]["payload"],
            "measurement": "synthetic_model_only", **results}
