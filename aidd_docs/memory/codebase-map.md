# Codebase Map

## Areas

- [INSTALL.md](../INSTALL.md): approved architecture, proposed application layout and stage-specific validation gates.
- [README.md](../README.md): AIDD documentation entry point.
- This memory bank: durable project context; internal/external notes are read on demand.
- Root AGENTS.md: shared assistant instructions; CLAUDE.md imports them for Claude Code.
- Root .codex/config.toml: workspace-write sandbox, on-request approvals and restricted network access.

## Entry points

- `src/index.ts` composes Hono routes; `src/adapters/rest/health.ts` and `src/adapters/mcp/handler.ts` independently expose diagnostics from `src/diagnostics.ts`.
- `tests/worker.test.ts` exercises the app with the official MCP client and raw HTTP requests. `package.json` defines checks and local development; `wrangler.jsonc` has no resource bindings.
- No database migrations, collection pipeline, portfolio services or CI workflows exist. The larger source tree in INSTALL.md remains a proposal.
