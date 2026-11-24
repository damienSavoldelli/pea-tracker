---
status: implemented
---

# V2.0-D finalization — observation only

## Owner-approved closure and publication scope — 24 November 2026

The owner accepts **V2.0-D closed in observation mode** and authorizes three coherent
local commits, push of `feat/v2.0d-multi-provider`, and local/remote cleanliness checks.
Coverage evidence: **19/20**, **TNO excluded for directory ISIN divergence**. Measured
campaign consumption: **17/20 base units**, **500 bonus credits intact**. Preserve
**80 acquired tests and 55 complementary passing tests** without unnecessary reruns.
Yahoo stays primary; EODHD is observation-only and equivalence with unadjusted
`last_trade` remains unproven. No new supplier call, main merge, tag, release,
deployment or fallback activation is authorized. Do not touch the separate
`pea-tracker-main` worktree. After D publication, inspect E's branch objects read-only
without switching this worktree or starting E implementation.

Publication consolidation uses three ordered groups: `1665aee` (D5 parser/evidence),
`25aa302` (D6 observation selection), and the observation-composition/closure commit
containing this record. No source behavior or test input was changed during this
consolidation; the acquired 80 and complementary 55 results were reused. Scoped
candidate review found no credential indicator, actual private ISIN/instrument ID,
personal path, raw private file or database artifact among the 27 selected files.
This is a bounded scan/content review, not a universal secret-detection guarantee.
Private captures, account receipts, mappings and operator scripts stay Git-ignored.
Local document links and exact staged snapshots are checked per commit; publication
and synchronization are reported only after the push actually completes.

**Current outcome:** local observation finalization and the authorized real capture/
comparison are complete within the bounded scope below. This status does not admit
EODHD into real valuation, certify unadjusted last-trade equivalence, qualify the
excluded instrument or complete production rollout. Earlier blocked checkpoints
below retain their dated evidence; the successful capture supersedes their input/
budget blockers. The later explicit publication authority above covers the three
commits and branch push only, not a merge, release or deployment.

Owner's inline plan of 24 November is the implementation scope. Existing branch
`feat/v2.0d-multi-provider`, originally the only worktree, starting HEAD `4536f55`. Preserve all
preceding unstaged D5/D6 work. Initially no Git writes, vendor calls or deployment
were authorized; the later bounded vendor authority and capture are recorded below.
At that earlier checkpoint Git writes and deployment remained unauthorized; the
new closure authority supersedes only the commit/push restriction.
Reuse [coverage preparation](coverage-readiness.md), [D6](shadow-selection.md) and
the [resolved feasibility study](../../../backlog/spikes/adaptive-multi-provider-feasibility.md).

## Phases

1. **Done — local quota adapter:** reuse owner-private runner journal locking
   and atomic writes; account-wide claims, current trusted usage, conservative
   failed/interrupted spend, replay refusal and UTC rollover. No shared cloud state
   fabricated; ephemeral Actions files are explicitly insufficient.
2. **Done — observation composition:** connect existing transport/parser/D2/D6
   behind explicit execution and qualification gates; offline replay and structured
   monitoring. No active collector or financial ingress/valuation modification.
3. **Done — targeted checks/review:** new integration and quota tests only,
   dependent existing tests only if their components change. Reuse 80 acquired tests.
4. **Done, with limits — external evidence:** owner reference file/identity confirmation,
   explicit request authorization, 18-unit campaign ceiling and before/after
   counters. No approximate ALXP mapping. Marketstack/Alpha closure streams remain
   conditional, nonblocking. Never mark this phase done from synthetic evidence.
5. **Done — closure record:** docs/memory, coherent commit groups and integration
   criteria; owner accepted closure and authorized the bounded publication above.

## D/E responsibility

D owns provider identity/semantics, explicit observations and hypothetical selection,
per-account reservation port/minimal adapter, no-regression and safe diagnostics.
E owns general collector scheduling/optimization, adaptive due plans, orchestration,
monitor integration and production persistence wiring. D exports reusable functions;
it does not implement a competing scheduler, cloud quota endpoint or active fallback.
The original spike's prospective sequence predates the implemented D1–D6 slices;
this bounded division follows the owner's current finalization instruction.

## Acceptance

New synthetic integration covers exact decimal/time, partial/failure/unknown
observations, qualification-before-I/O, Yahoo precedence, time nonregression,
private data exclusion from diagnostics, concurrent reservations and restart/crash
no-refetch, rollover requiring fresh usage, base allowance and campaign cap.
No API/MCP/REST or active workflow contract changes. Production qualification and
external blockers remain explicit, rather than being counted as local completion.

## Local implementation and current evidence

- `eodhd_reference.py`: bounded offline directory parsing, exact ISIN/code/currency,
  missing/ambiguous data statuses, independent venue evidence and conflict refusal.
  It does not infer MIC from provider exchange code, verify legal documents, or
  grant policy admission. Units/adjustment/rights remain separately reviewed inputs.
- `provider_quota.py`: `QuotaStore` executor port, `UsageSnapshot`, and
  `PrivateQuotaLedger` adapter over runner locking/checksummed atomic persistence.
  Per-account directory must be stable and shared by all cooperating callers.
  Initial observed prior use counts conservatively in the 18-unit campaign (including
  a reference retrieved before ledger bootstrap). Daily charge never decreases on
  refresh; a new UTC day requires current evidence, while operation claims persist.
  No bonus budget, refunds, automatic retry, cloud endpoint or active wiring.
- `provider_observation.py`: D4 → D5 → D2 → D6 connection with qualification before
  I/O, explicit execution, quota claim/start before one HTTP request, private capture
  callback before analysis, isolated missing/invalid rows and safe summary. Requests
  use at most 17 confirmed, non-acquired symbols. Failures retain all reserved units.
  The complete result contains private rows; only `summary` is intended for logs.
- `provider_observe.py`: installed module CLI for offline private-file replay only.
  Bounded owner-only regular inputs, hash-checked body/receipt, explicit source clocks,
  sanitized output and no network/ingestion code. Reports evaluation at capture time,
  not current freshness. Previous selections must be supplied to test cross-run
  monotonicity; these utilities do not add a production selection-history store.

### New targeted test checkpoints

**55 distinct new synthetic cases passed**, across these final file counts:

| Test file | Cases | Evidence |
| --- | ---: | --- |
| `collector/tests/test_provider_quota.py` | 18 | Real filesystem permissions/restart, competing processes, actual child exit after durable start, no replay/refund, reference bootstrap, day rollover and daily/campaign/headroom limits |
| `collector/tests/test_provider_observation.py` | 20 | Actual D4 client with fake opener through quota/parser/normalization/selection; exact decimals, partial and error bodies, Yahoo preference, previous-time floor, safe diagnostics, plan-only, timeout, failed capture and zero automatic retries |
| `collector/tests/test_eodhd_reference.py` | 12 | Exact identity, missing ISIN, wrong currency/exchange, duplicate rows, conflicting venue and no approximate ALXP admission |
| `collector/tests/test_provider_observe_cli.py` | 5 | Private-file replay, tampered body, unsafe permissions, unknown receipt time and actual module subprocess |

```sh
collector/.venv/bin/python -m pytest collector/tests/test_provider_quota.py -o addopts='' -q
collector/.venv/bin/python -m pytest collector/tests/test_provider_observation.py collector/tests/test_provider_observe_cli.py -o addopts='' -q
collector/.venv/bin/python -m pytest collector/tests/test_eodhd_reference.py -o addopts='' -q
```

Final affected-file runs: quota 18 passed; observation/CLI 25 passed; reference
12 passed. Earlier 34/36/4-case checkpoints overlap these counts and are not added.
The first new campaign implementation was corrected to include a manually retrieved
reference in the lifetime campaign ceiling, not just the daily ceiling; targeted
quota/composition checks were rerun after that change. A real transport composition
test was added without rerunning D4's earlier 39 cases. No acquired 80-case suite,
live supplier tests, full Python/TypeScript suite or financial test repeated.
Tests use synthetic inputs and the existing non-loopback socket guard; no vendor,
Access, D1, portfolio or production interaction occurred.

### Review and acceptable limits

See [targeted review](review.md). No active Python entrypoint, scheduled workflow,
TypeScript service, financial migration, dependency or historical V1 contract changed.
No Worker CPU or D1 write overhead is introduced into active operation by these
unwired utilities. Local evidence is not a production benchmark or a real feed
coverage/semantic certification. Raw parser transport bounds remain 64 KiB and
socket timeout, not a hard total deadline; oversized captures fail charged/closed.
Quota journal corruption/pending atomic-write remnants stop rather than recreate
an unused allowance. The private filesystem adapter uses Unix file locking (Mac/
Linux); remote executors must use one atomic shared `QuotaStore`, not artifacts or
separate runner files. E owns that composition and periodic orchestration.

No numeric vendor price-difference tolerance is invented. Current shadow behavior
uses timestamps and equal-time conflict quarantine; actual time-aligned coherence
with Yahoo remains externally unverified. The vendor's latest delayed `close` is
not declared an unadjusted trade solely because its JSON shape parsed successfully.
Marketstack/Alpha stay conditional closing candidates with no transport or production
fallback admission. Their incomplete qualification does not block this local D slice.

## Exact external prerequisites

### Authorized real capture and stored-Yahoo comparison — completed checkpoint

The owner executed the bounded operator recipe once. Private body/receipt and their
hash were verified offline: **16 requested codes, 16 returned, zero missing, HTTP
200**. The same-key usage API measured exactly **16 units** for the grouped request:
base counter 1 → 17 on 24 November, extra balance unchanged. Reference plus group
therefore totals **17/20** base units, within the campaign cap of 18. No bonus was
spent and no retry occurred. Direct account evidence resolves the earlier stale
dashboard uncertainty; it is not necessary to infer an issuer/account malfunction.
The three previously acquired samples were not refetched. Combined catalogue
evidence covers **19 of 20** distinct instruments; the one ISIN conflict remains
excluded, without altering the real catalogue.

The body finished reading at `2026-11-24T15:57:48.764Z`. Existing D5 parsed all
rows with exact decimal decoding; all prices/source timestamps passed the existing
normalization checks **under explicit assumed stream/adjustment context**. Exact
instrument type and unit context came from the independently qualified catalogue
and vendor directory, not names or suffix inference. Quote bodies contain code,
close and source timestamp but **no currency, unit factor, ISIN/MIC, adjustment flag
or declared delay**. Directory/canonical metadata supplies the comparison context;
that must not be represented as fields verified inside each quote body. Declared
delay remains unknown. Market ages are heterogeneous: consistent with delayed data,
not a uniform or guaranteed fifteen-minute feed. Preserve individual row clocks.

Exactly **16 read-only MCP `get_quotation_status` calls** retrieved the existing
Yahoo unadjusted last-trade streams, one per confirmed target. These read stored
observations; no Yahoo supplier fetch, ingestion, portfolio read or financial write
was performed. All 16 have usable quote values with matching contextual EUR/unit
conventions. Comparison used exact Decimal prices and retained each source/fetch
clock. Fifteen EODHD source timestamps are newer than the stored Yahoo source;
one is older and must not replace it. **No pair has identical source timestamps**:
price differences are therefore asynchronous comparisons, not direct evidence of
feed error or equality. No numerical rejection tolerance was invented.

Individual prices, original timestamps, derived numerical price gaps, identities
and comparison rows remain in owner-only ignored artifacts. Public records retain
only operational/qualification counts and qualitative findings, not a market dataset
or actual-portfolio list. Replaying this new real capture is data qualification,
not a rerun of the acquired 80/55 synthetic tests; none were repeated.

**Nature/compatibility limit:** the [vendor endpoint documentation](https://eodhd.com/financial-apis/live-ohlcv-stocks-api)
defines `close` as its latest delayed price and `timestamp` as quote time. Its
[general data disclaimer](https://eodhd.com/financial-apis/user-api) describes indicative
aggregated pricing, not an exchange execution guarantee. These observations alone
do not prove equality with Yahoo's `regularMarketPrice`/`regularMarketTime` or this
domain's unadjusted last-trade stream. Technical normalization under assumptions
does not turn `semantics` admission true. Keep that gate closed for real valuations;
the result is suitable for private observation/diagnostics and selective-feed study.

**Recommended closure:** retain this bounded D observation increment, document the
excluded identity and semantic limit, and prepare its already proposed commit groups
for owner review. E can reuse the ports and diagnostics without activating fallback.
No further quota spend, new providers or broad test campaign is justified by this
successful checkpoint. Production activation still requires separate semantic,
shared-persistence/capacity and authorization gates.

### Archived MIC evidence recovered and same-key metering gate

The owner supplied actual dashboard values observed at 16:30 Europe/Paris on
24 November: used 9/20, last activity 23 November, extras 500 and data available.
These replace the earlier placeholders but still show a prior-day counter after
the successful reference lookup reported that afternoon. Lazy midnight-GMT reset
explains an idle account's old display, but does not by itself reconcile that
specific sequence with the documented one-unit directory lookup. Do not declare
zero measured spend today, a different account, or a supplier failure from this
observation alone. Read the free usage endpoint with the same key before capture.

Further **offline reuse of existing metadata** located the archived source catalogue
and its broker-source fields: exact ISIN, canonical MIC and quote currency, plus
the already verified provider symbol/unit mapping. All 15 pending XPAR targets
match uniquely against those independent source fields and the newly downloaded
EODHD directory. Fourteen had passed the earlier normalization checkpoint; one
earlier Yahoo venue-search ambiguity is supplemented by the subsequent verified
catalogue/mapping record. That historical Yahoo issue is not fabricated EODHD price
evidence. No calendar continuous/fixing profile is inferred or required just to
confirm listing identity. No new official per-instrument export was downloaded;
the independent venue evidence here is the already qualified broker-source
metadata, not a newly claimed exchange certificate.

**Updated remaining-target classification: 16 exact ISIN/code/MIC/currency identity
mappings, one ISIN conflict excluded.** Preserve the independent ALXP proof and
the conflict unchanged. Private evidence rows remain owner-only/ignored. These
identity mappings do not certify actual EODHD quote coverage, exchange-trade venue,
raw/adjusted meaning, timeliness or Yahoo price equivalence.

Official [User API documentation](https://eodhd.com/financial-apis/user-api) defines
the account counter/date/base/extra fields; the supplier's
[metering walkthrough](https://course.eodhd.com/lessons/tool-first-data-and-meter)
explicitly prices `/user` at **zero API units**. It also warns against exposing
the raw account object (identity/payment/invite fields). A private supervised
operator recipe is prepared: one zero-unit same-key usage read, conditional one
16-unit grouped snapshot, one zero-unit usage read for actual debit comparison.
Only numeric counters/date and observation clock are retained. It requires the
reviewed Free base limit/extra balance, withholds two daily units, conservatively
includes the already retrieved reference, reserves persistently before the sole
quote attempt, disables redirect/proxy and uses the installed verified CA bundle.
It never buys credits or retries the quote. Counter delay, day rollover or failed
post-read leaves measured cost unknown rather than inventing it.

The agent has no `EODHD_API_TOKEN` available in its process. No credential/history/
secret file was read to obtain one. Execution therefore requires the owner to run
the prepared command and enter the same key privately in the terminal. Only plan
mode was executed locally; it printed 16 quote units / 17 campaign units including
the reference, `execute:false`. No acquired tests rerun. No new Yahoo read is made
before there is an EODHD body to compare: subsequent comparison should use stored
Yahoo observations through the existing read interface, not trigger a provider fetch.

**Current blocker:** secure operator execution plus same-key current account
evidence, not the 15 MIC proofs. Full data-quality qualification and actual billing
measurement remain pending. The conditional group authority is recorded; no new
general approval is needed if the exact stated conditions pass.

### Conditional collection instruction — subsequent offline checkpoint

The owner conditionally authorized one grouped capture only after establishing its
cost and available quota. The accompanying usage fields still contain placeholders;
they are **not account evidence** and do not authorize execution under that condition.
No extra-credits purchase or consumption, retry, Yahoo API request or EODHD quote
request has been made in this checkpoint.

Reused the existing private directory and venue evidence offline, without replaying
the acquired tests or original supplier captures. Classification remains: 1 exact
identity/venue confirmation retained, 15 exact ISIN/code/currency matches pending
independent venue evidence, 1 excluded ISIN conflict. Reviewed the existing mapping
and calendar records: admitted venue-wide closure evidence does not establish a
new provider-specific instrument/listing mapping; missing continuous/fixing mode
must not be confused with the narrower MIC identity check either. No new official
per-instrument MIC export was identified in the authorized JSON-file inventory;
this is not a search of other personal folders or proof none exists elsewhere.

A private `execute:false` plan now separates current metadata admission from a
hypothetical complete nonconflicting group. If the 15 venue proofs are completed,
16 remaining symbols (excluding the conflict and three acquired samples) cost
**16 published API units in one HTTP attempt**, not one unit. With the one-unit
reference, forecast campaign cost is **17**, below the 18-unit cap; a measured
before/after counter is still required. The local two-unit daily headroom would
admit that group only with at most two already charged units that UTC day, fresh
trusted usage and all other account consumers coordinated. Bonus credits are
excluded from admission. No partial one-symbol request is spent merely to show
activity while the remaining reference evidence is missing.

Current quote quality/coherence status: **unverified for the missing instruments**.
No new EODHD body exists to compare with stored Yahoo values. The three prior
samples remain sample evidence; neither directory rows nor a filename provide
new market prices, adjustment guarantees, market timestamps or exact trade delay.
No threshold for a significant price gap is invented. Compare exact identities,
streams, units and source times before interpreting a numeric gap; a delayed
EODHD snapshot versus a later Yahoo trade is not a simultaneous-price comparison.

**Execution blockers:** actual refreshed usage/date/bonus values, independent
listing evidence for the 15 pending targets, and remaining semantic/unit admission.
Continue only after these satisfy the conditional authority. Do not change the
catalogue to fit the supplier's conflicting row. Full D qualification remains
blocked; production, D1 and active Yahoo collection remain untouched.

Reference milestone, 24 November: owner executed the corrected reference command
and reported 1,378 rows with local body-read completion at
`2026-11-24T15:12:37.654075+00:00`. The authorized private file was inspected offline:
210,407 bytes, JSON array, no credential-key/value indicators detected by a bounded
scan (not a general guarantee). Of the 17 remaining catalogue candidates, 16 match
exact ISIN/code/currency; one ETF's provider directory ISIN differs and the expected
ISIN has no other directory row. Exclude that candidate without changing the real
catalogue or guessing a replacement. The reference carries no MIC field.

The previously unresolved ALXP candidate matches exact ISIN/code/currency in the
directory and has independent Euronext indexed listing evidence explicitly associating
the same ISIN/ticker with ALXP. The [Growth list](https://live.euronext.com/fr/products/equities/growth/list)
is the public source; private tuple/evidence records remain ignored and owner-only.
The dynamic opened page did not reproduce all indexed table rows, so retain the
indexed evidence boundary; no quote coverage, freshness or price-unit convention
is established by this metadata result. Current offline classification: one exact
identity/venue confirmation, 15 pending venue evidence, one ISIN conflict. Refreshed
account counter/date/bonus and quote execution authority remain pending. No quote
request, acquired test rerun, valuation change or Git operation was performed.

Operator follow-up: the first manual reference attempt failed with an empty private
file; its generic handler did not retain a precise exception. Offline inspection
found zero default CA certificates in the installed Python SSL context; existing
certifi provides a verified context with 118 CA certificates. This is a concrete
TLS configuration issue and plausible failure cause, not proof of the discarded
request exception. The owner supplied an unchanged prior-day dashboard count and
bonus balance. The corrected reference recipe uses the already installed CA bundle,
preserves HTTPS verification and reports only safe HTTP/network error categories.
It has been syntax-checked, not executed by the agent. No package install, acquired
test rerun or quota spend was performed for this correction. Real capture remains
pending; do not mark it complete from unchanged dashboard evidence.

1. Owner executes the one-unit reference recipe or supplies an existing reference;
   give its local path and refreshed counter/date/extras, never an API key. This
   request was presented asynchronously while local implementation continued.
2. Review exact reference and independent venue/unit/semantics evidence; leave
   ambiguous/absent rows explicitly excluded. Never spend quote quota probing an
   approximate ALXP symbol. Build trusted private policy declarations only after
   those gates; Booleans in a file are not independent supplier proof.
3. Obtain explicit authority for one group of confirmed remaining symbols. At most
   17 quote units plus one reference = 18. No unbudgeted metadata requests or retries.
   Recheck current base allowance and coordinate all account consumers first.
4. Capture body/receipt, before/after dashboard counters and bonus balance; replay
   offline and classify actual coverage, clock, precision and provenance. Current
   three sample responses remain acquired, not retried. If one snapshot cannot
   establish a feed attribute or Yahoo coherence, retain that qualification limit.

## Coherent commit groups — publication authorized

1. `feat(collector): parse EODHD snapshots with qualified context` — D5 parser,
   42 parser tests, three structure tests, response/captured/external PoC records.
2. `feat(collector): explain provider selection in observation mode` — D6 pure
   selector/budget planner, its 35 acquired tests and shadow-selection record.
3. `feat(collector): compose bounded EODHD observation qualification` — new reference,
   quota, observation and offline CLI modules, their 55 targeted cases, README,
   coverage/finalization/review records and consolidated roadmap/memory links.

The owner explicitly authorized these three groups. Each commit must include only its coherent
scope and necessary documentary links, with no dangling references to a later
uncommitted group; inspect the complete diff and index under the local commit skill.
Earlier proposal-only status is superseded by the
bounded owner authorization at the top of this record.

## Integration criteria for A/B/C/D/E

- D imports no portfolio registry/journal/approval internals: share observations by
  instrument/provider stream, not per portfolio; retain exact V1 quote contracts.
- A/B/C integration must preserve owner/isolation/active-status checks, historical
  journal/receipts and the V1.1.4 two-channel authentication correction unchanged.
- E injects source clock, trusted policy/reference version, previous selection and
  shared quota authority. It reuses D's ports/decisions rather than implementing a
  second router, retry budget or nonregression rule. Quota alone never grants rights.
- Prove targeted V1 compatibility after actual branch integration; today's isolated
  Python tests are not that future integration run. Bound grouping/capture volume,
  shared storage accounting and cloud budgets before any activation.
- Remain observation-only until explicit coverage/rights/semantics/capacity acceptance
  and separate activation authority. No main merge, release or deployment is implied.

**Closure state:** local observation implementation, targeted checks, authorized
capture and stored-provider comparison complete with the exclusions/limits above.
The bounded plan is `implemented`; production stream admission and rollout are
not qualified or authorized. The owner accepted this closure and authorized the
three commits and branch push, without broadening runtime or deployment scope.
