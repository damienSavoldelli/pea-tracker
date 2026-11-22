# Project Brief

## Published delivery — reviewed 2026-11-22

V1.1.0 was published on 21 November after V1.0.0. The financial foundation is
implemented, locally tested and deployed on the existing Worker. Historical V1 reads are preserved;
current reads use a separately imported operational reference and an initially
empty journal, without reconstructing omitted trades. Financial MCP commands are
enabled with exact-owner authorization and independent browser approval. No real
transaction has validated that complete approval/write/replay journey in production.

Exact cost/PRU, fees, dividends, realized/unrealized gains and dated external flows
are implemented. Historical fee treatment remains unknown. The separate broker
market-value reference at the 20 November close supports EUR economic gain and
estimated non-annualized Modified Dietz with dated external flows, source caveats
and explicit unavailable states. No earlier transactions/prices are reconstructed.
The 18 MCP tools provide 11 reads/diagnostics, six preparations and one confirmation;
browser approval has its own server permission. The partial venue calendar covers
19 XPAR instruments on fully closed days; individual modes/intraday/ALXP remain
unknown. Closing monitoring succeeded on 20 November; independent alerting remains
open in the [roadmap](../roadmap.md). Do not reopen completed OAuth diagnostics or
financial implementation solely because older slice documents describe local scope.

[Release scope](../releases/v1.1.0.md), [consolidated validation](../releases/v1.1.0-validation.md)
and [financial security contract](../tasks/2026_11/2026_11_21_financial-mcp/contract.md).
New commits and remote changes still require the applicable explicit authorization.

## What it is

- PEA Tracker is a personal, open-source, API-first portfolio project for one owner with approximately 20 stocks/ETFs in a Bourse Direct PEA.
- V1 provides catalogue, declared opening positions/PRU/cash, stored quotations and exact EUR valuation through shared REST/read-only MCP services on native D1. Prior real ChatGPT reads and hosted ingestion are operational evidence; synthetic tests establish separate local behavior. The diagnostic default Worker remains a distinct composition. See [current V1 evidence](../tasks/2026_11/2026_11_14_live-quotations-read/runbook.md).
- The owner confirmed REST `/api/v1` with OpenAPI as the reusable product interface and MCP `/mcp` as an AI-facing adapter over shared services. This is one application/codebase; no mandatory portfolio UI or speculative tenancy.

## Why it exists

- Replace manual screenshots with timestamped, structured portfolio information accessible to AI assistants through protected MCP consultation and owner-approved journal commands.
- Keep public source code separate from private financial data; never store brokerage credentials or execute trades.
- Protect the real PEA first. Trading Lab is a complementary, isolated future use; reference financial calculations belong to the domain. ChatGPT interprets results and may perform separate, explicitly indicative simulations.

## Domain language

| Term | Meaning |
| --- | --- |
| PEA | French equity savings account |
| Declared PRU | Broker-supplied unit value retained as a declaration; not an exact reconstructed historical total cost |
| Calculated PRU / cost basis | Implemented exact weighted-average cost; declared buy fees capitalized, sell fees deducted from proceeds; historical fee treatment unknown |
| Unrealized gains | Current valuation relative to approved remaining cost basis; distinct from total portfolio performance |
| Total portfolio performance | EUR economic gain and estimated Modified Dietz since the selected 20 November broker market-value reference, adjusted for dated external flows; unavailable on missing/incompatible inputs, not reconstructed prior history |
| market_timestamp | Timestamp associated with the provider's market observation |
| fetched_at | Time the collector obtained the observation |
| MCP ping | Non-sensitive protocol connectivity probe; proves neither portfolio correctness nor authentication |

## Scope authority

- The approved architecture baseline is [INSTALL.md](../INSTALL.md).
- The [roadmap](../roadmap.md) governs future version scope: V1.1 financial management is deployed with explicit local/production evidence and outstanding acceptance limits; V2.3 holds periodic performance, TWR/XIRR, allocation and advanced analysis. Future scope is not implicitly approved. Exports, deletion and restoration retain existing requirements without an invented version assignment.
- Detailed portfolio accounting and performance methodology belong in a PRD before implementation; do not infer rules from the architecture.
- The [financial backend PRD](../tasks/2026_11/2026_11_08-financial-backend-prd.md) preserves its owner-approved product baseline (2026-11-08) and adds a dated current-scope supplement. Dated opening state initializes existing holdings without fabricated transactions; incomplete source history means unavailable historical performance.
- The owner approved [Financial Instruments implementation](../tasks/2026_11/2026_11_08_financial-instruments/plan.md), including real loopback HTTP tests with synthetic principals; its [OpenAPI contract](../api/openapi.json) is implemented locally. Catalog delivery does not depend on advanced financial rules. The broader [design proposal](../tasks/2026_11/2026_11_06_financial-backend/design.md) remains context, not blanket approval.
- Historical synthetic/local approvals were followed by separately authorized V1 operation and the published V1.1.0. Use the [consolidated evidence](../releases/v1.1.0-validation.md) for delivered scope, partial calendar activation and closing monitoring, keeping earlier pending checkpoints historical. The first real owner-approved financial write remains unvalidated; functional reads do not certify all security/recovery gates. Code, new data loads, tests, remote operations, Git staging/publication and security changes still require their applicable authorization; historical permissions are not permanent.
