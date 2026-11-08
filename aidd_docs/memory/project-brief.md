# Project Brief

## What it is

- PEA Tracker is a personal, open-source, API-first portfolio project for one owner with approximately 20 stocks/ETFs in a Bourse Direct PEA.
- Default application provides REST health and an official stateless MCP ping tool. Synthetic instrument REST CRUD/shared services and per-app memory repository are implemented for isolated tests and explicit loopback HTTP development; no ledger, financial calculations, durable store or authentication provider exists.
- The owner confirmed REST `/api/v1` with OpenAPI as the reusable product interface and MCP `/mcp` as an AI-facing adapter over shared services. This is one application/codebase; no mandatory portfolio UI or speculative tenancy.

## Why it exists

- Replace manual screenshots with timestamped, structured portfolio information accessible to AI assistants through read-only MCP.
- Keep public source code separate from private financial data; never store brokerage credentials or execute trades.

## Domain language

| Term | Meaning |
| --- | --- |
| PEA | French equity savings account |
| PRU / cost basis | Acquisition-cost concept; weighted-average preferred, fee treatment/conventions pending approval |
| Unrealized gains | Current valuation relative to approved remaining cost basis; distinct from total portfolio performance |
| Total portfolio performance | Period-based result requiring approved cash-flow/history methodology; unavailable when source history is insufficient |
| market_timestamp | Timestamp associated with the provider's market observation |
| fetched_at | Time the collector obtained the observation |
| MCP ping | Non-sensitive protocol connectivity probe; proves neither portfolio correctness nor authentication |

## Scope authority

- The approved architecture baseline is [INSTALL.md](../INSTALL.md).
- Detailed portfolio accounting and performance methodology belong in a PRD before implementation; do not infer rules from the architecture.
- The [financial backend PRD](../tasks/2026_11/2026_11_08-financial-backend-prd.md) is the owner-approved product baseline (2026-11-08). Dated opening state initializes existing holdings without fabricated transactions; incomplete source history means unavailable historical performance.
- The owner approved [Financial Instruments implementation](../tasks/2026_11/2026_11_08_financial-instruments/plan.md), including real loopback HTTP tests with synthetic principals; its [OpenAPI contract](../api/openapi.json) is implemented locally. Catalog delivery does not depend on advanced financial rules. The broader [design proposal](../tasks/2026_11/2026_11_06_financial-backend/design.md) remains context, not blanket approval.
- Authorization covers this synthetic instrument slice, local harness and tests only: no D1/cloud resources, real data, deployment/plugin changes or staging/commits/pushes. Existing public health/ping remain diagnostic-only; no private routes may be publicly exposed before approved auth.
