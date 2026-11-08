# Coding Assertions

## Current checks

- Run `npm run check` for strict TypeScript and Vitest; `npm run build` creates a Wrangler dry-run bundle without deploying.
- Inspect changed documentation, validate local links and memory references, and check whitespace with `git diff --check` for tracked changes. No lint command is configured.

## Boundaries

- The owner authorized the synthetic Financial Instruments slice and local D1 repository increment, isolated loopback HTTP harnesses and tests. No remote D1/cloud resources, real financial data, deployment, staging, commits, pushes or publication are authorized. Public/default Worker remains diagnostic-only pending approved authentication.
- Preserve .codex/config.toml sandbox settings. Do not commit or create branches without explicit instruction.
- Report checks performed and their limits; synthetic connectivity success does not satisfy private-data production gates.
