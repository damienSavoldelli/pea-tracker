---
status: done
---

# Instruction: Evaluate configurable cadence and operational acceptance

## Architecture projection

```txt
.
├── collector/
│   ├── pea_collector/
│   │   ├── cadence.py ✏️
│   │   ├── cloudflare_cadence.py ✏️
│   │   └── monitor.py ✏️
│   └── tests/
│       └── test_cloudflare_schedule.py ✏️
├── src/scheduling/github-dispatch.ts ✏️
├── tests/scheduler.test.ts ✏️
├── tests/collector-storage-sizing.test.ts ✅
└── wrangler.scheduler.jsonc ✏️
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Supply a synthetic weekday and cadence | No dispatch or provider calls | system |
| Happy path | Compare 15/30/60/120 slot decisions in TS and Python | Same UTC slot keys and Paris/DST boundaries | system |
| Edge case | Late slot, DST, partial failure or overwritten pending run | Explicit skip/failure, no silent healthy cycle | system |
| Edge case | Multiple portfolios share a quote requirement | One retrieval and observation per stream/slot | system |
| Edge case | Quiet or closed market | Source age preserved; closure is not mistaken for outage | system |

## Tasks to do

### 1) Quantify the decision before changing cadence

1. Synthetic sizing: 20 unique instruments, 13-hour weekday window, 22 weekdays
   per month; counts exclude retries and manual cycles. Five minutes is only a
   counterfactual, unsupported by the current configuration.

| Cadence | Cycles/day | Logical fetches and observation rows/day | Cycles/month | Observation rows/month |
| --- | --- | --- | --- | --- |
| 5 minutes, hypothetical | 156 | 3,120 | 3,432 | 68,640 |
| 15 minutes, proposed | 52 | 1,040 | 1,144 | 22,880 |
| 30 minutes, current | 26 | 520 | 572 | 11,440 |

2. Provider HTTP requests are not logical fetches. Existing runner permits two
   attempts for provider_unavailable only: worst case 2,080 get_info attempts/day
   at 15 minutes for this synthetic size. Internal Yahoo transfers remain variable;
   offline 15-versus-11 mock requests are not a live scaling coefficient.
3. Extrapolating only the eight observed 35–54 second workflow elapsed durations
   gives roughly 334–515 elapsed minutes/month at 30 minutes, 667–1,030 at 15.
   These are not billable-minute measurements or an SLA. Monitor overhead,
   queuing, dependency setup, failures and account billing rules are excluded.
4. Each new fetch time appends an immutable observation even if price is unchanged.
   D1 additionally writes batch receipts and indexes and performs reads; 22,880
   observation rows/month is not the complete billed-write count. Measure native
   local D1 growth/index/receipt amplification with synthetic data before rollout;
   do not query production D1. Retention cannot be solved by silently deleting
   immutable evidence. Daily free allowance alone does not prove long-term capacity.
   Proposed base cron also doubles collector Worker trigger events from 48 to 96
   per UTC day, including filtered slots/weekends; monitor remains 24 triggers.
   At default 30, extra triggers skip before a durable claim or Actions dispatch.
   This modest additional scheduler load still needs runtime budget verification.
5. If publication delay were 15 minutes, polling every 15 minutes would add between
   zero and almost 15 further minutes of sampling lag in an ideal frequently-traded
   feed, plus queue/execution time. It would not make the feed real-time. For a
   quiet listing, market age can be much larger. Current Yahoo Paris delay remains
   unverified in this preparation; measure source times rather than assign 900.

### 2) Design one simple global setting

1. Reuse `COLLECTOR_INTERVAL_MINUTES`, extend admissible values to 15/30/60/120
   only after local tests. Keep default 30. No per-portfolio workflows or new queue.
2. Candidate base cron minutes :02/:17/:32/:47 retains existing :17/:47 slots and
   keys. Proposed eligibility: `(epoch_minutes - 17) mod interval == 0`, validated
   identically in TS/Python. This preserves existing 30/60/120 alignment. A cron
   change alone or repository-variable change alone is insufficient.
3. Scheduler and Actions setting must agree; detect mismatch in a deployment
   checklist. Keep strict scheduled-at ten-minute acceptance and at-most-one
   dispatch per durable claim. Do not loosen age guards to hide queue latency.
   A conditional future Wrangler cron change must match `dispatchCrons` exactly;
   test that correspondence, otherwise the Worker rejects scheduler_cron_invalid.
   Leave interval default 30 even when a future local candidate adds base slots.
4. Retain broad Paris 07:00–19:59 coverage and monitor 20:09 until separately
   deciding on qualified session-aware savings. At 15 minutes closing monitor
   must require all four final-hour slots, including :02/:32. No assumed ALXP
   intraday calendar or stopping at the nominal exchange close before delayed
   publication. A final last-trade sample is not an official closing-price feed.
5. Keep backend 45/60-minute policy unchanged. Keep monitor's existing 90-minute
   floor initially, explicitly reporting that it detects multiple missed cycles,
   not a single missed 15-minute slot; a tighter operational alert needs a separate
   chosen grace/false-positive budget. Workflow success and per-instrument freshness
   remain separate diagnostics.
6. With a 20-minute workflow timeout, 15-minute scheduling can overlap. Preserve
   cancel-in-progress=false, measure queue age, count replaced pending executions
   as missing expected slots; no unbounded catch-up or automatic redispatch.
7. Deduplicate future portfolio needs by instrument/provider/kind/adjustment.
   Trading Lab can read these same observations; a later faster requirement needs
   explicit admission and one shared due plan, not another collector deployment.

### 3) Validate and close without activating production

1. Local cadence work can proceed independently of phase 2's external approval;
   operational activation remains gated by relevant runtime evidence and owner
   authorization. Future targeted tests: :02/:32 acceptance at 15 only, unchanged 30/60/120 keys,
   summer/winter/DST/weekend, ten-minute stale dispatch refusal, closing four-slot
   completeness, partial outcomes, duplicate portfolio requirements and bounded
   queue diagnostics. Recheck affected cadence/scheduler cases because the contract
   changes; unchanged E1/E2 suites do not need reruns.
2. Verify low-level bytes/receipt/idempotency preservation, measure synthetic D1
   row/storage costs, then perform a scoped source review. No new infrastructure.
3. External Yahoo sample remains an E acceptance gate; Mac cleanup is qualified.
   Linux runtime/cleanup checks are deferred by the owner to global V2.0 integration
   on GitHub Actions without production writes, and do not block E closure.
   Cadence 15 remains optional, requiring an explicit
   production-change authorization beyond local qualification. No current active
   YAML, scheduler, ingestion, schema or valuation code changed by this plan.
4. Owner authorized commit/push after conclusive bounded qualification; its
   conditions passed on 25 November with the documented sample limits.
   Main integration, release,
   deployment and fallback activation remain separate decisions.

Local checkpoint, 24 November: tasks 2's cadence option and closing-slot handling
are implemented in the listed source files, with Wrangler/TS cron correspondence
checked and default 30 retained. Legacy manual/coarse UTC selection remains
coarse; strict Cloudflare slots use the common epoch-minute alignment. No
operational queue telemetry or active shared-session adapter is claimed implemented.
Subsequent local work added D-backed unique-demand validation in the isolated
harness and the synthetic native-D1 measurement below. Live results remain open.

Executed checks:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_cloudflare_schedule.py collector/tests/test_automation.py -o addopts='' -q -k 'quarter_hour or frequency or cadence or closing_monitor or rejects_late or scheduler_config'
node node_modules/vitest/vitest.mjs run tests/scheduler.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Results: 35 Python cases passed / 20 deselected; 59 TypeScript cases passed;
typecheck passed. E1/E2 unchanged and not rerun. Counts are scoped to this run,
not additional independent campaigns to sum with historical evidence.

Native local D1 sizing checkpoint, 24 November:

`tests/collector-storage-sizing.test.ts` passed using existing fixed local Wrangler
fixtures and the actual `D1QuotationRepository.append()`, all nine migrations,
20 synthetic instruments, unchanged synthetic price/source time, and fresh fetch
times. No remote database, real catalogue or holding was used.

| Measurement | Bytes / rows |
| --- | --- |
| Seeded baseline, before observations | 212,992 bytes |
| After 26 cycles / 520 observations | 1,789,952 bytes; growth 1,576,960 |
| After 52 cycles / 1,040 observations | 3,371,008 bytes; growth 3,158,016 |
| Batch receipts after 52 cycles, including one identical replay | 52 |

These are native D1 local `meta.size_after` bytes, including indexes/receipts and
fixed schema overhead, not billable remote row counts or a guarantee about a
production database's page layout. PRAGMA page_count was rejected by D1; no
permissions were bypassed. Replaying the first batch preserved count and values.
At 22 synthetic collection days/month, measured growth extrapolates to about
34.7 MB at 30 minutes or 69.5 MB at 15 minutes; linear annual estimates are about
416 MB or 834 MB respectively, before other growth. These are sizing estimates,
not a measured year or permission to delete immutable data. A cadence change
therefore needs a storage-capacity decision as well as a daily write budget.

Check executed (the second run exposes the measured aggregate output):

```sh
node node_modules/vitest/vitest.mjs run tests/collector-storage-sizing.test.ts --silent=false
```

The new test passed and typecheck passed. Prior cadence 35/59 checks were reused,
not rerun because their source/configuration did not change in this follow-up.
At the 24 November checkpoint, actual Yahoo freshness and live session-request
reduction remained pending; the 25 November closure below supersedes that status.
Linux cleanup is a global-integration obligation, not an E closure gate; no local
Docker qualification is pursued. Production integration and cadence activation
remain separate decisions. The existing 30-minute collector is unaffected.

## Test acceptance criteria

25 November closure: measured request reduction supports the isolated session
candidate (15→11 in each round, aggregate 30→22). Actual source age was about
15–17 minutes on these samples; publication delay remains undeclared/null.
Polling at 15 minutes could reduce additional sampling lag but doubles current
cycles/storage. This two-round capture, with actual spacing about 18 minutes,
does not measure a deployed 15-versus-30-minute schedule or justify a rollout.
Keep default 30. Session reuse does not reduce observations or receipt storage
at a given cadence. The cadence/monitor tests and D1 measurement above are reused
without reruns; active entrypoints and production workflows are unchanged.
E is closed for the local configurable-cadence/qualified-experiment deliverable.
Linux, actual Actions queue/timing, real billed writes and storage headroom are
global-integration/activation obligations, not secretly passed acceptance checks.

| Task | Acceptance criteria |
| --- | --- |
| 1 | Sizing separates workflow, logical attempt, HTTP transfer, observation and billed D1 writes; assumptions are explicitly synthetic. |
| 2 | One configurable cadence, preserved default/slot identity, common TS/Python decisions, explicit freshness/monitoring and shared-data semantics. |
| 3 | Evidence separates local implementation, external sample and production acceptance; unresolved gates block activation, not observation documentation. |
