"""Only new shadow selection/budget/coverage behavior; no supplier/parser replay."""
from dataclasses import replace
from datetime import timedelta
import json

import pytest

from pea_collector.model import CollectorError
from pea_collector.provider_mapping import ProviderMapping
from pea_collector.provider_shadow import FeedPolicy, select_shadow, free_allowance, plan_qualification


@pytest.fixture
def policies(mappings):
    base = {**vars(mappings[0]), "exchange": "XPAR", "data_kind": "last_trade", "adjustment": "unadjusted"}
    return [FeedPolicy(ProviderMapping.parse({**base, "provider": provider}), True, True, True,
                       120 if provider == "yahoo" else 1200, 120, provider == "eodhd")
            for provider in ("yahoo", "eodhd")]


def quote(policy, now, *, age=60, fetched_age=10, price="12", **updates):
    def stamp(age):
        return (now - timedelta(seconds=age)).isoformat()
    row = {"instrument_id": policy.mapping.instrument_id, "provider": policy.mapping.provider,
           "price_kind": policy.mapping.data_kind, "adjustment": "unadjusted", "outcome": "success",
           "currency": policy.mapping.currency, "price_unit": policy.mapping.price_unit, "price": price,
           "market_timestamp": stamp(age), "fetched_at": stamp(fetched_age), "session_date": now.date().isoformat(),
           "provider_delay_seconds": None, "provenance": {"source": "Synthetic quote", "reference": None}}
    return {**row, **updates}


def counters(now, *, day=0, month=0, minute=0):
    return {"day": {"period": now.strftime("%Y-%m-%d"), "used": day},
            "month": {"period": now.strftime("%Y-%m"), "used": month},
            "minute": {"period": now.strftime("%Y-%m-%dT%H:%M"), "used": minute}}


def test_primary_is_preferred_and_no_call_budget_is_consumed(policies, now):
    rows = [quote(policies[0], now), quote(policies[1], now, age=900)]
    before = json.dumps(rows)
    decision = select_shadow(policies, rows, now)
    assert decision["provider"] == "yahoo" and decision["reason"] == "primary_eligible"
    assert decision["mode"] == "observation_only" and json.dumps(rows) == before
    assert free_allowance("eodhd", counters(now, day=20), now, reserve=0)["available"] == 0
    assert select_shadow(policies, [rows[1]], now)["provider"] == "eodhd"


def test_delayed_backup_and_structured_ages_without_relabeling(policies, now):
    rows = [quote(policies[0], now, age=300), quote(policies[1], now, age=950)]
    result = select_shadow(policies, rows, now)
    assert result["reason"] == "delayed_secondary_eligible"
    assert result["diagnostics"][0]["reason"] == "stale"
    assert result["diagnostics"][1]["market_age_seconds"] == 950
    assert result["diagnostics"][1]["declared_delay_seconds"] is None


@pytest.mark.parametrize("field,reason", [("coverage", "coverage_unqualified"), ("rights", "rights_unqualified"),
                                        ("semantics", "semantics_unqualified"), ("allow_delayed", "delayed_not_admitted")])
def test_secondary_gates_fail_closed(policies, now, field, reason):
    gated = replace(policies[1], **{field: False})
    result = select_shadow([policies[0], gated], [quote(gated, now, age=900)], now)
    assert result["status"] == "unavailable" and result["diagnostics"][0]["reason"] == reason


@pytest.mark.parametrize("provider", ["marketstack", "alphavantage"])
def test_close_sources_never_satisfy_intraday_even_if_misconfigured(policies, now, provider):
    close = replace(policies[0], mapping=replace(policies[0].mapping, provider=provider, data_kind="session_close"))
    assert select_shadow([close], [quote(close, now)], now)["diagnostics"][0]["reason"] == "stream_mismatch"
    fake = replace(close, mapping=replace(close.mapping, data_kind="last_trade"))
    assert select_shadow([fake], [quote(fake, now)], now)["diagnostics"][0]["reason"] == "close_only_provider"
    result = select_shadow([close], [quote(close, now)], now, price_kind="session_close")
    assert result["reason"] == "conditional_close_eligible"


def test_recent_previous_blocks_older_primary_and_survives_missing_primary(policies, now):
    previous = quote(policies[1], now, age=30)
    result = select_shadow(policies, [quote(policies[0], now, age=60)], now, previous=previous)
    assert result["input_index"] == -1
    assert result["diagnostics"][1]["reason"] == "market_time_regression"
    primary = quote(policies[0], now)
    assert select_shadow(policies, [quote(policies[1], now, age=900)], now, previous=primary)["provider"] == "yahoo"


def test_revoked_baseline_is_not_reused_or_replaced_by_older_quote(policies, now):
    previous = quote(policies[1], now, age=30)
    gated = [policies[0], replace(policies[1], rights=False)]
    result = select_shadow(gated, [quote(policies[0], now, age=60)], now, previous=previous)
    assert result["status"] == "unavailable"
    assert result["diagnostics"][1]["reason"] == "market_time_regression"


def test_stale_baseline_retained_and_newer_fresh_quote_can_replace_it(policies, now):
    old = quote(policies[0], now, age=1300)
    assert select_shadow(policies, [], now, previous=old)["status"] == "stale"
    assert select_shadow(policies, [quote(policies[1], now, age=900)], now, previous=old)["provider"] == "eodhd"


def test_equal_time_revision_quarantined_without_new_time(policies, now):
    baseline = quote(policies[0], now)
    revised = quote(policies[0], now, price="13")
    result = select_shadow(policies, [revised], now, previous=baseline)
    assert result["input_index"] == -1 and result["reason"] == "retain_previous"
    assert result["diagnostics"][1]["reason"] == "equal_time_conflict"
    assert select_shadow(policies, [baseline, revised], now)["status"] == "unavailable"
    equal = quote(policies[1], now, price="12.00")
    assert select_shadow(policies, [equal, baseline], now)["provider"] == "yahoo"


def test_latest_source_time_wins_within_provider_not_latest_fetch(policies, now):
    result = select_shadow(policies, [quote(policies[0], now, age=80, fetched_age=1),
                                       quote(policies[0], now, age=40, fetched_age=20)], now)
    assert result["input_index"] == 1


def test_freshness_threshold_does_not_truncate_fractional_age(policies, now):
    assert select_shadow(policies, [quote(policies[0], now, age=120)], now)["status"] == "selected"
    assert select_shadow(policies, [quote(policies[0], now, age=120.5)], now)["status"] == "unavailable"
    assert select_shadow(policies, [quote(policies[1], now, age=950, fetched_age=121)], now)["status"] == "unavailable"


def test_invalid_previous_clock_cannot_remove_the_nonregression_guard(policies, now):
    previous = quote(policies[0], now, market_timestamp="invalid")
    result = select_shadow(policies, [quote(policies[1], now, age=900)], now, previous=previous)
    assert result["reason"] == "previous_clock_or_identity_invalid" and result["status"] == "unavailable"


@pytest.mark.parametrize("updates", [{"currency": "USD"}, {"price_unit": "hundredth_currency_unit"},
    {"instrument_id": "other"}, {"market_timestamp": "2026-11-10"}, {"price": 12.0},
    {"market_timestamp": "2099-01-01T00:00:00Z"}, {"session_date": "2026-11-09"},
    {"provenance": {}}, {"outcome": "unavailable"}])
def test_bad_observations_never_selected(policies, now, updates):
    assert select_shadow(policies, [quote(policies[0], now, **updates)], now)["status"] == "unavailable"


def test_diagnostics_do_not_echo_untrusted_text_or_private_inputs(policies, now):
    secret = "SYNTHETIC-SENSITIVE-CONTENT"
    row = quote(policies[0], now, provenance={"source": secret, "reference": "https://invalid/?token=" + secret})
    result = select_shadow(policies, [row, {"provider": secret, "error": secret}], now)
    text = json.dumps(result)
    assert secret not in text and policies[0].mapping.instrument_id not in text
    assert "https://" not in text and "price" not in text


def test_unavailable_observation_reports_failure_not_missing_quote_units(policies, now):
    failure = quote(policies[0], now, outcome="unavailable", currency=None, price_unit=None,
                    price=None, market_timestamp=None, session_date=None, error_code="rate_limited")
    result = select_shadow(policies, [failure, quote(policies[1], now, age=900)], now)
    assert result["provider"] == "eodhd"
    assert result["diagnostics"][0]["reason"] == "observation_unavailable"
    assert result["diagnostics"][0]["failure_code"] == "rate_limited"


def test_policy_cannot_mix_instruments_or_unknown_providers(policies, now):
    for bad in (replace(policies[1], mapping=replace(policies[1].mapping, provider="other")),
                replace(policies[1], mapping=replace(policies[1].mapping, instrument_id="00000000-0000-4000-8000-000000000009"))):
        with pytest.raises(CollectorError):
            select_shadow([policies[0], bad], [], now)


def test_quota_caps_reserves_and_unknown_periods(now):
    assert free_allowance("eodhd", counters(now), now, reserve=2)["available"] == 18
    assert free_allowance("eodhd", counters(now, minute=20), now, reserve=0)["available"] == 0
    assert free_allowance("marketstack", counters(now, month=95), now, reserve=5)["available"] == 0
    assert free_allowance("alphavantage", counters(now), now, reserve=2)["available"] == 23
    assert free_allowance("yahoo", {}, now, reserve=0)["reason"] == "no_contractual_free_quota"
    assert free_allowance("eodhd", {}, now, reserve=0)["reason"] == "quota_unknown_or_stale"


def test_day_and_month_rollover_need_refreshed_counters_not_assumed_reset(now):
    tomorrow = now + timedelta(days=1)
    assert free_allowance("alphavantage", counters(now, day=25), tomorrow, reserve=0)["available"] == 0
    assert free_allowance("alphavantage", counters(tomorrow), tomorrow, reserve=0)["available"] == 25
    next_month = now.replace(month=12)
    assert free_allowance("marketstack", counters(now, month=100), next_month, reserve=0)["available"] == 0
    assert free_allowance("marketstack", counters(next_month), next_month, reserve=0)["available"] == 100


@pytest.mark.parametrize("used", [-1, True, "0"])
def test_invalid_quota_counters_do_not_authorize_proposed_calls(now, used):
    assert free_allowance("alphavantage", counters(now, day=used), now, reserve=0)["available"] == 0


def target_mappings(policy, count=20):
    return [replace(policy.mapping, instrument_id=f"00000000-0000-4000-8000-{i:012d}", symbol=f"SYNTHETIC-{i}.PA")
            for i in range(1, count + 1)]


def test_coverage_plan_reuses_three_acquired_samples_and_groups_only_17(policies, now):
    targets = target_mappings(policies[1])
    known = {m.symbol for m in targets[:3]}
    ready = {m.symbol for m in targets}
    plan = plan_qualification("eodhd", targets + targets, known, ready, counters(now), now, reserve=2)
    assert plan["execute"] is False and plan["symbol_cost"] == 17
    assert len(plan["request_groups"]) == 1 and len(plan["request_groups"][0]) == 17
    assert not known.intersection(plan["request_groups"][0])
    assert plan["diagnostics"]["reused_samples"] == 3 and plan["diagnostics"]["targets"] == 20
    assert plan["diagnostics"]["reason"] == "qualification_plan_ready"
    # One remaining HTTP request can still carry 17 billable symbol units.
    near_minute_limit = plan_qualification("eodhd", targets, known, ready,
                                           counters(now, minute=19), now, reserve=2)
    assert near_minute_limit["symbol_cost"] == 17 and len(near_minute_limit["request_groups"]) == 1


def test_plan_defers_missing_metadata_and_budget_without_spending(policies, now):
    targets = target_mappings(policies[1])
    usage = counters(now, day=3)
    before = json.dumps(usage)
    plan = plan_qualification("eodhd", targets, {m.symbol for m in targets[:3]},
                              {m.symbol for m in targets[:-1]}, usage, now, reserve=2)
    assert plan["symbol_cost"] == 15
    assert plan["diagnostics"]["metadata_pending"] == 1 and plan["diagnostics"]["budget_deferred"] == 1
    assert json.dumps(usage) == before
    assert not plan_qualification("eodhd", targets, set(), set(), {}, now, reserve=0)["request_groups"]
    ready = {m.symbol for m in targets}
    all_metadata = plan_qualification("eodhd", targets, {m.symbol for m in targets[:3]}, ready,
                                      usage, now, reserve=2)
    assert all_metadata["symbol_cost"] == 15 and all_metadata["diagnostics"]["budget_deferred"] == 2
    close_targets = [replace(m, provider="marketstack", data_kind="session_close") for m in targets]
    monthly = plan_qualification("marketstack", close_targets, {m.symbol for m in targets[:3]}, ready,
                                 counters(now, month=90), now, reserve=5)
    assert monthly["symbol_cost"] == 5 and monthly["diagnostics"]["budget_deferred"] == 12
    assert monthly["diagnostics"]["reason"] == "partial_budget_plan"
    no_calls = plan_qualification("eodhd", targets, ready, ready, {}, now, reserve=0)
    assert no_calls["diagnostics"]["reason"] == "samples_already_acquired" and not no_calls["request_groups"]


def test_alpha_closing_qualification_is_not_batched_as_one_quota_unit(policies, now):
    close = replace(policies[0], mapping=replace(policies[0].mapping, provider="alphavantage", data_kind="session_close"))
    targets = target_mappings(close)
    plan = plan_qualification("alphavantage", targets, {targets[0].symbol}, {m.symbol for m in targets},
                              counters(now), now, reserve=2)
    assert plan["symbol_cost"] == 19 and len(plan["request_groups"]) == 19
    assert all(len(group) == 1 for group in plan["request_groups"])
