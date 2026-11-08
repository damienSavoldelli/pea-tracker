# Testing

## Current state

- `npm test` runs Vitest against the Hono app using Web-standard Request/Response and the official MCP client; it covers the complete SDK initialization/discovery/invocation path plus invalid requests.
- `npm run typecheck` performs strict checks; `npm run build` checks Worker bundling. A local Wrangler smoke test complements Node-based tests; these do not prove deployed CPU budgets or ChatGPT connectivity.
- Python/pytest and financial correctness tests are deferred until those components exist.
- Instrument suites cover domain/repository/service policy, idempotency, CAS updates, pagination, bounded HTTP errors and default-entrypoint isolation. Network tests start ephemeral 127.0.0.1 servers with fixed synthetic principals, validate real HTTP responses against OpenAPI, and close all servers. Sandbox permission to bind loopback is required.
- Offline OpenAPI validation uses the official OAS 3.1 snapshot and installed Ajv/ajv-formats. See [schema notes](../api/schemas/README.md) for the narrow Ajv dynamic-anchor workaround and media-range annotation limitation. Semantic checksum/auth/retry tests remain separate.
- Manual local setup: `node scripts/dev-instruments.mjs --principal admin --port 8788`; README has synthetic curl examples and teardown. It is not an OAuth or production persistence test.
- Optional container checks: `docker compose exec worker npm run check`; with Compose running, host `node scripts/smoke-mcp.mjs` verifies published-port REST and SDK initialization/list/call. The same script via `docker compose exec worker` checks container loopback. See the root README for setup and teardown.

## Validation boundaries

- The architecture permits a bounded synthetic-data MCP initialization/ping proof of concept without portfolio, backup or calculation infrastructure.
- OAuth, CPU, decimal correctness, private-data authorization, monitoring and restoration require their own evidence; ping alone proves none of them.
- Synthetic catalog authorization fixtures do not prove OAuth issuer/owner/audience verification or persistent abuse controls. Node real HTTP tests plus Worker dry-run bundling do not establish workerd financial-route CPU/runtime behavior or D1 atomicity/recovery.
- Use synthetic fixtures in public CI and logs. Never use actual holdings, brokerage credentials, financial exports or access tokens as fixtures.
- See [INSTALL.md](../INSTALL.md) for production acceptance gates; Mermaid diagrams have not been renderer-validated.
