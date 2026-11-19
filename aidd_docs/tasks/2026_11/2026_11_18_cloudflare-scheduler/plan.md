# Cloudflare scheduling bridge — local preparation

Current status (2026-11-19): scheduler activated and production cycles validated. See [acceptance and RETEX](../../../releases/v1.0.0-validation.md). This original preparation plan is historical: enabled configuration, dispatch-only GitHub workflows and the proposed 20:09 closing monitor supersede closed/native-schedule details below. Closure still awaits publication/deployment approval.


## Scope and evidence

Owner decision: stop debugging GitHub `schedule`; retain Python/yfinance, Access,
ingestion and financial D1. Local implementation/testing authorized; provisioning,
credentials, publication, dispatch and deployment are NOT authorized by this task.

Previous evidence is reused: production YAML on main was correct; only sparse
scheduled runs appeared. Minimal diagnostic commit `11b5a04`, then `5513aa3` with
manual dispatch: manual run 44168904910 succeeded on 17 November at 20:24:06 UTC;
zero scheduled diagnostic runs during the following 15 minutes. Owner screenshot
later shows one scheduled diagnostic run at 02:35 Paris on 18 November. This proves
occasional dispatch, not five-minute regularity. Do not repeat schedule experiments.

## Feasibility: conditional

Official APIs support Worker scheduled handlers, outbound GitHub workflow dispatch
and SQLite Durable Objects on Workers Free. Local code and synthetic tests can
validate contracts, not hosted permissions, CPU margin, latency or availability.
No token, cloud resource, ingestion write or hosted dispatch is created here.

Blocking activation prerequisites:
- A dedicated GitHub fine-grained PAT for ONLY this repository, Actions read/write,
  mandatory metadata read, no Contents/Workflows/Secrets/Administration write.
  Keep finite expiry (suggestion: 30 days), record renewal date, store only as
  Worker secret GITHUB_DISPATCH_TOKEN. Never paste it in chat or Git.
- Explicit approval for a separate Worker and SQLite Durable Object namespace,
  quota/account compatibility, workflow publication, source switch and real cycles.
- Native workerd/SQLite concurrency, retained receipts through a new stub and the
  disabled/no-public-route behavior are locally verified (2 tests). A process/crash
  restart and hosted resource migration remain separate verification gates.

Auth comparison: PAT is simplest for one owner/repository. GitHub App is preferable
for independent installation identity and automatically expiring one-hour tokens,
but needs App registration, private-key custody and token minting. Both require
Actions write for dispatch. Neither offers a workflow-specific dispatch-only scope;
the token's privilege is broader than the two URLs pinned in our code. PAT expiry
and user-account dependency are accepted only after owner validation. No reuse of
the invalid machine-local gh credential or extraction of credentials is proposed.

## Minimal composition

Cloudflare Cron -> scheduled handler -> durable per-slot claim -> GitHub POST
workflow_dispatch on main -> existing collector-live -> Python -> existing ingestion.
The same bridge dispatches the existing monitoring workflow independently hourly.

Files:
- src/scheduling/github-dispatch.ts: bounded Paris-window planning and one POST.
- src/entrypoints/scheduler.ts: no public route (404), native durable claim and TTL.
- wrangler.scheduler.jsonc: CLOSED (enabled=false, crons=[]), no D1/Access binding.
- collector/pea_collector/cloudflare_cadence.py: separate validator for external
  slots. Legacy cadence.py/manual behavior is unchanged.
- collector/pea_collector/monitor.py: optional Paris window and slot run-name support.
- ops/cloudflare-scheduler/*.yml: candidate replacements for existing workflows,
  based on PUBLISHED main, retaining original crons, environment and four gates.
  They are not active workflows. The three pending minute-shift changes stay intact
  and must NOT be published; integrate candidates in a clean authorized checkout.
  workflows.patch is the equivalent integration diff against published main.
The scheduler compatibility date is 2026-11-11, the maximum accepted by the pinned
local workerd. The first native check rejected today's date; using the supported
date made the same fixture run without changing dependencies or other Workers.

Preparation window: weekdays 07:17..19:47 Europe/Paris, every 30 minutes (26 slots).
This preserves the former winter local window and keeps the SAME local hours in
summer: UTC06:17..18:47 winter, UTC05:17..17:47 summer. This choice must be confirmed
at activation. It is NOT a market/holiday calendar. Cron expressions have no weekday
field restriction: code checks Paris weekdays, avoiding cron weekday dialect issues.
Activation crons: `17,47 * * * *` (collector), `9 * * * *` (monitor).
Use controller.scheduledTime, not arrival time; reject >10-minute late/future slots.
GitHub independently validates collector slots, age and supported 30/60/120 cadence.
Worker and GitHub interval settings must match. Late runners may intentionally skip
collection; missing-cycle monitoring must expose the absence, not call it success.

## Dispatch safety, traceability and limitations

One durable transaction claims (kind, UTC slot) BEFORE network I/O. Claims survive
duplicates and ambiguous outcomes; objects contain ONLY operational metadata and
expire after 48 hours. No retry of POST, including 429/5xx/timeouts. Crash after
claim but before POST can lose ONE cycle. This is at-most-one attempt, NOT exactly
once delivery. A human must reconcile outcome before any exceptional replay.
GitHub does not provide a dispatch idempotency key. Existing ingestion idempotence,
private original-payload journals and fail-closed reruns stay unchanged.

Logs contain fixed events, kind, slot and optional HTTP status only:
dispatch_requested != dispatch_accepted != collection success. HTTP200/204 confirms
API acceptance only. Timeout/5xx -> dispatch_unknown, no blind retry. HTTP401/403/429
-> rejection; inspect token/expiry/limits before action. Cloudflare failed-event
metrics expose POST/state failures. Claim-store unavailability fails closed.
GitHub run-name includes the UTC slot. Check actual Run collector success and its
cycle_complete output (delivered=true, zero unavailable) plus 20 fetch timestamps.
Missing-cycle monitoring still uses actual successful collector steps, 90-minute
minimum threshold and native GitHub failure notifications. It remains dependent on
GitHub execution/notification availability. An independent alert channel for bridge
failure or total GitHub outage is NOT configured by this preparation.

## Budget and quotas

Estimate: 72 cron invocations/day before local-window filtering; 26 collector +13
monitor dispatches per covered weekday, roughly 39 GitHub writes and <=39 DO calls,
plus two cleanup alarms/day and bounded receipt writes. Existing monitor API reads
are additional. This is far below nominal documented Workers/DO Free and GitHub API
quotas, but account-wide shared usage, PAT secondary limits and CPU must be checked.
SQLite-backed DO is available on Free; over-limit operations fail. No paid plan
activation or unconditional zero-cost/SLA guarantee. GitHub standard Linux runners
in this public repository remain the execution substrate; GitHub runner/API outages
or delays are NOT removed by moving the timer.

## Local validation and pending hosted proof

Targeted suites: tests/scheduler.test.ts (planner, DST, bounded delay, API contract,
duplicate/parallel calls, statuses, no retry, redaction, independent monitor);
collector/tests/test_cloudflare_schedule.py and test_automation.py (legacy guards,
candidate workflow permissions, Paris slots, skipped/late/missing monitoring).
Run typecheck and Wrangler scheduler dry-run only; no live provider/API call.
Local assertions are not proof of hosted cron or durable crash behavior.

Results: 27 TypeScript core checks, 2 native workerd/SQLite checks and 29 Python
checks passed; TypeScript typecheck and closed Wrangler dry-run passed. Native
tests load no environment/credential files and replace all outgoing calls with a
synthetic fetcher. No live GitHub/Yahoo/Cloudflare API or financial database is used.

## Proposed activation sequence — separate approval required

1. Review candidate workflow diffs against main in a clean checkout. Include the
   new Python helper/monitor changes; do NOT include pending minute shifts. Publish
   only after approval. Default source remains GitHub, so Cloudflare inputs are
   refused until the explicit source gate is switched.
2. Create the dedicated limited PAT privately; approve and deploy scheduler CLOSED
   with secret and SQLite DO namespace. Check no HTTP endpoint/financial binding.
3. Coordinate a quiet boundary: no queued/in-progress native live run; set repo
   variable COLLECTOR_AUTOMATION_SOURCE=cloudflare. Native schedule jobs now skip;
   Cloudflare-source dispatches become allowed. Retain all four approval variables
   and main-only collector-live protection. Do not require interactive reviewers.
4. Approve activation: set scheduler enabled=true and the two crons above, then
   deploy. Allow up to 15 minutes propagation. No overlapping native timer execution
   or replay of old slots. Publication of an enabled workflow alone isn't proof.
5. Observe >=6 consecutive collector slots and >=3 monitor slots: distinguish CF
   event time, durable result, GitHub creation/start, actual collection result and
   stored fetch timestamps. Provisional acceptance: collector starts within 10 min,
   no missing/duplicate slot, 20 successes/zero unavailable, monitor actually runs.
   Repeat for a complete covered day; measure CPU/quotas and test token expiry,
   rejected/ambiguous dispatch and missed collection using synthetic/local fixtures.
6. After proof, separately authorize removing both old GitHub schedule blocks and
   disabling/removing schedule-diagnostic.yml. No deletion is performed here.

Rollback: first disable the scheduler (flag + empty crons) and wait out propagation;
inspect any queued runs and ambiguous claims, then switch automation source back
to GitHub. Native crons were retained until validation; if removed, restore them
through an approved commit. This returns the old known-unreliable timer, NOT a
reliability fix. Do not change Access, ingestion or financial D1. Preserve receipts
until reconciled; do not delete a namespace to force a retry.

## RETEX

Record old schedule evidence, exact activation SHA/time, chosen Paris window,
PAT/App decision and expiry (never value), pending local-diff exclusion, every slot
and request result, GitHub run/cycle IDs, monitoring delivery, CPU/quotas and rollback
decision. No holdings, prices, quantities, PRU, credentials or private payloads.

## Official references consulted 18 November 2026

- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/github-credential-types
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
