# V2.0-D — External provider PoC evidence and integration gaps

Recorded 24 November 2026 on `feat/v2.0d-multi-provider`. Scope: documentation,
targeted source comparison and public official documentation. No provider request,
test rerun, credential access, catalogue/portfolio read, deployment or runtime edit.

Subsequent local delivery: [D5 isolated parser and synthetic tests](response-parser.md).
That later slice implements the parser step proposed below; this report preserves
the earlier external-evidence boundary and does not claim those payloads were tested.

## Evidence supplied by the owner

The owner reports tests performed on a professional Mac on **23 November 2026**,
outside this repository. All three providers returned HTTP 200. The following are
public market-data test samples, not holdings, transactions or portfolio valuations.
At this initial checkpoint, raw responses, exact endpoint/version, entitlement,
receipt times and request counts were not supplied. The later
[captured-file and Free-plan qualification](captured-json-qualification.md) supersedes
those missing-body/plan limits. Actual prices and raw vendor timestamps are omitted
from this public report; only qualitative sample evidence is retained.

| Provider | Reported samples, EUR | Observed behavior and bounded conclusion |
| --- | --- | --- |
| EODHD | Three public equity/ETF test symbols | Changing delayed snapshots reported; supports sample candidacy, not catalogue-wide or production admission. |
| Marketstack | Three public equity/ETF test symbols | Historical closes dated 20 November, unchanged between passes; not recent intraday quotations. |
| Alpha Vantage | One public equity test symbol | Historical close dated 20 November; ETFs were not tested in this campaign. |

The initial report provided minute-separated Unix source times, without receipt
measurements or complete per-symbol associations. The later captured-file review
qualifies these distinctions. Approximately 15-minute delay was initially
owner-reported; unchanged historical closes are not evidence of provider failure.

This campaign supplements the differently dated
[D1 supplier reports](../2026_11_21_provider-abstraction/plan.md#phase-1--supplier-evidence-done).
It neither erases earlier reports nor upgrades Alpha Vantage's coverage in this
campaign. Cross-provider price differences here compare different market times;
they do not measure accuracy or prove independent upstream sources.

## Fit with implemented components

| Existing component | Verified capability | Remaining integration |
| --- | --- | --- |
| `collector/pea_collector/provider.py`, `runner.py`, `__main__.py` | Structural `fetch(symbol)` boundary; Yahoo live composition, bounded retry, immutable delivery/replay | Live runner still uses Yahoo-shaped `normalize()` and Yahoo selectors. Injecting secondary data into it would misinterpret/reject data; no generic live routing exists. |
| `provider_mapping.py` | Explicit N-provider mappings and neutral normalization; separate `last_trade`/`session_close`, unadjusted only; exact price/unit/time/provenance checks | Trusted ISIN/listing/MIC association and real response metadata are not supplied by parsing a mapping. It is not wired into live collection. |
| `eodhd_http.py` | Bounded raw HTTP bytes/status/content type, no automatic retry, no redirects, no token/body logging | Actual endpoint/version and response envelope must be matched to the external PoC. Needs a production response parser and qualified context before neutral normalization. Socket timeout is not a total request/cycle deadline. |
| `eodhd_fixture.py` | Offline EODHD-shaped snapshots exercise the neutral contract | Explicit synthetic marker/context and synthetic provenance make it unsuitable for direct live reuse. Reuse field-validation ideas, not invented fixture metadata or provenance. |
| `src/domain/quotations.ts`, `src/application/quotations.ts`, D1 quotation adapter | Provider/type/adjustment-scoped immutable observations, exact-unit checks, market/fetch timestamps, receipts and explicit ingestion grants | Storage accepts `session_close` separately, but successful records require a genuine timestamp and session date. A daily date alone cannot be promoted to midnight or an assumed exchange close. No cross-provider selection is implemented. |
| `src/entrypoints/access-collector.ts` | Distinct explicit provider/instrument grants can share an instrument | Local validator capability only; no secondary grant or provider is activated by these tests. |
| Valuation, calendar, scheduling and monitoring | Explicit quote stream selection; bounded calendar knowledge; existing Cloudflare dispatch → GitHub Python → authenticated ingestion | No automatic fallback, durable quota/health policy, adaptive per-provider due plan or shadow selector. Existing freshness limits are not automatically suitable for a delayed secondary stream. |

No Marketstack or Alpha Vantage adapter is present in the inspected collector.
The [D2](../2026_11_21_provider-mappings/plan.md),
[D3](../2026_11_21_eodhd-fixture-adapter/plan.md),
[D4](plan.md) and [grant](../2026_11_21_multi-provider-grants/plan.md)
local test evidence remains valid for its documented snapshots; it was not rerun
or relabelled as testing these external responses.

## Only the remaining qualification gates

1. **Coverage and identity:** complete a private 20-instrument matrix using existing
   catalogue mappings: canonical ID/ISIN, provider symbol, actual listing/MIC,
   currency/unit, instrument type, endpoint and result. Reuse the three successful
   samples; request only missing instruments/fields. Suffix conversion is not proof
   of identity. Do not publish the private catalogue or infer ALXP trading modes.
2. **Entitlement, quotas and rights:** record the actual tested plan, per-symbol
   metering including batching/retries, daily/minute/monthly caps, overage stops,
   taxes and recurring cost. Confirm exchange/ETF coverage, durable D1 retention,
   private cloud/MCP/AI use and permitted display; credentials remain private.
   Prior study prices are dated estimates, not a new quote or purchase approval.
3. **Price and time semantics:** inspect existing redacted response shapes before
   more calls. Preserve numeric lexemes with decimal JSON parsing; do not round-trip
   through binary floats. Establish venue/source, units, raw/adjusted meaning,
   quote versus bar/close semantics, Unix seconds versus milliseconds, timezone and
   per-symbol source time. Reject missing, ambiguous, future or incompatible data;
   never reconstruct prices from `previousClose`/`change`.
4. **Freshness and provenance:** reuse captured market/receipt times to measure
   delay. Only missing evidence needs a bounded follow-up: a publication boundary,
   quiet listing or anomalous/stale response, not another basic connectivity test.
   Keep source time, fetch time, observed age and declared delay distinct. Require
   time-aligned comparable feeds before setting discrepancy thresholds. A successful
   fetch must not reset an old market timestamp or declare delayed data real-time.
5. **Fallback contract:** Yahoo remains primary. Proposed EODHD admission is only
   for a qualified compatible delayed intraday stream, with explicit delayed/stale
   status. Marketstack/Alpha are separate close-stream candidates; they cannot
   silently satisfy a `last_trade` request. Define triggers, bounded attempts,
   persistent budget/cooldown, equal-time precedence and anomaly handling. Selected
   market time must not regress; otherwise retain stale data explicitly or return
   unavailable. Do not change historical references or explicit V1 selectors.
6. **Infrastructure:** preserve Python supplier I/O, shared immutable D1 observations
   and existing dispatch slots. Bound total cycle time and per-provider deadlines,
   checkpointed replay size, row/index/receipt amplification and retention growth.
   Verify account headroom separately before activation; no account inspection is
   performed here. Cross-run budgets cannot live solely in ephemeral Actions jobs.

### Capacity check: compatible direction, not measured production readiness

Illustrative sizing only: 20 unique instruments × 26 slots = 520 observations/day
per complete feed; 22 sessions give 11,440/month. A 10% secondary share adds 52/day;
one close per instrument/session adds 440/month. Batch HTTP count is not symbol
quota usage. Retry/reserve allowances and actual licensed cadence remain to select.

The existing provider work stays in Python; Workers receive bounded ingestion and
dispatch work. Published Free limits include 10 ms CPU and 128 MB memory per Worker,
and D1 500 MB/database, 5 GB/account, 5 million rows read/day and 100,000 written/day.
Observation count alone excludes indexes/receipts and does not establish CPU/storage
headroom. Measure growth on synthetic local D1 before any extra live feed; immutable
evidence must not be deleted merely to fit capacity. Repository collector jobs
already have a 20-minute deadline, validation 10 minutes and monitoring 5 minutes;
the collector must also respect the scheduler's admission window and concurrency.
Queued Actions execution does not support a one-minute delivery guarantee.

## Proposed continuation, reusing the existing boundaries

1. **Evidence completion:** private coverage/entitlement matrix and existing redacted
   payload review. No repeated 200/connectivity campaign. Resolve the date-only
   close gap before spending effort on Marketstack/Alpha live adapters.
2. **Small EODHD parser slice:** after field semantics are qualified, connect the
   raw D4 envelope to the D2 neutral contract outside the live CLI. Add only missing
   synthetic cases for real envelope shape, exact decimals, partial/error results
   and source context; preserve existing fixture and HTTP evidence. No new framework.
3. **Selection in shadow mode:** implement a small deterministic policy over
   existing observation ports/shared services, with no supplier fetch from REST/MCP
   reads. Test primary eligibility, secondary delay, stale/older close refusal,
   quotas, tie cases and byte-identical replay. Shadow decisions do not affect PEA
   valuation; even real shadow ingestion requires separate permission and rights.
4. **Separate activation decision:** only after full coverage, semantics, rights,
   budget and synthetic capacity gates pass. Keep explicit rollback to Yahoo and
   existing V1 read contracts. This document authorizes no activation or deployment.

Outcome: **conditional GO to complete qualification and prepare an isolated EODHD
parser; NO-GO for production fallback activation now.** The architecture need not
be replaced. The current task delivers documentation/evidence only, not that parser.

## Public references checked 24 November 2026

- [EODHD delayed snapshot contract](https://eodhd.com/financial-apis/live-ohlcv-stocks-api):
  `close` is latest delayed price, timestamp is Unix seconds UTC; batching is metered
  per ticker. This explains field names, not exact listing or adjustment equivalence.
- [Marketstack current documentation index](https://docs.apilayer.com/marketstack/docs/api-documentation)
  and [metering FAQ](https://marketstack.com/faq). The old documentation URL redirects
  to legacy v1; the actual PoC API version is still missing.
- [Alpha Vantage quote documentation](https://www.alphavantage.co/documentation/#latestprice):
  default daily updating does not establish Paris intraday entitlement.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
  [D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
  [D1 pricing/meters](https://developers.cloudflare.com/d1/platform/pricing/) and
  [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits).
  Public limits are not measurements of this account or a service guarantee.
