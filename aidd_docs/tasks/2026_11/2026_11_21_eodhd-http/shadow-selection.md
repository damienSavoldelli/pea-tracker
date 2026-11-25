---
status: implemented
---

# V2.0-D6 — Observation-only provider selection and coverage planning

## Scope and completed phase

Owner authorized local shadow selection and preparation of the remaining
20-instrument qualification on `feat/v2.0d-multi-provider`. Phase: **done**.
Preserve preceding uncommitted D5/evidence changes. No staging/commit, branch
creation, merge, main edit, external collection, deployment, ingestion, scheduler
activation, financial data access or change to active collection.

EODHD's three tested instruments remain acquired sample evidence; their captured
payloads and the existing 42 parser tests are not replayed in this slice. Reuse the
[captured qualification and official Free limits](captured-json-qualification.md).
This does not establish the other 17 instruments or unrestricted production rights.

## Implemented boundaries

`collector/pea_collector/provider_shadow.py` contains pure functions only. No existing
active multi-provider router was found. Reuse D2 `ProviderMapping`, its ambiguity/
unit validation, existing normalized observation fields and exact decimal utilities.
No dependency, HTTP transport, repository, CLI, REST/MCP endpoint or migration added.
The new module is imported only by its synthetic tests.

### `select_shadow`

- Caller resolves one instrument and supplies its stored observations, qualified
  per-provider policies, current clock and optional previous selection. Coverage,
  rights and semantics flags represent trusted qualification input, not a new
  authorization mechanism. No production flags are changed.
- Prefer eligible Yahoo; admit EODHD as a delayed intraday secondary only when
  explicitly allowed. Marketstack/Alpha can satisfy only a separate `session_close`
  request, never intraday, even if incorrectly configured as `last_trade`.
- Market/fetch age thresholds come from explicit per-listing policy, not invented
  defaults. Unknown declared delay stays null; observed age is separate. Reuse
  provenance presence and qualified mapping context without echoing arbitrary text.
- Compare source time before fetch time; choose the newest source observation
  within a provider, while retaining primary preference across eligible providers.
  A prior selection supplies a hard source-time floor. A newer previous quote
  cannot be replaced by older Yahoo or secondary data, including after feed rights
  are revoked. Invalid prior clock/identity fails closed rather than removing the
  nonregression guard.
- Quarantine divergent prices sharing one market timestamp, across or within
  providers, using exact Decimal equality. Retain an admissible previous value;
  without one, return unavailable. No arbitrary discrepancy threshold, timestamp
  rewrite or automatic acceptance of a vendor revision. Numerically equal values
  with different decimal formatting are not a conflict.
- No eligible candidate means retain an admissible previous quote with explicit
  unchanged/stale status, or unavailable. A recent fetch never makes an old source
  timestamp fresh. Revoked/unqualified data is not retained as usable.

The result is a hypothetical provider/input-index choice. It does not write a
selected price or recompute portfolio values. Diagnostics whitelist fixed codes,
provider names, input indexes, numeric ages/delay and provenance-presence Boolean.
They exclude symbols, IDs, prices, provenance text/URLs, raw bodies and exception
messages. Examples of reason codes: `primary_eligible`,
`delayed_secondary_eligible`, `stream_mismatch`, `rights_unqualified`,
`market_time_regression`, `equal_time_conflict`, `quota_unknown_or_stale`.
Per-candidate codes explain both rejection and lower priority.

### `free_allowance` and `plan_qualification`

- Free ceilings reuse the existing dated official evidence: EODHD 20 symbol units
  per UTC day and 20 HTTP requests/minute; Marketstack 100 ticker lookups/month;
  Alpha 25 requests/day for the one-symbol quote path. No claimed Yahoo quota or
  unapproved unlimited open-source entitlement.
- Trusted usage snapshots must describe the current UTC period. Missing, invalid
  or stale counters give zero proposed calls. At rollover, require a refreshed
  current-period snapshot; never infer an unused new allowance from old state.
- Caller chooses an explicit symbol/request-unit reserve. HTTP batching does not
  reduce per-symbol daily/monthly cost; EODHD's minute HTTP count is tracked
  separately. Alpha proposals remain single-symbol groups. Unknown vendor ceilings
  are not interpreted as guarantees of unlimited throughput.
- These are read-only forecasts. No counters are reset, reserved or spent. Before
  eventual execution, an atomic durable reservation/reconciliation adapter over
  existing infrastructure is mandatory, including manual/metadata/retry use.
  This slice does not claim cross-process quota enforcement or live metering.
- Stored-quote eligibility is independent of remaining fetch quota. Exhaustion
  prevents proposed calls, not use of an already admissible cached observation.
- Deduplicate identical needs across portfolios using existing mapping identity,
  retain D2's conflict checks, skip acquired samples and gate remaining requests
  on trusted metadata/rights readiness. Group requests only after quota admission.
  Returned request groups are private planning inputs; only the separate count/
  reason diagnostics are suitable for routine logs.

## Prepared complementary coverage qualification

The planner accepts the private canonical instrument/provider mappings; it does not
read the real PEA or fabricate the missing catalogue. For each target, the caller
must supply qualified ISIN/listing/MIC association, unit/currency, provider symbol,
stream/adjustment semantics, rights and an acquired-evidence marker. Reuse existing
trusted metadata and prior response evidence before any new symbol lookup.

Synthetic 20-instrument proof: mark the three EODHD samples acquired, leaving
**17 symbol lookups in one proposed group** when a confirmed current budget permits.
An illustrative reserve of two is test input, not a financial/business default.
With three units already spent that same day and two reserved, only 15 missing
symbols fit; defer two until an independently confirmed budget is available. A
single remaining minute HTTP request can carry those symbol units in one group.
Batching saves HTTP calls, not vendor quota units.

For Marketstack use its separate close stream and monthly budget; reuse its three
sample outcomes. For Alpha reuse its one equity and prepare at most the remaining
19 single-symbol requests if metadata, rights and current budget permit. ETF and
full-catalogue qualification remain open. Daily-label close handling must be settled
before their data can supply actual timestamped observations.

**No request is executable automatically:** output always includes
`mode: observation_only` and `execute: false`. Unknown counters or missing metadata
produce an empty/partial proposal and explicit deferred counts. No paid escalation.

## New targeted evidence — 24 November 2026

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_provider_shadow.py -o addopts='' -q
collector/.venv/bin/python -m py_compile collector/pea_collector/provider_shadow.py collector/tests/test_provider_shadow.py
git diff --check
```

35 new targeted tests passed. They cover primary/
secondary and close-only admission, qualification flags, cache/quota independence,
stale/future/malformed observations, nonregression including revoked previous feeds,
equal-time conflicts, exact freshness boundaries, sanitized diagnostics, exhausted/
unknown counters, day/month rollover, deduplicated 20-instrument proposals,
three acquired samples, metadata deferral and HTTP-versus-symbol accounting.
Existing EODHD sample qualification and prior tests are reused without rerun.
No full suite or external network was run; all inputs are synthetic.

## Remaining gates

Follow-up: [private catalogue review, quota/rights evidence and prepared capture](coverage-readiness.md).
Public candidate presence does not satisfy full provider identity. The prepared
manual recipe does not activate this planner or establish distributed enforcement.

Supply the private 20-instrument metadata/evidence matrix and confirmed account
usage snapshots before authorizing missing calls. Persist/reserve shared quota state
atomically before any future external executor. Review the conservative timestamp-
conflict policy in shadow evidence before activation. No unqualified market calendar,
paid offer, provider fetch on a financial read, or change to V1.1 authentication is
introduced. Actual activation needs separate coverage/rights/capacity acceptance.
