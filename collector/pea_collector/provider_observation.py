"""Isolated EODHD shadow composition; never imported by active collection."""
from collections import Counter
from datetime import datetime, timezone
from typing import Protocol

from .eodhd_http import RawEodhdResponse
from .eodhd_response import normalize_eodhd_snapshot, parse_eodhd_response
from .model import CollectorError, ProviderError, utc
from .provider_mapping import parse_provider_mappings
from .provider_quota import QuotaStore, UsageSnapshot
from .provider_shadow import FeedPolicy, select_shadow


class SnapshotTransport(Protocol):
    """Existing EodhdHttpClient implements this grouped, no-retry port."""
    def get_quotes(self, symbols: list[str]) -> RawEodhdResponse: ...


def _targets(policies, now):
    if not isinstance(policies, list) or not policies or len(policies) > 80:
        raise CollectorError("invalid_observation_policies")
    parse_provider_mappings([vars(p.mapping) for p in policies])
    groups = {}
    for policy in policies:
        groups.setdefault(policy.mapping.instrument_id, []).append(policy)
    if len(groups) > 20:
        raise CollectorError("invalid_observation_policies")
    for group in groups.values():
        select_shadow(group, [], now)  # Reuse D6's complete policy validation.
    targets = [p for p in policies if p.mapping.provider == "eodhd"]
    if not 1 <= len(targets) <= 17:
        raise CollectorError("invalid_observation_targets")
    for target in targets:
        if (not target.coverage or not target.rights or not target.semantics or not target.allow_delayed
                or target.mapping.data_kind != "last_trade" or target.mapping.adjustment != "unadjusted"):
            raise CollectorError("observation_qualification_required")
    return targets, groups


def observe_response(policies: list[FeedPolicy], response: RawEodhdResponse, received_at: datetime,
                     *, existing: list[dict], previous: dict | None = None) -> dict:
    """Replay a private capture offline through D5/D2/D6 without ingestion.

    Existing rows are caller-supplied Yahoo/cached observations, never fetched here.
    The full returned object contains private data: log ONLY its `summary` value.
    Provenance fixes the endpoint/field semantics without credentials or raw URLs.
    Unknown source delay remains null, independent of observed per-row market age.
    """
    utc(received_at)
    targets, groups = _targets(policies, received_at)
    if not isinstance(existing, list) or (previous is not None and not isinstance(previous, dict)):
        raise CollectorError("invalid_observation_inputs")
    symbols = [p.mapping.symbol for p in targets]
    failure = None
    try:
        snapshots = parse_eodhd_response(response, symbols)
    except ProviderError as error:
        failure = str(error)
        snapshots = {}
    observations = []
    failures = Counter()
    for policy in targets:
        mapping = policy.mapping
        try:
            if failure:
                raise ProviderError(failure)
            row = normalize_eodhd_snapshot(mapping, snapshots.get(mapping.symbol), received_at,
                provenance={"source": "EODHD delayed snapshot close/timestamp; qualified listing context",
                            "reference": None})
        except ProviderError as error:
            reason = str(error) if str(error) in {"provider_unavailable", "rate_limited", "invalid_provider_data"} else "invalid_provider_data"
            failures[reason] += 1
            row = {"instrument_id": mapping.instrument_id, "provider": "eodhd",
                   "price_kind": mapping.data_kind, "adjustment": mapping.adjustment,
                   "outcome": "unavailable", "price": None, "currency": None, "price_unit": None,
                   "market_timestamp": None, "fetched_at": utc(received_at), "session_date": None,
                   "provider_delay_seconds": None, "error_code": reason,
                   "provenance": {"source": "EODHD delayed snapshot retrieval failure", "reference": None}}
        observations.append(row)
    combined = existing + observations
    decisions = []
    for index, instrument in enumerate(sorted(groups)):
        rows = [row for row in combined if isinstance(row, dict) and row.get("instrument_id") == instrument]
        decision = select_shadow(groups[instrument], rows, received_at,
                                 previous=(previous or {}).get(instrument))
        decisions.append({"target_index": index, **decision})
    reasons = Counter(d["reason"] for d in decisions)
    summary = {"event": "provider_shadow_completed", "mode": "observation_only", "policy_version": 1,
               "as_of": utc(received_at), "evaluation_clock": "capture_body_received_at",
               "targets": len(targets), "successes": len(targets) - sum(failures.values()),
               "failures": dict(failures), "decisions": dict(reasons),
               "selection_diagnostics": decisions}
    return {"mode": "observation_only", "private_observations": observations,
            "private_decisions": decisions, "summary": summary}


def capture_shadow(policies: list[FeedPolicy], transport: SnapshotTransport, quota: QuotaStore,
                   usage: UsageSnapshot, operation: str, *, execute: bool = False,
                   existing: list[dict], previous: dict | None = None,
                   save_response, clock=lambda: datetime.now(timezone.utc)) -> dict:
    """Explicit observation execution with durable charge before one grouped call.

    `execute` is an operator confirmation, not a financial authorization. The
    composition is not reachable from active CLI/REST/MCP. `save_response` must
    persist private raw bytes/receipt clocks before offline parsing. A save failure
    leaves the started claim charged; restart must inspect evidence, never refetch.
    """
    now = clock()
    targets, _ = _targets(policies, now)
    if not isinstance(existing, list) or (previous is not None and not isinstance(previous, dict)):
        raise CollectorError("invalid_observation_inputs")
    if type(execute) is not bool or not callable(save_response):
        raise CollectorError("invalid_observation_execution")
    if not execute:
        return {"event": "provider_shadow_planned", "mode": "observation_only", "execute": False,
                "max_units": len(targets), "http_attempts": 1, "automatic_retries": 0}
    reservation = quota.reserve(operation, len(targets), usage, now)
    quota.begin(operation, clock())
    started = clock()
    try:
        response = transport.get_quotes([p.mapping.symbol for p in targets])
    except Exception as error:
        quota.finish(operation, "failed")
        reason = str(error) if isinstance(error, CollectorError) and str(error) in {
            "eodhd_timeout", "eodhd_network_failure", "eodhd_response_too_large"} else "observation_transport_failed"
        raise CollectorError(reason) from None
    received = clock()
    try:
        save_response(response, {"request_started_at": utc(started), "body_received_at": utc(received),
                                 "reserved_units": len(targets)})
    except Exception:
        raise CollectorError("observation_capture_not_saved") from None
    quota.finish(operation, "response_received")
    result = observe_response(policies, response, received, existing=existing, previous=previous)
    result["summary"]["quota"] = reservation
    return result
