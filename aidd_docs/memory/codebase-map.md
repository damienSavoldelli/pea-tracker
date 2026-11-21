# Codebase Map

- Local V2.0-C: `src/application/portfolio-context.ts` (shared B/C resolution),
  `portfolio-financial.ts` (V2 routing), `src/adapters/mcp/portfolio-financial.ts`,
  versioned proposal union and existing financial service/approval adapters.
  Browser dispatch/identity: `src/financial-app.ts`, `src/adapters/rest/financial-confirmation.ts`.
  Migration 0009 extends journal anchors and active-status SQL guards.
  Tests: `portfolio-financial{,.worker}.test.ts`, `portfolio-writes-migration.test.ts`.
  [Decisions and evidence](../tasks/2026_11/2026_11_21_portfolio-writes/plan.md).

- Local V2.0-B: `src/application/portfolio-reads.ts`,
  `src/adapters/{rest,mcp}/portfolio-reads.ts`; optional Hono/MCP wiring and financial
  entrypoint injection. Contract: `aidd_docs/api/portfolio-reads.openapi.json`.
  Tests: `tests/portfolio-reads.test.ts` plus targeted existing Worker/financial
  compatibility checks. [Evidence and boundaries](../tasks/2026_11/2026_11_21_portfolio-reads/plan.md).

- Local V2.0-A: `src/{domain,ports,application,adapters/d1}/portfolio-registry.ts`,
  additive `migrations/0008_portfolio_registry.sql`. Independent openings are
  immutable snapshots in registry rows; historical references stay in old tables.
  No entrypoint imports the new service. Tests: `portfolio-registry.test.ts`,
  `portfolio-registry-migration.test.ts` and existing targeted migration/MCP checks.
  [Scope, evidence and remaining integration](../tasks/2026_11/2026_11_21_portfolio-registry/plan.md).

- Current financial entrypoint: `src/entrypoints/access-financial.ts`; operational
  opening: `src/domain/operational-opening.ts`, `src/ports/operational-opening.ts`,
  `src/adapters/d1/operational-opening.ts`, migration 0007 and the local-only broker
  preparation script. Historical/current service selection is separate.
  [Production state](../tasks/2026_11/2026_11_21_operational-start/production.md)
  supersedes older statements below that the financial entrypoint is unselected.

- Financial MCP: `src/application/financial-mcp.ts`,
  `src/adapters/mcp/financial-tools.ts`, `src/domain/financial-proposal.ts`,
  `src/ports/financial-approval.ts`, Memory/D1 approval adapters and additive local
  migration `0006_financial_approvals.sql`. Browser form:
  `src/adapters/rest/financial-confirmation.ts`; exact-owner/two-AUD policy:
  `src/adapters/auth/financial-access.ts`. Active same-Worker entrypoint
  `src/entrypoints/access-financial.ts` reuses journal/projected services and V1 reads.
  [Initial local evidence](../tasks/2026_11/2026_11_21_financial-mcp/plan.md);
  [current security contract](../tasks/2026_11/2026_11_21_financial-mcp/contract.md).

## Local V1.1 financial journal — 2026-11-19

- Flows/monetary gain: `src/domain/performance.ts`, `tests/performance.test.ts`; external-flow summaries, evidenced market-reference checks and conditional economic gain. `PortfolioService.currentSnapshot` shares one captured state/events internally; `ValuationService` accepts an optional trusted snapshot, with no public setter or real reference activated. Existing DTOs enriched locally; [reference gap/evidence](../tasks/2026_11/2026_11_19_financial-journal/performance.md).

- Gains: `src/domain/fractions.ts` shares exact arithmetic/representation; `cost-basis.ts` exposes `projectFinancialState` for costs/realized gains, with cost-only compatibility wrapper. `src/domain/gains.ts` derives unrealized gains from existing market values. Portfolio/valuation current reads and OpenAPI/MCP enriched; `tests/gains.test.ts`, cost and projected-read suites provide [local evidence](../tasks/2026_11/2026_11_19_financial-journal/phase-6.md). No journal/D1 schema change or global-return engine.

- Dividends: transaction variant and optional attribution in the existing domain/service; `src/domain/dividends.ts` computes exact recorded-cash summaries for `PortfolioService.current`/`ValuationService.current`. Cost replay recognizes cash-only income/counterposts without changing PRU. `tests/transactions.dividends.test.ts`, extended projected-read/OpenAPI/MCP coverage. [Contract/evidence](../tasks/2026_11/2026_11_19_financial-journal/dividends.md).

- Explicit fee increment: optional `fees` in the transaction domain, cash/net validation, cost capitalization and policy/provenance v2 in `cost-basis.ts`; unchanged repositories/D1 schema. `tests/transactions.fees.test.ts` and extended projected-read tests cover actual declared fees, legacy receipts and isolation. [Current convention](../tasks/2026_11/2026_11_19_financial-journal/fees.md).

- 20 November cost increment: `src/domain/cost-basis.ts`, `tests/cost-basis.test.ts`; exact declared-opening/transaction cost replay, weighted-average PRU, fraction/rounded-decimal outputs and counterpost conflicts. Projected services attach costs; historical V1 and persisted journal outcomes stay unchanged. [Rules and evidence](../tasks/2026_11/2026_11_19_financial-journal/cost-basis.md).

- Projected reads: `PortfolioService.current`, `ValuationService.current`, `src/adapters/rest/current-portfolio.ts`, optional additions in `src/adapters/mcp/handler.ts`/`src/app.ts`; no production entrypoint activation. `tests/portfolio-journal-read.test.ts` covers current vs historical responses, pinned journal state and REST/MCP compatibility. See [phase 2](../tasks/2026_11/2026_11_19_financial-journal/phase-2.md).

- `src/domain/transactions.ts`, `src/application/transactions.ts`, `src/ports/transactions.ts`: exact movements, immutable opening anchor, explicit portfolio identity/owner, permissions and idempotent commands.
- `src/adapters/{memory,d1}/transactions.ts`, additive `migrations/0005_transactions.sql`: isolated append-only journal and durable outcomes; no production migration authorized.
- `src/transaction-app.ts`, `aidd_docs/api/transactions.openapi.json`: opt-in REST composition, never mounted by production entrypoints or MCP. Tests: `tests/transactions{,.d1}.test.ts`.
- [Contract and limits](../tasks/2026_11/2026_11_19_financial-journal/contract.md); [calendar assignment evidence](../tasks/2026_11/2026_11_14_market-calendar/finalization-2026-11-19.md).

Current reference: [V1 acceptance and RETEX](../releases/v1.0.0-validation.md). Earlier slice descriptions below are historical.

- Scheduler: `src/entrypoints/scheduler.ts`, `src/scheduling/github-dispatch.ts`, `wrangler.scheduler.jsonc`; durable receipts, no financial D1 binding.
- Dispatch-only workflows: `.github/workflows/quotation-collector.yml`, `.github/workflows/quotation-monitor.yml`.
- Monitoring: `collector/pea_collector/monitor.py`; closing check at 20:09 Paris verifies final due slots across DST and supported cadences.
- Current authentication policy: `src/adapters/auth/access-jwt.ts`, `access-service-authenticator.ts`.

## Areas

- [INSTALL.md](../INSTALL.md): current architecture, implementation boundaries and evidence gaps; [roadmap](../roadmap.md): future scope, not a feasibility approval.
- [Root README](../../README.md): product/current V1 summary; [AIDD index](../README.md): context conventions.
- [Financial backend design proposal](../tasks/2026_11/2026_11_06_financial-backend/design.md): historical proposal, not current implementation status or blanket approval.
- [Approved financial backend PRD](../tasks/2026_11/2026_11_08-financial-backend-prd.md): original 2026-11-08 baseline plus dated current-scope supplement; financial conventions remain explicitly open.
- [Financial Instruments plan](../tasks/2026_11/2026_11_08_financial-instruments/plan.md) and [contract](../tasks/2026_11/2026_11_08_financial-instruments/contract.md): implemented synthetic catalog slice, memory repository boundaries and test criteria.
- [OpenAPI contract](../api/openapi.json): diagnostic, instrument, opening-state/position, quotation and valuation contracts; read/admin/ingestion operations have separate compositions and permissions. Inclusion in OpenAPI does not imply exposure by the financial reader. Offline official schema snapshot under api/schemas supports validator tests.
- [D1 plan](../tasks/2026_11/2026_11_08_d1-instruments/plan.md) and implementation record: local-native persistence, atomicity, migration and restart evidence.
- This memory bank: durable project context; internal/external notes are read on demand.
- Root AGENTS.md: shared assistant instructions; CLAUDE.md imports them for Claude Code.
- Root .codex/config.toml: workspace-write sandbox, on-request approvals and restricted network access.

## Entry points

- 2026-11-14: `src/entrypoints/access-read.ts` is a separate, closed-by-default
  owner-only native D1 REST/MCP financial reader: catalogue, quotation status/history,
  and explicitly enabled opening-state/position/valuation reads. No mutation route
  is exposed. Real reads have prior ChatGPT evidence; deployment status belongs in
  the [V1 runbook](../tasks/2026_11/2026_11_14_live-quotations-read/runbook.md).
  Existing DEV/PoC/ingestion entrypoints remain separate. `scripts/catalogue-preparation.ts` captures the existing instrument
  service/repository batch for a reviewed one-instrument bootstrap; its CLI creates
  ignored private mapping/grant/SQL artifacts only. See [local evidence and separately
  authorized runbook](../tasks/2026_11/2026_11_14_live-quotations-read/plan.md).

- Ingestion budget: `InstrumentRepository.getMany` is implemented by Memory/native D1. `QuotationService.ingest` deduplicates authorized instrument IDs before one grouped read; the existing atomic quote batch adds one D1 call. Local max-lot tests measure two binding calls for 50 observations, including replay, without changing REST limits or financial rules.

- Machine ingestion: `src/adapters/auth/access-jwt.ts` shares cryptographic verification between the MCP owner adapter and `access-service-authenticator.ts`; signed service IDs map only to ingestion. `src/entrypoints/access-collector.ts` composes the batch-only Worker with existing native D1 repositories. Its isolated local fixture is `tests/fixtures/wrangler.access-collector-local.jsonc`; private remote configuration is separate. Python Service Auth headers and the live workflow use dedicated credentials. `tests/access-collector.worker.test.ts` covers Python→synthetic edge→Hono/local D1, idempotency, denial and absent routes. The [historical contract](../tasks/2026_11/2026_11_11_remote-ingestion/contract.md) preserves local evidence; the current V1 runbook records subsequent operational status.

- Collector slice: `collector/pea_collector/` separates yfinance retrieval, strict mapping/normalization, HTTPS machine ingestion, private replay journals, CLI, cadence/monitor and fixed local check/qualification launchers. `collector/uv.lock` pins Python dependencies; `collector/tests/` uses synthetic fixtures and denies external network. Optional `src/collector-app.ts` reuses existing JWT machine policies; quotation adapter `ingestionOnly` leaves read routes absent. Four `tests/collector.http.test.ts` cases launch Python against Memory/local D1 Hono. Two `.github/workflows/quotation-*.yml` files support dispatch and published weekday schedules with main-only guards. The first complete scheduled cycle remains to confirm; see the [collector guide](../../collector/README.md). The [historical contract](../tasks/2026_11/2026_11_11_collector/contract.md) retains its original inactive-workflow evidence.

- Valuation slice: `src/domain/valuation.ts` supplies exact finite decimal products/sums and half-even EUR display; `src/application/valuation.ts` reuses PortfolioService and QuotationService over existing Memory/native D1 ports. Optional REST `/api/v1/portfolio/valuation` and read-only MCP `get_portfolio_valuation` expose input provenance, warnings and partial/complete coverage. No new migration, persisted snapshot, FX or gain calculation. [Contract](../tasks/2026_11/2026_11_11_valuation/contract.md) includes the guarded local HTTP setup; three `tests/valuation.*.test.ts` suites cover arithmetic, both persistence adapters, HTTP and official SDK.

- Quotation slice: `src/domain/quotations.ts`, `src/application/quotations.ts`, `src/ports/quotations.ts`, Memory/D1/REST adapters and `0004_quotations.sql` store provider declarations and failure outcomes. History/status services and two read-only MCP tools are composed by the financial reader; ingestion has independent subject/provider/instrument grants. The [contract](../tasks/2026_11/2026_11_11_quotations/contract.md) defines timestamps/freshness and preserves the initial synthetic scope; later collector/valuation integration is separate evidence. Deployed calendar context remains unknown; the optional local adapter is described below.

- Bounded calendar: `src/adapters/calendar/market-calendar.ts` resolves the generated local reference; `scripts/generate-market-calendar.py` renews it from reviewed `profiles.json` without dependencies beyond Python's standard library. `access-read.ts` accepts optional private `MARKET_CALENDAR_ASSIGNMENTS`; QuotationService passes the instrument already read to its callback. No new repository call or public contract. See [admission, configuration and exclusions](../tasks/2026_11/2026_11_14_market-calendar/reference-validation.md) before assigning a profile or renewing coverage; generation alone does not establish an unreviewed year.

- Opening-state/position slice: `src/domain/portfolio.ts`, `src/application/portfolio.ts`, `src/ports/portfolio.ts` and `src/adapters/{memory,d1,rest}/portfolio.ts`; `migrations/0003_opening_portfolio.sql` adds complete immutable revisions and durable outcomes. REST/read-only MCP are explicitly injected into the financial reader when enabled; administration stays absent there. See [contract and local setup](../tasks/2026_11/2026_11_10_opening-positions/contract.md); portfolio contract/HTTP/restart suites cover Memory and native local D1. Global revision selection/sequence is a constraint for future portfolio identity, not an implemented multi-portfolio model.

- `src/index.ts` exports the diagnostic-only app from `src/app.ts`. That factory optionally mounts instruments only with explicit service/auth dependencies. `src/adapters/rest/health.ts` and `src/adapters/mcp/handler.ts` independently expose diagnostics from `src/diagnostics.ts`.
- `src/domain/instruments.ts`, `src/application/{instruments,authorization,errors}.ts`, `src/ports/instruments.ts` and `src/adapters/{rest,memory}/instruments.ts` implement metadata, policies, shared services, bounded REST and per-app memory persistence.
- `scripts/dev-instruments.mjs` launches the loopback fixture from `tests/helpers/instruments-http-server.mjs`; fixed synthetic roles are outside deployment source. Instrument unit/repository/HTTP/network/contract/regression tests live in `tests/instruments.*.test.ts`.
- `tests/worker.test.ts` exercises the app with the official MCP client and raw HTTP requests. `package.json` defines checks and local development; `wrangler.jsonc` has no resource bindings.
- `src/adapters/d1/instruments.ts` implements the unchanged repository port through the native D1 binding; generated `worker-configuration.d.ts` provides native types. `migrations/0001_instruments.sql` defines catalog constraints/indexes; `0002_instrument_create_outcomes.sql` stores immutable original replay outcomes.
- `tests/fixtures/wrangler.d1-local.jsonc`, `tests/helpers/d1-local.mjs` and `scripts/dev-instruments-d1.mjs` provide ID-free local-only state and guarded HTTP composition; the owned runtime child handles awaited shutdown independently of terminal signals. Shared repository/HTTP suites cover both adapters, with additional migration/integrity/runtime/process-restart tests.
- Four migrations exist; there is no transaction/cash-event/dividend/performance persistence or stored valuation snapshot. Existing quotation history is not OHLCV. Future scope and feasibility questions belong in the roadmap/PRD, not this code map.
- Root Dockerfile, compose.yaml and .dockerignore provide optional local development; scripts/smoke-mcp.mjs verifies REST and the real MCP protocol over loopback HTTP.
