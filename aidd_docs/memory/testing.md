# Testing

## V2.0 integration checks — 25 November 2026

Separate `integration/v2.0` combines V1.1.5 and A–E locally. Registry discovery
replaces singleton registration only when present; legacy discovery and independent
browser approval remain. TypeScript and 85 distinct targeted synthetic local cases
passed. Linux qualification through isolated Actions is pending. Yahoo stays primary,
EODHD observation only, default cadence 30 minutes; no production change.
[Commands, revisions, validation limits and later rollout gates](../tasks/2026_11/2026_11_25_v2-integration/evidence.md).


- V2.0-E closure, 25 November: owner executed the authorized campaign once;
  private integrity-checked receipt shows 12 get_info, 52 HTTP attempts, 12 valid
  observations, no automatic retry/ingestion write. Individual/shared 30/22
  requests (15/11 in each round): 26.7% measured reduction. Five equal-time
  pairs match; one source time advanced 16s during a 3.016s read gap, explicitly
  inconclusive. No market-time regression or equal-time price conflict; source
  ages 903.551–1,036.299s. Whole capture 1,104.811s; rounds about 18m17s apart,
  not the nominal 15m. No full-catalogue/latency/production guarantee inferred.
  Existing E1/E2, 23 new harness cases, 35/59 cadence checks, native D1 sizing and
  typecheck reused without rerun because source/config did not change. Linux
  remains an explicit global-integration obligation, not an E closure gate.
  [Final sample acceptance and RETEX](../tasks/2026_11/2026_11_24_collector-finalization/retex.md).

- Historical E external-campaign authorization/preflight, 24 November at 20:19 Paris
  was outside session, so zero provider attempts and no receipt. Linux qualification
  is deferred by owner decision to global V2.0 integration on GitHub Actions,
  without production writes, and no longer blocks E closure. Local Docker work
  abandoned; no download, Linux test or acquired-test rerun.
  Commit/push remain conditional on conclusive qualification.
  [Execution limits and RETEX](../tasks/2026_11/2026_11_24_collector-finalization/retex.md).

- V2.0-E subsequent local qualification, 24 November: 23 new harness cases
  qualified on Mac, including four native Curl loopback cases, durable global
  budget, native prerequest reissue, child kill/cleanup, partial results,
  interruption/no-resume, zero-I/O CLI and D mapping/nonregression seams. One new
  native local D1 sizing test passed: 520/1,040 observations grow storage by
  1,576,960/3,158,016 bytes, receipts/indexes included, one replay has no duplicate
  outcome. Typecheck passed. These are synthetic/local facts; actual Yahoo
  request reduction/freshness, remote billed writes and production acceptance
  remain unverified. Linux cleanup is unverified and explicitly deferred to global
  integration, not an E closure gate. D source blob identity checked against `763d9f9`;
  unchanged D 80+55 and E1 19/E2 14 tests not rerun. Earlier cadence 35/59 checks
  reused unchanged. [Protocol and limits](../tasks/2026_11/2026_11_24_collector-finalization/plan.md).

- V2.0-E preparation, 24 November: E1's 19 and E2's 14 acquired tests reused,
  not rerun. GitHub read-only metadata: repository cadence variable 30, no
  collector-live override; eight workflow conclusions successful, approximately
  half-hour creation spacing and 35–54 seconds created-to-updated elapsed time.
  No job-step, provider latency, market timestamp or whole-catalogue freshness
  acceptance follows. No provider request or production D1 access. D's 80+55
  checks remain evidence on its own finalized branch, not executed integration
  tests on E. [Prepared targeted checks and live protocol](../tasks/2026_11/2026_11_24_collector-finalization/plan.md)
  specify a future 12-fetch / 80-attempted-HTTP-transfer maximum; the counting
  harness was not yet implemented at that initial preparation checkpoint;
  its later local qualification is recorded above. External execution is still
  awaiting explicit authorization.
  Subsequent local cadence candidate: 35 selected Python cases passed, 20
  deselected; 59 TypeScript cases and typecheck passed. Rechecks justified by
  modifications to cadence/closing/scheduler/config contracts; E1/E2 not rerun.
  Includes 15-minute slots, preserved 30/60/120 alignment through DST, stale/future
  rejection, four-slot closing completeness and matching Wrangler/TS crons.
  Default remains 30; no production deployment or remote configuration changes.

## Current state

- **V1.1.5 hosted acceptance/closure, owner-reported, 24 November 2026 around
  20:05 Europe/Paris:** after refreshing the connector catalogue, hosted ChatGPT
  successfully called `list_portfolios` → `get_current_portfolio` →
  `get_current_portfolio_valuation` (Yahoo/last_trade/unadjusted) with the discovered
  ID, without manual input or access denial. All 20 positions were valued; the
  previously recorded transaction and journal version 1 were taken into account,
  with freshness/dissemination warnings retained. No preparation or financial write.
  The owner accepted resolution and closed the discoverability incident. This is
  not an independent Codex rerun, reconciliation or replay/concurrency/failure
  acceptance. After tool additions/changes, refresh and verify the client catalogue
  before testing the autonomous journey. See [closure and RETEX](../releases/v1.1.5.md).

- **V1.1.5 local discovery, 24 November 2026:** TypeScript and **7 targeted
  financial MCP cases passed** (33 filtered out): three new discovery cases,
  separate-approver refusal and three existing signed SDK/native-D1 journeys.
  Covers discovery without a pre-known portfolio UUID, owner/read authorization,
  pagination/query bounds, no journal mutation, wrong-opening-ID refusal,
  historical positions and preserved independent browser approval/append/replay.
  The fully enabled catalogue has 19 tools. Results were reused for publication;
  the production-config dry run passed, then source `254c731` was deployed as
  `d4acd260-8532-43da-9ead-5320ab006725`. Official version metadata confirms
  unchanged bindings/runtime; connector ping passed, anonymous MCP POST returned
  401 and anonymous browser identity navigation returned 302 to Access.
  No full suite or financial operation was performed in that technical checkpoint;
  subsequent hosted acceptance is recorded above. See [commands, compatibility and
  RETEX](../releases/v1.1.5.md).

- **24 November 2026, real D observation checkpoint:** owner executed one authorized
  16-symbol group; 16/16 returned, actual 16 units, campaign 17 with reference, no
  bonus/retry. D5/D2 checks passed offline on that new body under explicit assumed
  stream/adjustment context. Sixteen stored-Yahoo MCP reads succeeded; no supplier
  Yahoo fetch or financial write. Prior three samples/80 acquired/55 new synthetic
  tests not repeated. Raw/data-derived price comparisons remain private; no pair
  was simultaneous, and no rejection threshold or production admission is inferred.
  [Measured evidence and limits](../tasks/2026_11/2026_11_21_eodhd-http/finalization.md).

- **24 November 2026, D local finalization:** 55 distinct new synthetic cases pass:
  quota 18, observation composition 20, offline CLI 5, reference identity 12.
  Includes actual competing processes, process exit after durable claim, real D4
  client with fake opener and actual offline module subprocess. Prior 80 cases not
  rerun. No supplier call, D1, financial operation or active runtime change. Review
  is local self-review, not external feed/production acceptance.
  [Commands, checkpoints and open gates](../tasks/2026_11/2026_11_21_eodhd-http/finalization.md).

- **24 November 2026, local D6 shadow mode:** 35 new targeted synthetic tests pass
  for provider selection, stale/time regression/conflicts, close/intraday separation,
  qualification gates, sanitized diagnostics, Free quotas/reserves/period rollover
  and deduplicated 20-instrument planning with three EODHD samples reused. Python
  syntax checks pass. No existing parser or supplier qualification tests repeated;
  no full suite, external collection, persistence or production activation.
  [Commands and limits](../tasks/2026_11/2026_11_21_eodhd-http/shadow-selection.md).

- **24 November 2026, captured JSON qualification:** three original EODHD bodies
  parsed offline unchanged; nine rows normalized in memory under explicit assumed
  context, not live feed admission. Three new synthetic structure tests passed in
  0.01s, covering per-symbol times/same-time revisions and rejection of daily-feed
  envelopes as EODHD. D5's 42 tests reused without rerun. No originals or vendor
  prices enter fixtures; no provider call, credential or financial/D1 operation.
  [Evidence and Free limits](../tasks/2026_11/2026_11_21_eodhd-http/captured-json-qualification.md).

- **24 November 2026, local D5 parser:** 42 new synthetic tests passed in 0.03s,
  plus Python syntax checks. Raw bytes → Decimal parser → D2 covers precision,
  partial/ambiguous responses, bounded input and sanitized failures. No provider
  call, operational wiring or supplier qualification; D1–D4 tests were not rerun.
  [Commands and limits](../tasks/2026_11/2026_11_21_eodhd-http/response-parser.md).

- **24 November 2026, external provider evidence:** owner's 23 November Mac PoC
  returned HTTP 200 for EODHD/Marketstack/Alpha Vantage. Changing delayed snapshots
  were reported for three EODHD symbols; historical closes for three Marketstack
  symbols and one Alpha symbol. This is attributed sample evidence, not execution
  of repository adapters or production qualification. Approximately 15-minute
  delay is reported, not independently calculated without receipt times. Existing
  D1–D4 tests were not rerun; documentary checks only for this update.
  [Evidence matrix and remaining gates](../tasks/2026_11/2026_11_21_eodhd-http/external-poc-2026-11-23.md).

- Local V2.0-E / E2: **14 installed-yfinance offline tests passed** in 8.69 seconds,
  plus syntax check. Real get_info behind mocked HTTP preserves normalized fields,
  original/stale market times and journal replay; missing/error/rate-limited symbols
  do not erase other successes. Native POSIX wait ignoring SIGTERM was terminated
  via SIGKILL, reaped, and followed by a fresh worker; no curl-deadlock claim. Explicit
  network probes are blocked before I/O. Mocked request counts are not real HTTP
  savings or freshness evidence. [Commands, version pin and live comparison gates](../tasks/2026_11/2026_11_21_yfinance-offline/plan.md).

- Local V2.0-E / E1: **19 targeted synthetic tests passed** in 0.03 seconds, plus
  syntax checks. 1/3/20-symbol comparisons preserve complete normalized fields,
  exact prices/subunits, both clocks and identical journals/replay bytes. Partial
  simulated timeouts/session failures, missing data, rate limits and invalid/bar
  substitutions covered; successful symbols are not refetched. No network or
  actual yfinance call; counters describe an assumed protocol, not measured HTTP.
  Native hang isolation remains unverified. [Commands and E2 gates](../tasks/2026_11/2026_11_21_yahoo-cycle-poc/plan.md).

- Local V2.0-D / D4 raw transport: **39 simulated HTTP tests passed** in 0.06 seconds,
  plus Python syntax and whitespace checks. Single/grouped requests, untouched
  success/error/partial payloads, timeouts/network failures, body bounds, disabled
  redirects/proxies and secret-safe output covered. No real socket, vendor call,
  normalized quotation, quota use or production activation.
  [Commands and limitations](../tasks/2026_11/2026_11_21_eodhd-http/plan.md).

- Local multi-provider ingestion grants: **29 selected Worker/service tests passed**
  (10 new cases); typecheck passed. Three affected assertion cases were rerun and
  passed, without double-counting. Covers explicit shared-instrument pairs, exact
  duplicates, forbidden cross products, atomic refusal, deny-all and existing
  Access/read-isolation rules. Synthetic identities/native local D1 only; no
  external network, supplier API or production configuration change.
  [Commands, evidence and scope](../tasks/2026_11/2026_11_21_multi-provider-grants/plan.md).

- Local V2.0-D / D3: **68 targeted tests passed** in 0.28 seconds (25 new fixture
  adapter, 38 D2 and 5 D1 cases). Offline EODHD-format snapshots cover metadata/time/
  price refusals, partial failures, copied fixture state and provider separation.
  Existing Yahoo raw normalization rejects secondary neutral data. No network,
  supplier qualification, full suite or production validation.
  [Exact command, consolidation proposal and limits](../tasks/2026_11/2026_11_21_eodhd-fixture-adapter/plan.md).

- Local V2.0-D / D2: **91 targeted Python tests passed** in 2.32 seconds (38 new
  mapping/normalization cases, 53 existing model/D1/runner cases). Synthetic-only
  checks cover N providers per UUID, provider symbols, distinct trade/close streams,
  adjusted/bar rejection, provenance, subunits, clocks, missing/invalid data and
  unchanged Yahoo/replay/deadline behavior. No provider API, full suite or deployment.
  [Exact command, prepared contract and remaining gates](../tasks/2026_11/2026_11_21_provider-mappings/plan.md).

- Local V2.0-D / D1: **17 targeted Python tests passed** (5 new boundary cases,
  12 existing runner/CLI/replay/deadline cases). Yahoo raw fields and sanitized
  errors, exact normalization, partial failures and byte-identical journal replay
  preserved. Synthetic data/module stubs only; no supplier calls or full suite.
  Earlier Yahoo PoC counts are observations, not performance guarantees; other
  supplier results are owner-reported, not independently revalidated in D1.
  Not deployed; [commands, supplier evidence and limits](../tasks/2026_11/2026_11_21_provider-abstraction/plan.md).

- Local V2.0-C: **55 targeted tests** passed (16 financial C, 1 signed Worker/SDK
  real+simulated journey, 1 populated B→C migration/V1 proposal compatibility,
  21 existing financial/browser, 5 versioned migration, 11 B read cases), plus
  typecheck. Archive/append races, concurrent consumption/replay, exact cost/PRU,
  circuit/owner/anchor isolation and preserved old hashes/receipts covered.
  Synthetic local D1 only; no full suite or production validation.
  [Commands and failure boundaries](../tasks/2026_11/2026_11_21_portfolio-writes/plan.md).

- Local V2.0-B: **35 distinct targeted tests** passed (11 new native D1/service/
  REST/OpenAPI/SDK/signed Worker cases, 2 existing financial compatibility/security
  cases, 22 common Hono/MCP diagnostic cases), plus typecheck. Two synthetic owners,
  real/simulated/empty/archived portfolios, shared quotes, reference isolation and
  unchanged legacy approval/write/replay covered. No full suite or production check.
  [Commands and limits](../tasks/2026_11/2026_11_21_portfolio-reads/plan.md).

- Local V2.0-A registry: **21 targeted tests** passed (11 registry, 3 populated/empty
  V1.1 adoption scenarios, 5 versioned native D1 migration cases, 2 existing MCP
  compatibility/security cases), plus typecheck. Synthetic old table snapshots,
  holdings/cash/PRU, event sequences, receipts and approval digests survive upgrade;
  no administration tool/endpoint added, simulated MCP writes still refused.
  No full suite, remote migration or production validation.
  [Commands, decisions and limits](../tasks/2026_11/2026_11_21_portfolio-registry/plan.md).

- **24 November 2026, owner-reported production milestone:** first real nominal
  MCP preparation → independent browser approval → explicit MCP confirmation →
  journal recording → portfolio/journal reread succeeded on corrected Worker
  `de09bec2-6596-415d-8ffb-c447c3f2b6e5` (source `71bc299`). One event and expected
  position/cost/cash results were reported; private details are not retained.
  This is not a replay test, independent receipt-store inspection, or a new formal
  technical test suite. Production concurrency, expiry/alteration refusals and
  recovery remain distinct unvalidated cases. See the
  [acceptance update](../releases/v1.1.0-validation.md#production-acceptance-update--24-november-2026)
  and [incident evidence](../tasks/2026_11/2026_11_21_financial-mcp/authentication-incident-2026-11-24.md).
  Earlier pending-write statements below describe their dated checkpoints.

- V1.1.3 reconnect-button follow-up, deployed 23 November: seven targeted cases passed, plus typecheck
  and diff check. Official Access logout/return flow is explicit and warns about
  cross-application logout; no session was revoked. Worker
  `c2178996-c949-4c05-b96b-73d80c734abc` deploys source `bbf6d0f`. Browser
  redirect audience matches expectations; authenticated `invalid_token` remains
  undiagnosed. Publication reused these results without rerunning tests or redeploying.
  See the [release](../releases/v1.1.3.md) and [dated evidence](../tasks/2026_11/2026_11_21_financial-mcp/evidence.md#local-explicit-reconnection-link--23-november-2026).
- V1.1.2 presentation, deployed 23 November: 33 targeted financial MCP tests passed with a 15s per-test
  CLI deadline, plus typecheck/diff checks. Covers exact preview display, Paris
  winter/summer time, undeclared fees, nonce CSP, absolute countdown/reload,
  warning/expiry/disabled states, styled errors and unchanged approval/UTM rules.
  Synthetic Chrome confirmation layouts checked at 1280px/390px; success, expired,
  already-used and generic error templates checked at 390px, with no overflow.
  No real transaction or hosted browser authentication acceptance.
- V1.1.1 confirmation navigation fix, deployed 23 November: allowlisted UTM parameters
  on GET, query-free approval POST and nonce-protected responsive styling;
  29 distinct financial MCP cases passed (native-D1 case rerun with a 15s CLI
  deadline after a 5s timeout), plus typecheck and diff check, reused without reruns.
  Synthetic Chrome rendering checked at 1280px and 390px without horizontal overflow.
  Production checks: anonymous MCP 401 and browser redirect 302. No real approved
  write/receipt/replay acceptance. See the [release](../releases/v1.1.1.md) and [dated local evidence](../tasks/2026_11/2026_11_21_financial-mcp/evidence.md#local-confirmation-navigation-fix--23-november-2026).
- Published V1.1.0 baseline: [consolidated validation](../releases/v1.1.0-validation.md)
  records the final Worker, protected writes, broker reference and 19 XPAR closure
  assignments. Historical reads, private reference/D1 comparisons, anonymous refusal
  and the 20 November 20:09 Paris monitor passed. The owner confirmed current reads,
  18-tool discovery and EUR/Modified Dietz in ChatGPT; direct deployment-session
  checks were limited to its legacy catalogue. The first real approved
  write/receipt/replay journey remains unvalidated. No application test or production
  check was rerun for this documentary synchronization.
- Final targeted checkpoints: **52 TypeScript tests** for broker-reference/Dietz and
  projected reads/SDK, **54 calendar tests**, **two Python partial-cycle/monitor
  recovery cases**, with recorded typecheck success. These overlap earlier suites;
  do not sum them as one campaign. See [release evidence](../releases/v1.1.0-validation.md).

## Earlier checkpoints and test infrastructure

The records below preserve the scope of each earlier increment; disabled-write,
missing-reference and stale-client observations are not the final release state.

- Local operational restart: **11 targeted tests** (7 new, including one explicitly
  supplied private-reference check, plus 4 affected native D1 journal cases) and
  typecheck passed. Covers unchanged V1, 20-position projected declarations, exact
  cash/PRU, future trade/replay, nonempty/immutable/isolation guards, actual Worker
  reads, OpenAPI and preserved MCP confirmation. No full suite or production write.
  [Evidence/procedure](../tasks/2026_11/2026_11_21_operational-start/plan.md).

- 21 November production follow-up: 0005/0006 and disabled-write Worker deployment
  succeeded; published false flag, historical MCP read/ping, preserved D1 history
  and empty financial tables verified. Anonymous financial calls return 401. The
  running connector lacks new read tools despite owner refresh, so hosted projected
  read/authenticated tool discovery are pending, not passed. No new test campaign
  or financial event. [Operational evidence](../tasks/2026_11/2026_11_21_financial-mcp/production-2026-11-21.md).

- Local financial MCP/owner browser approval: **53 distinct targeted tests** and
  typecheck passed (21 new, 31 affected journal/REST, 1 filtered V1/V1.1 read
  compatibility). Official MCP SDK → optional Worker composition → protected form →
  native local D1 append/replay exercised with synthetic signatures/data. No hosted
  Access policy, ChatGPT human approval or production activation claimed.
  [Evidence and failure boundaries](../tasks/2026_11/2026_11_21_financial-mcp/evidence.md).

- Local external flows/conditional monetary gain: **34 targeted tests** and typecheck passed (14 domain performance, 20 projected Memory/D1/REST/MCP reads), reusing earlier suites. Initial/reference gaps, cash flows/counterposts, dividends/fees once, quote coverage/warnings, snapshot cloning, backdating, identity isolation and no client reference injection covered. No real reference or remote certification. [Evidence](../tasks/2026_11/2026_11_19_financial-journal/phase-7.md).

- Local realized/unrealized gains: **42 targeted tests** and typecheck passed (13 gains, 11 shared exact-cost regression, 18 projected Memory/D1/REST/MCP reads). Signed gain/loss, counterposts, unavailable/partial cost and quotes, zero denominators, provenance and real/simulated isolation covered; no full suite/remote operations. [Evidence](../tasks/2026_11/2026_11_19_financial-journal/phase-6.md).

- Local dividends: **65 targeted tests** passed (16 dividend Memory/D1, 31 journal, 16 projected REST/MCP reads, 2 filtered fee-policy checks), plus typecheck. Covers no quantity/cost/PRU movement, optional attribution, immutable corrections/replay/CAS, isolation, exact cash/income aggregates and unchanged historical V1; no full suites or remote operations. [Evidence](../tasks/2026_11/2026_11_19_financial-journal/phase-5.md).

- Local fee extension: **76 targeted tests** and typecheck passed (16 fees Memory/D1, 31 journal, 4 journal D1, 11 exact cost, 14 projected REST/MCP reads). Includes seeded preextension canonical receipts, nonnegative net sale proceeds and unknown historic opening-fee provenance. No full suite or remote operation. [Evidence](../tasks/2026_11/2026_11_19_financial-journal/phase-4.md).

- 20 November local cost increment: 72 targeted tests passed (11 cost-domain, 12 projected-read Memory/native D1/REST/MCP, 49 existing V1 portfolio/valuation checks) and typecheck passed. Exact fractions/half-even presentation, counterposts, missing cost and real/simulated isolation are covered; no full suite or remote operations. [Evidence and limits](../tasks/2026_11/2026_11_19_financial-journal/phase-3.md).

- Evidence levels: developed code, prior local synthetic checks and prior operational observations are distinct. The [V1 runbook](../tasks/2026_11/2026_11_14_live-quotations-read/runbook.md) records real ChatGPT reads, hosted ingestion and the scheduled 16 November cycle still to confirm. No runtime checks were executed for this memory refresh; no full production/security/recovery certification follows from those reads.
- Python collector: the locked package uses `collector/.venv`; when testing is in scope, `collector/.venv/bin/python -m pea_collector.checks --` runs synthetic checks with external network denied except loopback. Coverage includes normalization, delivery, replay, cadence and monitoring. Offline qualification uses synthetic data; `qualify --live` makes real provider requests and needs approval. Four host Vitest cases bridge the actual Python CLI to JWT/Hono on Memory/native local D1 and skip without the venv; Access-worker suites separately exercise Python via a synthetic Access edge. See the [collector plan](../tasks/2026_11/2026_11_11_collector/plan.md) and [machine-ingestion plan](../tasks/2026_11/2026_11_11_remote-ingestion/plan.md) for their dated local evidence. The later live deployment does not prove Yahoo rights or every coverage/lifecycle case.

- `npm test` runs Vitest against the Hono app using Web-standard Request/Response and the official MCP client; it covers the complete SDK initialization/discovery/invocation path plus invalid requests.
- `npm run typecheck` performs strict checks; `npm run build` checks Worker bundling. A local Wrangler smoke test complements Node-based tests; these do not prove deployed CPU budgets or ChatGPT connectivity.
- Earlier financial suites include `tests/portfolio.contract.test.ts`, `tests/portfolio.restart.test.ts`, `tests/valuation.{domain,contract,http}.test.ts`, `tests/quotations.domain.test.ts`, `tests/d1-migrations.test.ts` and `tests/access-read.worker.test.ts`. They cover opening/quotation/valuation behavior; dedicated later V1.1 tests establish journal/PRU/gain/return rules separately. [Valuation evidence](../tasks/2026_11/2026_11_11_valuation/plan.md) retains the exact products/sums, half-even display and partial/unknown-cash cases.
- Prior automation evidence: 44 targeted Python tests passed for schedule/cadence/monitoring preparation, including actual-live-step selection rather than skipped jobs; see the [live-read plan](../tasks/2026_11/2026_11_14_live-quotations-read/plan.md). Published schedules are not proof of a successful Scheduled execution. Instrument market age, successful-fetch age and workflow success need separate interpretation, especially without recent trades.
- Calendar local evidence: 127 targeted TypeScript tests and 17 generator Python tests passed, along with typecheck, reader dry-run bundling and reference reproducibility. Commands and results are recorded in [calendar validation](../tasks/2026_11/2026_11_14_market-calendar/reference-validation.md); finalization reused them without rerunning application tests. Coverage includes explicit profile/MIC agreement, unknown fallbacks, closures, half-days, DST, bounded renewal, freshness and unchanged REST/MCP/valuation behavior. These are local proofs, not deployed activation or CPU-budget evidence.
- Instrument suites cover domain/repository/service policy, idempotency, CAS updates, pagination, bounded HTTP errors and default-entrypoint isolation. Network tests start ephemeral 127.0.0.1 servers with fixed synthetic principals, validate real HTTP responses against OpenAPI, and close all servers. Sandbox permission to bind loopback is required.
- Offline OpenAPI validation uses the official OAS 3.1 snapshot and installed Ajv/ajv-formats. See [schema notes](../api/schemas/README.md) for the narrow Ajv dynamic-anchor workaround and media-range annotation limitation. Semantic checksum/auth/retry tests remain separate.
- Manual local setup: `node scripts/dev-instruments.mjs --principal admin --port 8788`; consult the [instrument contract](../tasks/2026_11/2026_11_08_financial-instruments/contract.md) and [opening-state contract](../tasks/2026_11/2026_11_10_opening-positions/contract.md) for the synthetic harness boundaries. It is not an OAuth or production persistence test.
- D1 uses actual Wrangler local workerd through the native binding, not a SQLite mock. Shared repository and network suites run on Memory and D1. Additional tests prove batch rollback, zero-row success, foreign keys, migration fresh/repeat/upgrade/failure, integrity constraints/index plans and process-restart replay/version durability. D1 server shutdown is tested with a process-group SIGINT; owned runtime is detached from terminal signals and disposed via IPC.
- OAuth suites use ephemeral RS256 keys/tokens, policy tests, bounded synthetic JWKS providers and real loopback HTTP/official MCP SDK workflows. The native workerd fixture uses the installed Miniflare 5 inline manifest, no env/credential loader, telemetry, remote binding or persistent state. It is test-only and never a deployment entrypoint. These tests establish local resource-server verification, not real Auth0 authorization-code/PKCE/refresh behavior or hosted connector success.
- Synthetic local D1 fixtures have no real remote/account IDs or credentials; private operational configs are separate. CLI --persist-to root maps to proxy persist.path root/v3. Each test owns .wrangler/d1-tests-* and disposes workerd before cleanup; developer .wrangler/instruments-d1-local remains persistent. Native declarations use installed Wrangler; no additional dependencies are implied. Loopback/runtime checks need the applicable sandbox permission when authorized.
- Optional container checks, when in scope: `docker compose exec worker npm run check`; with Compose running, host `node scripts/smoke-mcp.mjs` verifies published-port diagnostics and SDK initialization/list/call. The same script via `docker compose exec worker` checks container loopback. The [historical Docker plan](../tasks/2026_11/2026_11_06_docker-development/plan.md) records that local increment; it is not hosted financial evidence.

## Validation boundaries

- The architecture permits a bounded synthetic-data MCP initialization/ping proof of concept without portfolio, backup or calculation infrastructure.
- OAuth, CPU, decimal correctness, private-data authorization, monitoring and restoration require their own evidence; ping alone proves none of them.
- V1.1.0 has targeted evidence for the journal, exact arithmetic/PRU/gains, broker-reference Modified Dietz and partial venue calendar. These results do not establish individual continuous/fixing modes, intraday/ALXP coverage, independent alerting or real owner-approved financial writes. Future extensions need approved rules and proportionate new checks; periodic returns/TWR/XIRR and allocation remain future scope in the [roadmap](../roadmap.md).
- Documentation-only work checks local links, generated markers, scope, diffs and secrets without running application tests or context hooks. Independent backup/restore proof, actual alert delivery, hosted lifecycle checks and runtime profiling remain evidence gaps where the handover does not establish them.
- Synthetic catalog authorization fixtures do not prove OAuth issuer/owner/audience verification or persistent abuse controls. Real local D1 tests prove tested batch atomicity and graceful process restarts only. Node real HTTP plus Worker dry-run bundling does not establish production CPU budgets, remote durability, power-loss behavior or backup restoration.
- Use synthetic fixtures in public CI and logs. Never use actual holdings, brokerage credentials, financial exports or access tokens as fixtures.
- See [INSTALL.md](../INSTALL.md) for production acceptance gates; Mermaid diagrams have not been renderer-validated.
