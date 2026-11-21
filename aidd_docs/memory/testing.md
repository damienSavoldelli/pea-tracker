# Testing

## Current state

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

- Current production baseline: the separately deployed operational reference and
  later write reactivation are recorded in [production evidence](../tasks/2026_11/2026_11_21_operational-start/production.md).
  Historical reads, private reference/D1 comparisons and anonymous refusal passed;
  the real browser-approved write/receipt/replay journey remains unvalidated. Older
  disabled-write/catalogue-pending entries below retain their dated stage scope.
  No test or remote check was rerun for the documentary closure.

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
- Existing financial suites include `tests/portfolio.contract.test.ts`, `tests/portfolio.restart.test.ts`, `tests/valuation.{domain,contract,http}.test.ts`, `tests/quotations.domain.test.ts`, `tests/d1-migrations.test.ts` and `tests/access-read.worker.test.ts`. They cover implemented opening/quotation/valuation behavior, not unimplemented ledger/PRU/gain/return rules. [Valuation evidence](../tasks/2026_11/2026_11_11_valuation/plan.md) retains the exact products/sums, half-even display and partial/unknown-cash cases.
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
- The bounded calendar has its own authorized local implementation and checks; broader V1.1 feasibility remains under study. Future calendar extensions, ledger, signed arithmetic/division, PRU/gains and simple-return checks must derive from approved rules; existing valuation coverage is not global feasibility evidence. Periodic returns/TWR/XIRR and allocation belong to the future V2.3 scope in the [roadmap](../roadmap.md).
- Documentation-only work checks local links, generated markers, scope, diffs and secrets without running application tests or context hooks. Independent backup/restore proof, actual alert delivery, hosted lifecycle checks and runtime profiling remain evidence gaps where the handover does not establish them.
- Synthetic catalog authorization fixtures do not prove OAuth issuer/owner/audience verification or persistent abuse controls. Real local D1 tests prove tested batch atomicity and graceful process restarts only. Node real HTTP plus Worker dry-run bundling does not establish production CPU budgets, remote durability, power-loss behavior or backup restoration.
- Use synthetic fixtures in public CI and logs. Never use actual holdings, brokerage credentials, financial exports or access tokens as fixtures.
- See [INSTALL.md](../INSTALL.md) for production acceptance gates; Mermaid diagrams have not been renderer-validated.
