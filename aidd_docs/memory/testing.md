# Testing

## Current state

- Python collector: install the locked editable package in `collector/.venv`, then run `collector/.venv/bin/python -m pea_collector.checks --`. Synthetic pytest cases deny external network except loopback and cover normalization, delivery, recovery and inactive workflow guards. Offline qualification uses synthetic data; `qualify --live` performs explicit real provider requests and needs approval. Four host Vitest cases bridge the actual Python CLI to existing signed machine JWT/Hono services on Memory/native local D1; they explicitly skip without the venv, so a full host run with it is required for cross-language evidence. See the [collector plan](../tasks/2026_11/2026_11_11_collector/plan.md); hosted Actions/Linux, remote machine setup and Yahoo rights/full coverage remain separate gates.

- `npm test` runs Vitest against the Hono app using Web-standard Request/Response and the official MCP client; it covers the complete SDK initialization/discovery/invocation path plus invalid requests.
- `npm run typecheck` performs strict checks; `npm run build` checks Worker bundling. A local Wrangler smoke test complements Node-based tests; these do not prove deployed CPU budgets or ChatGPT connectivity.
- Python/pytest and financial correctness tests are deferred until those components exist.
- Instrument suites cover domain/repository/service policy, idempotency, CAS updates, pagination, bounded HTTP errors and default-entrypoint isolation. Network tests start ephemeral 127.0.0.1 servers with fixed synthetic principals, validate real HTTP responses against OpenAPI, and close all servers. Sandbox permission to bind loopback is required.
- Offline OpenAPI validation uses the official OAS 3.1 snapshot and installed Ajv/ajv-formats. See [schema notes](../api/schemas/README.md) for the narrow Ajv dynamic-anchor workaround and media-range annotation limitation. Semantic checksum/auth/retry tests remain separate.
- Manual local setup: `node scripts/dev-instruments.mjs --principal admin --port 8788`; README has synthetic curl examples and teardown. It is not an OAuth or production persistence test.
- D1 uses actual Wrangler local workerd through the native binding, not a SQLite mock. Shared repository and network suites run on Memory and D1. Additional tests prove batch rollback, zero-row success, foreign keys, migration fresh/repeat/upgrade/failure, integrity constraints/index plans and process-restart replay/version durability. D1 server shutdown is tested with a process-group SIGINT; owned runtime is detached from terminal signals and disposed via IPC.
- OAuth suites use ephemeral RS256 keys/tokens, policy tests, bounded synthetic JWKS providers and real loopback HTTP/official MCP SDK workflows. The native workerd fixture uses the installed Miniflare 5 inline manifest, no env/credential loader, telemetry, remote binding or persistent state. It is test-only and never a deployment entrypoint. These tests establish local resource-server verification, not real Auth0 authorization-code/PKCE/refresh behavior or hosted connector success.
- Local config has no remote/account IDs or secret variables. CLI --persist-to root maps to proxy persist.path root/v3. Each test owns .wrangler/d1-tests-* and disposes workerd before cleanup; developer .wrangler/instruments-d1-local remains persistent. Native declarations are generated using installed Wrangler; no additional dependencies are required. Run checks with loopback permission.
- Optional container checks: `docker compose exec worker npm run check`; with Compose running, host `node scripts/smoke-mcp.mjs` verifies published-port REST and SDK initialization/list/call. The same script via `docker compose exec worker` checks container loopback. See the root README for setup and teardown.

## Validation boundaries

- The architecture permits a bounded synthetic-data MCP initialization/ping proof of concept without portfolio, backup or calculation infrastructure.
- OAuth, CPU, decimal correctness, private-data authorization, monitoring and restoration require their own evidence; ping alone proves none of them.
- Synthetic catalog authorization fixtures do not prove OAuth issuer/owner/audience verification or persistent abuse controls. Real local D1 tests prove tested batch atomicity and graceful process restarts only. Node real HTTP plus Worker dry-run bundling does not establish production CPU budgets, remote durability, power-loss behavior or backup restoration.
- Use synthetic fixtures in public CI and logs. Never use actual holdings, brokerage credentials, financial exports or access tokens as fixtures.
- See [INSTALL.md](../INSTALL.md) for production acceptance gates; Mermaid diagrams have not been renderer-validated.
