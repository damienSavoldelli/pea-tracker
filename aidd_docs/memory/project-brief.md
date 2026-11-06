# Project Brief

## What it is

- PEA Tracker is a personal, open-source, API-first portfolio project for one owner with approximately 20 stocks/ETFs in a Bourse Direct PEA.
- The first local increment provides REST health and an official stateless MCP ping tool; no portfolio functionality, data store or authentication provider is implemented.

## Why it exists

- Replace manual screenshots with timestamped, structured portfolio information accessible to AI assistants through read-only MCP.
- Keep public source code separate from private financial data; never store brokerage credentials or execute trades.

## Domain language

| Term | Meaning |
| --- | --- |
| PEA | French equity savings account |
| PRU | Average purchase price; accounting treatment belongs in the PRD |
| market_timestamp | Timestamp associated with the provider's market observation |
| fetched_at | Time the collector obtained the observation |
| MCP ping | Non-sensitive protocol connectivity probe; proves neither portfolio correctness nor authentication |

## Scope authority

- The approved architecture baseline is [INSTALL.md](../INSTALL.md).
- Detailed portfolio accounting and performance methodology belong in a PRD before implementation; do not infer rules from the architecture.
