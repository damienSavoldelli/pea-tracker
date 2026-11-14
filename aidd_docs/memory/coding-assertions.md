# Coding Assertions

## Current checks

- When application validation is in the authorized scope, `npm run check` runs strict TypeScript and Vitest; `npm run build` creates a Wrangler dry-run bundle without deploying. Their existence is not an instruction to execute them during documentary work.
- Inspect changed documentation, validate local links and memory references, and check whitespace with `git diff --check` for tracked changes. No lint command is configured.

## Boundaries

- Historical synthetic Financial Instruments/local D1 authorization was followed by separately authorized V1 financial deployment and reads. The diagnostic default Worker remains separate from the Access-protected financial reader/ingestion. Neither historical approvals nor prior tests grant permanent permission for new actions; follow the active task scope and [VCS policy](vcs.md).
- Preserve hexagonal/API-first shared services, exact decimals, read-only MCP, separate administration and machine ingestion, and the real PEA priority. ChatGPT interpretation or explicitly indicative simulations do not replace reference domain calculations. See [INSTALL.md](../INSTALL.md) and the [roadmap](../roadmap.md).
- The bounded calendar has a separately authorized local implementation; broader V1.1 work and feasibility are not approved by that delivery. Financial conventions remain open in the [PRD supplement](../tasks/2026_11/2026_11_08-financial-backend-prd.md). Preserve historical V1 contracts and generated AIDD sections; do not run hooks, migrations, application tests or remote operations as a side effect of memory synchronization. Calendar changes must retain explicit profile assignment, unknown fallbacks and the existing freshness policy; use the [targeted validation evidence](../tasks/2026_11/2026_11_14_market-calendar/reference-validation.md) for the authorized slice.
- Preserve .codex/config.toml sandbox settings. Do not commit or create branches without explicit instruction.
- Report checks performed and their limits; synthetic connectivity success does not satisfy private-data production gates.
