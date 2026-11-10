# V1 resumption — synthetic vertical slices

2026-11-10. Reuse the owner-approved [financial backend PRD](../2026_11_08-financial-backend-prd.md)
and [architecture baseline](../../../INSTALL.md). ChatGPT connection/list evidence
is recorded [here](interop-evidence.md). OAuth closure checks may proceed alongside
local business development; no new provider comparison or architecture change.

| Order | Next bounded task | Acceptance / dependency |
| --- | --- | --- |
| 1 | Specify dated opening portfolio state | Reference existing instrument IDs; retain effective date, quantities, supplied cost basis and cash, provenance and correction history. Initialize without invented purchases or earlier performance. Resolve only the date/correction/precision decisions needed by this slice |
| 2 | Implement opening state and current position reads | After approval of the slice plan/contract, add reusable REST/OpenAPI capabilities and shared services with memory/local D1 adapters and migrations. Verify idempotency, concurrency, atomicity, date boundaries and exact decimal round trips with synthetic records. Add read-only MCP adapters over those services |
| 3 | Add quotation storage and restricted ingestion | Establish provider identity/coverage and units; start with deterministic synthetic fixtures, then the approved Python/yfinance collector. Separate ingestion permission from owner administration/MCP reads. Keep market timestamp, fetched timestamp and source; failures preserve the last usable quote and do not advance freshness |
| 4 | Add current valuation | Reuse positions and quotations in shared services. Specify/test decimal precision and rounding before calculation. Disclose missing/stale inputs and partial coverage. Present market value, supplied/approved cost basis and unrealized result separately; dependent conventions require explicit approval |

For each slice: agree the small contract and necessary financial decisions, then
implement/test REST and persistence, then expose the same read capability through
MCP. Preserve the existing InstrumentRepository port, D1 behavior and diagnostic
DEV deployment. Use local HTTP tests with synthetic principals; the Access PoC
grants no REST administration or collector ingestion. A future hosted business
endpoint needs its own approved authentication policy and deployment authorization.

Weighted-average cost basis remains preferred. Broker-fee treatment, trade versus
settlement conventions and dependent transaction calculations remain pending owner
approval; do not invent defaults to unblock opening-state storage. Opening state
alone does not establish past returns. Historical performance stays explicitly
unavailable when required source history is missing; advanced performance,
dividends and corporate actions do not block these bounded slices.

Keep all records synthetic. OAuth PoC success does not satisfy financial correctness,
recovery, privacy or release gates for real holdings. This sequence prepares the
next implementation plan only; it does not authorize code changes, dependencies,
remote D1/resources, deployments or Git writes.
