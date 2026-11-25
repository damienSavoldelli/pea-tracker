"""Pure observation-only selection and call planning; no I/O or runtime wiring."""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from .model import CollectorError, exact_price, utc
from .provider_mapping import ProviderMapping, parse_provider_mappings

FREE_LIMITS = {"yahoo": {}, "eodhd": {"day": 20, "minute": 20},
               "marketstack": {"month": 100}, "alphavantage": {"day": 25}}
PRIORITY = {name: rank for rank, name in enumerate(FREE_LIMITS)}


@dataclass(frozen=True)
class FeedPolicy:
    """Trusted per-listing qualification, separate from possession of a quote."""
    mapping: ProviderMapping
    coverage: bool
    rights: bool
    semantics: bool
    max_market_age_seconds: int
    max_fetch_age_seconds: int
    allow_delayed: bool = False


def _time(value):
    if not isinstance(value, str):
        raise ValueError()
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError()
    return parsed


def _policies(policies):
    parsed = parse_provider_mappings([vars(p.mapping) for p in policies])
    if any(p.mapping.provider not in PRIORITY
           or any(type(v) is not bool for v in (p.coverage, p.rights, p.semantics, p.allow_delayed))
           or any(type(v) is not int or v < 0 for v in (p.max_market_age_seconds, p.max_fetch_age_seconds))
           for p in policies):
        raise CollectorError("invalid_shadow_policy")
    return {(m.provider, m.data_kind, m.adjustment): next(p for p in policies if p.mapping == m) for m in parsed}


def select_shadow(policies: list[FeedPolicy], observations: list[dict], now: datetime,
                  *, price_kind: str = "last_trade", previous: dict | None = None) -> dict:
    """Explain a hypothetical selection without returning/logging raw quote data.

    Caller resolves one instrument and supplies its existing observations. Decisions
    contain only fixed codes, provider names, input indexes and numeric ages; never
    echo symbol, provenance text, prices, URLs, tokens or exception messages.
    """
    utc(now)
    if not policies or price_kind not in {"last_trade", "session_close"}:
        raise CollectorError("invalid_shadow_policy")
    lookup = _policies(policies)
    if len({p.mapping.instrument_id for p in policies}) != 1:
        raise CollectorError("invalid_shadow_policy")
    diagnostics, rows = [], []

    def assess(row, index):
        diagnostic = {"input_index": index, "provider": None, "reason": "invalid_observation"}
        diagnostics.append(diagnostic)
        if not isinstance(row, dict):
            return None
        provider = row.get("provider")
        if not isinstance(provider, str) or provider not in PRIORITY:
            return None
        diagnostic["provider"] = provider
        kind, adjustment = row.get("price_kind"), row.get("adjustment")
        if kind != price_kind:
            diagnostic["reason"] = "stream_mismatch"
            return None
        policy = lookup.get((provider, price_kind, "unadjusted"))
        if policy is None:
            diagnostic["reason"] = "not_configured"
            return None
        mapping = policy.mapping
        if adjustment != "unadjusted" or row.get("instrument_id") != mapping.instrument_id:
            diagnostic["reason"] = "identity_or_unit_mismatch"
            return None
        for admitted, reason in ((policy.coverage, "coverage_unqualified"), (policy.rights, "rights_unqualified"),
                                 (policy.semantics, "semantics_unqualified")):
            if not admitted:
                diagnostic["reason"] = reason
                return None
        if provider in {"marketstack", "alphavantage"} and price_kind != "session_close":
            diagnostic["reason"] = "close_only_provider"
            return None
        if provider == "eodhd" and price_kind == "last_trade" and not policy.allow_delayed:
            diagnostic["reason"] = "delayed_not_admitted"
            return None
        if row.get("outcome") != "success":
            diagnostic["reason"] = "observation_unavailable"
            if isinstance(row.get("error_code"), str) and row["error_code"] in {"provider_unavailable", "rate_limited", "invalid_provider_data"}:
                diagnostic["failure_code"] = row["error_code"]
            return None
        if row.get("currency") != mapping.currency or row.get("price_unit") != mapping.price_unit:
            diagnostic["reason"] = "identity_or_unit_mismatch"
            return None
        try:
            if not isinstance(row.get("price"), str):
                raise ValueError()
            price = exact_price(row.get("price"))
            market, fetched = _time(row.get("market_timestamp")), _time(row.get("fetched_at"))
            if market > fetched or fetched > now:
                raise ValueError()
            session = row.get("session_date")
            if session != market.astimezone(ZoneInfo(mapping.timezone)).date().isoformat():
                raise ValueError()
            provenance = row.get("provenance")
            if (not isinstance(provenance, dict) or not isinstance(provenance.get("source"), str)
                    or not provenance["source"].strip()):
                diagnostic["reason"] = "provenance_missing"
                return None
            delay = row.get("provider_delay_seconds")
            if delay is not None and (type(delay) is not int or not 0 <= delay <= 86400):
                raise ValueError()
        except (ValueError, TypeError, CollectorError):
            return None
        market_age, fetch_age = (now - market).total_seconds(), (now - fetched).total_seconds()
        diagnostic.update(market_age_seconds=int(market_age), fetch_age_seconds=int(fetch_age),
                          declared_delay_seconds=delay, provenance_present=True)
        stale = market_age > policy.max_market_age_seconds or fetch_age > policy.max_fetch_age_seconds
        diagnostic["reason"] = "stale" if stale else "eligible"
        return {"index": index, "provider": provider, "market": market, "fetched": fetched,
                "price": price, "stale": stale, "diagnostic": diagnostic}

    baseline = assess(previous, -1) if previous is not None else None
    # Even a revoked previous feed must not authorize a backwards time switch.
    floor = None
    if isinstance(previous, dict) and previous.get("instrument_id") == policies[0].mapping.instrument_id:
        try:
            source, fetched = _time(previous.get("market_timestamp")), _time(previous.get("fetched_at"))
            if (previous.get("price_kind") == price_kind and previous.get("adjustment") == "unadjusted"
                    and source <= fetched <= now):
                floor = source
        except (ValueError, TypeError):
            pass
    if previous is not None and floor is None:
        return {"mode": "observation_only", "policy_version": 1, "status": "unavailable",
                "reason": "previous_clock_or_identity_invalid", "provider": None,
                "input_index": None, "diagnostics": diagnostics}
    for i, row in enumerate(observations):
        candidate = assess(row, i)
        if candidate:
            rows.append(candidate)
    # Equal-source-time price revisions need a decision, not a fabricated new time.
    # Quarantine conflicting declarations across/within providers conservatively.
    all_rows = rows + ([baseline] if baseline else [])
    declarations = {}
    for row in all_rows:
        declarations.setdefault(row["market"], set()).add(Decimal(row["price"]))
    conflicting = {timestamp for timestamp, prices in declarations.items() if len(prices) > 1}
    eligible = []
    for row in rows:
        reason = None
        if floor and row["market"] < floor:
            reason = "market_time_regression"
        elif row["market"] in conflicting:
            reason = "equal_time_conflict"
        elif row["stale"]:
            reason = "stale"
        if reason:
            row["diagnostic"]["reason"] = reason
        else:
            eligible.append(row)
    if baseline and not baseline["stale"] and baseline["market"] not in conflicting:
        eligible.append(baseline)
    chosen = min(eligible, key=lambda r: (PRIORITY[r["provider"]], -r["market"].timestamp(),
                                         -r["fetched"].timestamp(), r["index"])) if eligible else baseline
    if chosen is None:
        status, reason = "unavailable", "no_eligible_observation"
    elif chosen["index"] == -1:
        status, reason = ("stale" if chosen["stale"] else "unchanged"), "retain_previous"
        chosen["diagnostic"]["reason"] = "retained_stale" if chosen["stale"] else "retained_previous"
    else:
        status = "selected"
        reason = "primary_eligible" if chosen["provider"] == "yahoo" else (
            "delayed_secondary_eligible" if price_kind == "last_trade" else "conditional_close_eligible")
        chosen["diagnostic"]["reason"] = "selected"
        for row in eligible:
            if row is not chosen:
                row["diagnostic"]["reason"] = "lower_priority"
    return {"mode": "observation_only", "policy_version": 1, "status": status, "reason": reason,
            "provider": chosen["provider"] if chosen else None,
            "input_index": chosen["index"] if chosen else None, "diagnostics": diagnostics}


def free_allowance(provider: str, usage: dict, now: datetime, *, reserve: int) -> dict:
    """Read trusted current-period counters; never reset unknown/stale state to zero.

    This is only a proposal calculator. A future executor needs atomic durable
    reservations and reconciliation across workers/manual calls before any I/O.
    """
    utc(now)
    if provider not in FREE_LIMITS or type(reserve) is not int or reserve < 0:
        raise CollectorError("invalid_shadow_budget")
    if provider == "yahoo":
        return {"reason": "no_contractual_free_quota", "available": 0, "http_available": 0}
    current = now.astimezone(timezone.utc)
    periods = {"day": current.strftime("%Y-%m-%d"), "month": current.strftime("%Y-%m"),
               "minute": current.strftime("%Y-%m-%dT%H:%M")}
    remaining, http_available = [], None
    for window, limit in FREE_LIMITS[provider].items():
        counter = usage.get(window) if isinstance(usage, dict) else None
        if not isinstance(counter, dict) or counter.get("period") != periods[window]:
            return {"reason": "quota_unknown_or_stale", "available": 0, "http_available": 0}
        used = counter.get("used")
        if type(used) is not int or used < 0:
            return {"reason": "quota_unknown_or_stale", "available": 0, "http_available": 0}
        if window == "minute":
            http_available = max(0, limit - used)
        else:
            remaining.append(max(0, limit - used - reserve))
    available = min(remaining) if http_available != 0 else 0
    return {"reason": "quota_available" if available else "quota_exhausted_or_reserved",
            "available": available, "http_available": http_available}


def plan_qualification(provider: str, mappings: list[ProviderMapping], verified_symbols: set[str],
                       metadata_ready_symbols: set[str], usage: dict, now: datetime, *, reserve: int) -> dict:
    """Prepare bounded future coverage requests; never call or spend a quota.

    Verified symbols are trusted evidence supplied by the caller, not discovered
    here. Metadata gates include ISIN/venue/units/rights and must be resolved first.
    Symbols in returned request groups are PRIVATE execution inputs, not log fields.
    """
    if provider not in {"eodhd", "marketstack", "alphavantage"}:
        raise CollectorError("invalid_shadow_budget")
    # Deduplicate identical per-portfolio needs, but retain D2 ambiguity checks.
    parsed = parse_provider_mappings([vars(m) for m in dict.fromkeys(mappings)])
    kind = "last_trade" if provider == "eodhd" else "session_close"
    targets = [m for m in parsed if m.provider == provider and m.data_kind == kind and m.adjustment == "unadjusted"]
    reused = [m for m in targets if m.symbol in verified_symbols]
    pending = [m for m in targets if m.symbol not in verified_symbols]
    blocked = [m for m in pending if m.symbol not in metadata_ready_symbols]
    ready = [m for m in pending if m.symbol in metadata_ready_symbols]
    allowance = free_allowance(provider, usage, now, reserve=reserve)
    size = 1 if provider == "alphavantage" else 20
    cap = allowance["available"]
    if allowance["http_available"] is not None:
        cap = min(cap, allowance["http_available"] * size)
    selected = ready[:cap]
    groups = [[m.symbol for m in selected[i:i + size]] for i in range(0, len(selected), size)]
    if not pending:
        reason = "samples_already_acquired" if reused else "no_matching_targets"
    elif not ready:
        reason = "metadata_pending"
    elif not selected:
        reason = allowance["reason"]
    elif len(selected) < len(ready):
        reason = "partial_budget_plan"
    else:
        reason = "partial_metadata_plan" if blocked else "qualification_plan_ready"
    return {"mode": "observation_only", "execute": False,
            "request_groups": groups, "symbol_cost": len(selected),
            "diagnostics": {"provider": provider, "reason": reason, "quota_reason": allowance["reason"], "targets": len(targets),
                            "reused_samples": len(reused), "metadata_pending": len(blocked),
                            "budget_deferred": len(ready) - len(selected), "http_groups": len(groups),
                            "available": allowance["available"]}}
