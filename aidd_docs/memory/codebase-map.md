# Codebase Map

## Areas

- [INSTALL.md](../INSTALL.md): approved architecture, proposed application layout and stage-specific validation gates.
- [README.md](../README.md): AIDD documentation entry point.
- [Financial backend design proposal](../tasks/2026_11/2026_11_06_financial-backend/design.md): broader proposed resource/MCP/auth roadmap and open financial decisions; the separate instrument-only increment is implemented, remaining financial features are not.
- [Approved financial backend PRD](../tasks/2026_11/2026_11_08-financial-backend-prd.md): product baseline approved 2026-11-08; financial conventions remain explicitly open.
- [Financial Instruments plan](../tasks/2026_11/2026_11_08_financial-instruments/plan.md) and [contract](../tasks/2026_11/2026_11_08_financial-instruments/contract.md): implemented synthetic catalog slice, memory repository boundaries and test criteria.
- [OpenAPI contract](../api/openapi.json): existing health and four local-only instrument operations; offline official schema snapshot under api/schemas supports validator tests. OAuth/provider runtime is not configured.
- This memory bank: durable project context; internal/external notes are read on demand.
- Root AGENTS.md: shared assistant instructions; CLAUDE.md imports them for Claude Code.
- Root .codex/config.toml: workspace-write sandbox, on-request approvals and restricted network access.

## Entry points

- `src/index.ts` exports the diagnostic-only app from `src/app.ts`. That factory optionally mounts instruments only with explicit service/auth dependencies. `src/adapters/rest/health.ts` and `src/adapters/mcp/handler.ts` independently expose diagnostics from `src/diagnostics.ts`.
- `src/domain/instruments.ts`, `src/application/{instruments,authorization,errors}.ts`, `src/ports/instruments.ts` and `src/adapters/{rest,memory}/instruments.ts` implement metadata, policies, shared services, bounded REST and per-app memory persistence.
- `scripts/dev-instruments.mjs` launches the loopback fixture from `tests/helpers/instruments-http-server.mjs`; fixed synthetic roles are outside deployment source. Instrument unit/repository/HTTP/network/contract/regression tests live in `tests/instruments.*.test.ts`.
- `tests/worker.test.ts` exercises the app with the official MCP client and raw HTTP requests. `package.json` defines checks and local development; `wrangler.jsonc` has no resource bindings.
- No database migrations, collection pipeline, portfolio services or CI workflows exist. The larger source tree in INSTALL.md remains a proposal.
- Root Dockerfile, compose.yaml and .dockerignore provide optional local development; scripts/smoke-mcp.mjs verifies REST and the real MCP protocol over loopback HTTP.
