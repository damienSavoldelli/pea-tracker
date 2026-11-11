# Codebase Map

## Areas

- [INSTALL.md](../INSTALL.md): approved architecture, proposed application layout and stage-specific validation gates.
- [README.md](../README.md): AIDD documentation entry point.
- [Financial backend design proposal](../tasks/2026_11/2026_11_06_financial-backend/design.md): broader proposed resource/MCP/auth roadmap and open financial decisions; the separate instrument-only increment is implemented, remaining financial features are not.
- [Approved financial backend PRD](../tasks/2026_11/2026_11_08-financial-backend-prd.md): product baseline approved 2026-11-08; financial conventions remain explicitly open.
- [Financial Instruments plan](../tasks/2026_11/2026_11_08_financial-instruments/plan.md) and [contract](../tasks/2026_11/2026_11_08_financial-instruments/contract.md): implemented synthetic catalog slice, memory repository boundaries and test criteria.
- [OpenAPI contract](../api/openapi.json): existing health and four local-only instrument operations; offline official schema snapshot under api/schemas supports validator tests. OAuth/provider runtime is not configured.
- [D1 plan](../tasks/2026_11/2026_11_08_d1-instruments/plan.md) and implementation record: local-native persistence, atomicity, migration and restart evidence.
- This memory bank: durable project context; internal/external notes are read on demand.
- Root AGENTS.md: shared assistant instructions; CLAUDE.md imports them for Claude Code.
- Root .codex/config.toml: workspace-write sandbox, on-request approvals and restricted network access.

## Entry points

- Collector slice: `collector/pea_collector/` separates yfinance retrieval, strict mapping/normalization, HTTPS machine ingestion, private replay journals, CLI, cadence/monitor and fixed local check/qualification launchers. `collector/uv.lock` pins Python dependencies; `collector/tests/` uses synthetic fixtures and denies external network. Optional `src/collector-app.ts` reuses existing JWT machine policies; quotation adapter `ingestionOnly` leaves read routes absent. Four `tests/collector.http.test.ts` cases launch Python against Memory/local D1 Hono. Two `.github/workflows/quotation-*.yml` files are manual-only; Cron activation/secrets/resources require approval. See [contract and limitations](../tasks/2026_11/2026_11_11_collector/contract.md).

- Valuation slice: `src/domain/valuation.ts` supplies exact finite decimal products/sums and half-even EUR display; `src/application/valuation.ts` reuses PortfolioService and QuotationService over existing Memory/native D1 ports. Optional REST `/api/v1/portfolio/valuation` and read-only MCP `get_portfolio_valuation` expose input provenance, warnings and partial/complete coverage. No new migration, persisted snapshot, FX or gain calculation. [Contract](../tasks/2026_11/2026_11_11_valuation/contract.md) includes the guarded local HTTP setup; three `tests/valuation.*.test.ts` suites cover arithmetic, both persistence adapters, HTTP and official SDK.

- Quotation slice: `src/domain/quotations.ts`, `src/application/quotations.ts`, `src/ports/quotations.ts`, Memory/D1/REST adapters and `0004_quotations.sql` store provider declarations and failure outcomes. Explicit local injection enables history/status reads and two read-only MCP tools; ingestion has independent subject/provider/instrument grants. [Contract](../tasks/2026_11/2026_11_11_quotations/contract.md) defines timestamps/freshness and the synthetic loopback setup; no collector/valuation or deployed route is added.

- Opening-state/position slice: `src/domain/portfolio.ts`, `src/application/portfolio.ts`, `src/ports/portfolio.ts` and `src/adapters/{memory,d1,rest}/portfolio.ts`; `migrations/0003_opening_portfolio.sql` adds complete immutable revisions and durable outcomes. REST and optional read-only MCP tools are explicitly injected, not mounted by deployed entrypoints. See [contract and local setup](../tasks/2026_11/2026_11_10_opening-positions/contract.md); portfolio contract/HTTP/restart suites cover Memory and native local D1.

- `src/index.ts` exports the diagnostic-only app from `src/app.ts`. That factory optionally mounts instruments only with explicit service/auth dependencies. `src/adapters/rest/health.ts` and `src/adapters/mcp/handler.ts` independently expose diagnostics from `src/diagnostics.ts`.
- `src/domain/instruments.ts`, `src/application/{instruments,authorization,errors}.ts`, `src/ports/instruments.ts` and `src/adapters/{rest,memory}/instruments.ts` implement metadata, policies, shared services, bounded REST and per-app memory persistence.
- `scripts/dev-instruments.mjs` launches the loopback fixture from `tests/helpers/instruments-http-server.mjs`; fixed synthetic roles are outside deployment source. Instrument unit/repository/HTTP/network/contract/regression tests live in `tests/instruments.*.test.ts`.
- `tests/worker.test.ts` exercises the app with the official MCP client and raw HTTP requests. `package.json` defines checks and local development; `wrangler.jsonc` has no resource bindings.
- `src/adapters/d1/instruments.ts` implements the unchanged repository port through the native D1 binding; generated `worker-configuration.d.ts` provides native types. `migrations/0001_instruments.sql` defines catalog constraints/indexes; `0002_instrument_create_outcomes.sql` stores immutable original replay outcomes.
- `tests/fixtures/wrangler.d1-local.jsonc`, `tests/helpers/d1-local.mjs` and `scripts/dev-instruments-d1.mjs` provide ID-free local-only state and guarded HTTP composition; the owned runtime child handles awaited shutdown independently of terminal signals. Shared repository/HTTP suites cover both adapters, with additional migration/integrity/runtime/process-restart tests.
- No collection pipeline, portfolio services or CI workflows exist. The larger source tree in INSTALL.md remains a proposal.
- Root Dockerfile, compose.yaml and .dockerignore provide optional local development; scripts/smoke-mcp.mjs verifies REST and the real MCP protocol over loopback HTTP.
