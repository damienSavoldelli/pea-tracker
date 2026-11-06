# Testing

## Current state

- `npm test` runs Vitest against the Hono app using Web-standard Request/Response and the official MCP client; it covers the complete SDK initialization/discovery/invocation path plus invalid requests.
- `npm run typecheck` performs strict checks; `npm run build` checks Worker bundling. A local Wrangler smoke test complements Node-based tests; these do not prove deployed CPU budgets or ChatGPT connectivity.
- Python/pytest and financial correctness tests are deferred until those components exist.

## Validation boundaries

- The architecture permits a bounded synthetic-data MCP initialization/ping proof of concept without portfolio, backup or calculation infrastructure.
- OAuth, CPU, decimal correctness, private-data authorization, monitoring and restoration require their own evidence; ping alone proves none of them.
- Use synthetic fixtures in public CI and logs. Never use actual holdings, brokerage credentials, financial exports or access tokens as fixtures.
- See [INSTALL.md](../INSTALL.md) for production acceptance gates; Mermaid diagrams have not been renderer-validated.
