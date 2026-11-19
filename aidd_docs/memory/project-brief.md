# Project Brief

Current V1 (2026-11-19): functionally accepted with minor reservations. Protected REST/read-only MCP, opening positions/cash, quotations and exact-decimal valuation are operational. Cloudflare schedules Python/yfinance workflows on GitHub Actions. No transaction ledger or historical-performance engine exists yet. See [acceptance](../releases/v1.0.0-validation.md). Historical authorization boundaries below were superseded only by individually approved operational stages; new remote changes still require scoped approval. The real PEA remains the priority.

## What it is

- PEA Tracker is a personal, open-source, API-first portfolio project for one owner with approximately 20 stocks/ETFs in a Bourse Direct PEA.
- V1 provides catalogue, declared opening positions/PRU/cash, stored quotations and exact EUR valuation through shared REST/read-only MCP services on native D1. Prior real ChatGPT reads and hosted ingestion are operational evidence; synthetic tests establish separate local behavior. The diagnostic default Worker remains a distinct composition. See [current V1 evidence](../tasks/2026_11/2026_11_14_live-quotations-read/runbook.md).
- The owner confirmed REST `/api/v1` with OpenAPI as the reusable product interface and MCP `/mcp` as an AI-facing adapter over shared services. This is one application/codebase; no mandatory portfolio UI or speculative tenancy.

## Why it exists

- Replace manual screenshots with timestamped, structured portfolio information accessible to AI assistants through read-only MCP.
- Keep public source code separate from private financial data; never store brokerage credentials or execute trades.
- Protect the real PEA first. Trading Lab is a complementary, isolated future use; reference financial calculations belong to the domain. ChatGPT interprets results and may perform separate, explicitly indicative simulations.

## Domain language

| Term | Meaning |
| --- | --- |
| PEA | French equity savings account |
| Declared PRU | Broker-supplied unit value retained as a declaration; not an exact reconstructed historical total cost |
| Calculated PRU / cost basis | Future acquisition-cost calculation; weighted-average preferred, fee treatment/conventions pending approval |
| Unrealized gains | Current valuation relative to approved remaining cost basis; distinct from total portfolio performance |
| Total portfolio performance | Period-based result requiring approved cash-flow/history methodology; unavailable when source history is insufficient |
| market_timestamp | Timestamp associated with the provider's market observation |
| fetched_at | Time the collector obtained the observation |
| MCP ping | Non-sensitive protocol connectivity probe; proves neither portfolio correctness nor authentication |

## Scope authority

- The approved architecture baseline is [INSTALL.md](../INSTALL.md).
- The [roadmap](../roadmap.md) governs future version scope: V1.1 studies daily management, capital invested, PRU/gains and an explicit simple return; V2.3 holds periodic performance, TWR/XIRR, allocation and advanced analysis. No financial formula or global V1.1 feasibility is approved. Exports, deletion and restoration retain existing requirements without an invented version assignment.
- Detailed portfolio accounting and performance methodology belong in a PRD before implementation; do not infer rules from the architecture.
- The [financial backend PRD](../tasks/2026_11/2026_11_08-financial-backend-prd.md) preserves its owner-approved product baseline (2026-11-08) and adds a dated current-scope supplement. Dated opening state initializes existing holdings without fabricated transactions; incomplete source history means unavailable historical performance.
- The owner approved [Financial Instruments implementation](../tasks/2026_11/2026_11_08_financial-instruments/plan.md), including real loopback HTTP tests with synthetic principals; its [OpenAPI contract](../api/openapi.json) is implemented locally. Catalog delivery does not depend on advanced financial rules. The broader [design proposal](../tasks/2026_11/2026_11_06_financial-backend/design.md) remains context, not blanket approval.
- Historical authorization started with synthetic instrument/local D1 slices; separately authorized V1 operation followed with Access owner reads and machine ingestion. The bounded calendar is now separately authorized, implemented and tested locally; see [calendar evidence and exclusions](../tasks/2026_11/2026_11_14_market-calendar/reference-validation.md). This does not approve broader V1.1 feasibility or remote activation. Code, new data loads, tests, remote operations, Git staging/publication and security changes still require their applicable authorization; none of these historical permissions is permanent. Scheduled operation on 16 November still needs confirmation; a functional V1 does not certify all security/recovery gates.
