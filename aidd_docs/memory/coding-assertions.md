# Coding Assertions

## Current checks

- MCP agent usability: every required parameter must have an authorized discovery
  path without manual IDs or guessing. Verify discovery → dependent read starting
  without the ID, explain entity versus snapshot/revision identifiers, and retain
  denial tests for wrong IDs. A correct API and secure refusal alone do not prove
  autonomous usability. See the [v1.1.5 incident/RETEX](../releases/v1.1.5.md).
- After adding or modifying MCP tools, refresh the ChatGPT connector catalogue
  and verify exposed tool names/descriptions before hosted acceptance. Use a new
  conversation if the old catalogue persists. Distinguish cached-client discovery
  from deployed-server behavior; never guess IDs to bypass missing discovery.
- When application validation is in the authorized scope, `npm run check` runs strict TypeScript and Vitest; `npm run build` creates a Wrangler dry-run bundle without deploying. Their existence is not an instruction to execute them during documentary work.
- Inspect changed documentation, validate local links and memory references, and check whitespace with `git diff --check` for tracked changes. No lint command is configured.

## Boundaries

- Historical synthetic Financial Instruments/local D1 authorization was followed by separately authorized V1 financial deployment and reads. The diagnostic default Worker remains separate from the Access-protected financial reader/ingestion. Neither historical approvals nor prior tests grant permanent permission for new actions; follow the active task scope and [VCS policy](vcs.md).
- Preserve hexagonal/API-first shared services, exact decimals, historical V1 reads, separately authorized V1.1 MCP journal writes, technical administration and machine ingestion. Financial writes require `portfolio:write` plus exact-intent server approval through the independent browser `portfolio:approve` channel; client flags/annotations never authorize them. Protect the real PEA. ChatGPT interpretation or explicitly indicative simulations do not replace domain calculations. See [INSTALL.md](../INSTALL.md) and the [roadmap](../roadmap.md).
- Apply the approved [V1.1.0 financial rules](../releases/v1.1.0.md): explicit fees/dividends, exact PRU/gains and dated-flow Modified Dietz from the selected 20 November broker reference, preserving provenance and unavailable states. The owner reported the first real nominal browser-approved write and rereads on 24 November after corrective deployments; production replay, concurrency and failure cases remain unvalidated. The deployed calendar covers only full-day closures for 19 XPAR assignments; individual modes/intraday/ALXP remain unknown. Closing monitoring was verified on 20 November. Preserve historical V1 contracts, generated sections, explicit assignments and existing freshness thresholds; use the [consolidated evidence](../releases/v1.1.0-validation.md). Do not run hooks, migrations, application tests or remote operations as a side effect of memory synchronization; release approval grants no future operation automatically.
- Preserve .codex/config.toml sandbox settings. Do not commit or create branches without explicit instruction.
- Report checks performed and their limits; synthetic connectivity success does not satisfy private-data production gates.
