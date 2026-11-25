---
status: implemented
---

# V2.0-B — Secure portfolio resolution and reads

Authority: owner's inline V2.0-B plan, local implementation/tests/documentation only.
Base: `8a3eaba6399a3c152d0b236ac855882ecb657d1e` on
`feat/v2.0b-portfolio-reads`. Reuses [V2.0-A decisions and evidence](../2026_11_21_portfolio-registry/plan.md)
and the preceding conversational spike. No new general audit or production check.

## Delivery steps

1. Central owner-scoped resolution, immutable opening and performance-reference binding.
2. Separate REST/MCP reads using existing transaction, portfolio and valuation services.
3. Synthetic native D1/service/REST/SDK and signed Worker compatibility checks.
4. Record actual validation and remaining boundaries in this file and existing memory.

## Contract decisions

- Keep all 18 old MCP tools and `/api/v1` reads/writes on their existing services.
  Add `/api/v2/portfolios` list, metadata, state and valuation reads; no mutable default.
- Add only four read-only MCP tools: `list_portfolios`, `get_portfolio_details`,
  `get_portfolio_state`, `get_portfolio_market_value`. The full financial catalogue
  becomes 22 tools when all read/write capabilities are enabled.
- Owner and `portfolio:read` are checked in the application; valuations also require
  `quotes:read`. Unknown and foreign UUIDs produce the same 404/code. No owner override.
- Active and archived portfolios are readable. Responses identify status/kind and
  `read_only=true`. Archived holdings are not a frozen archive-date quote snapshot;
  quotes retain their actual timestamps and the existing valuation warnings.
- References are selected by a trusted per-portfolio map, never client parameters.
  The Worker reuses only its already configured PEA reference, keyed to that exact
  portfolio. Other references remain absent until explicitly supplied by trusted
  composition. No new reference table, setter, configuration flag or migration.
- No new writes, proposals, approvals, archive/reactivation endpoint, simulated
  trading or collector/provider work. All production operations and commits excluded.

## Validation

All four delivery steps are complete locally. No production validation claimed.

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/portfolio-reads.test.ts --exclude '**/.wrangler/**'
node node_modules/vitest/vitest.mjs run tests/financial-mcp.test.ts --testNamePattern 'official MCP SDK|requires a separately authorized approver' --exclude '**/.wrangler/**'
node node_modules/vitest/vitest.mjs run tests/worker.test.ts --exclude '**/.wrangler/**'
git diff --check
```

- 11 new cases passed: service ownership/pagination, several real/simulated openings,
  empty/archived reads, permissions and unknown/foreign UUIDs, shared quotation IDs,
  missing/incompatible/cloned references, offline OpenAPI validation, REST contract
  bodies, official MCP SDK and signed financial Worker composition.
- 2 existing financial cases passed; 19 unrelated cases were filtered out. The
  official SDK → signed browser → native local D1 append/receipt/replay journey
  still succeeds on synthetic legacy data. The legacy tool catalogue remains
  present, with four read-only additions (22 total). Real/simulated new portfolios
  remain refused by the existing financial preparation chain.
- 22 existing common Hono/MCP diagnostic tests passed after its optional wiring
  changed. Total: **35 distinct targeted tests**, plus typecheck and whitespace check.
- Tests use native local D1, two synthetic internal identities and ephemeral signed
  Access assertions. The Worker still accepts only its configured external owner;
  no user management, Access policy change or financial production event is implied.
- No new migration or dependency. Existing registry/migration evidence is reused.
  No full suite, live market query, cloud mutation, push, commit or deployment.

## API and implementation map

The separate [OpenAPI contract](../../../api/portfolio-reads.openapi.json) references
existing V1.1 state/valuation schemas rather than copying the financial DTOs.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/v2/portfolios?limit=50&after=UUID` | Owned metadata, including archives; `page.next_after` |
| GET | `/api/v2/portfolios/{portfolioId}` | Metadata, opening provenance/reference, reference availability |
| GET | `/api/v2/portfolios/{portfolioId}/state` | Owner-bound projected holdings/cash/PRU and journal version |
| GET | `/api/v2/portfolios/{portfolioId}/valuation` | Explicit provider/price_kind/adjustment, values and applicable performance |

All results identify portfolio UUID/kind/status and `read_only=true`. No-store and
nosniff headers, strict query keys, GET-only methods and same-origin checks apply.
The `portfolio_id` passed to MCP is only a lookup key, never an authorization grant.

`src/application/portfolio-reads.ts` resolves the registry and opening per request,
then privately constructs existing `TransactionService`/`PortfolioService`/
`ValuationService` instances. Their write methods are never exposed; the bound
opening repository also refuses append. Reads of an empty journal derive version-0
balances from the opening, without creating a journal or events. Metadata version,
opening revision and journal version remain distinct.

Adapters: `src/adapters/{rest,mcp}/portfolio-reads.ts`. Optional mounting is in
`src/app.ts` and the MCP handler. `src/entrypoints/access-financial.ts` injects shared
instruments/quotations and the existing D1 binding; its old financial service,
browser approval dependencies, configuration schema, audiences and V1 routes remain
unchanged. The diagnostic and ingestion entrypoints do not receive the new service.

## Remaining limits and V2.0-C prerequisites

- Local GO only. A future remote activation needs separately approved migration
  0008/adoption and verification that Access protects the new `/api/v2` paths.
  A missing registry fails closed on new reads; legacy routes remain independent.
- The Worker has only the already configured legacy performance reference. New
  portfolios report unavailable performance unless a trusted composition supplies
  an independently evidenced reference for that exact UUID/kind/opening/revision.
  No client reference injection, market-price invention or PRU-based initial value.
- Archive is a consultation status, not an archive-time valuation snapshot. This
  slice does not add financial writes or change the legacy financial write chain;
  V2.0-C must enforce status at its write boundary as well as in approval routing.
- Legacy REST/MCP reads retain their original operational-reference metadata.
  V2 wrappers use the exact selected opening and registry source/ID/revision;
  they do not reconstruct missing historical transactions or performances.
- New independent journal anchors are still intentionally unavailable for appends.
  C must extend the SQL guards through a separately tested additive migration,
  preserve old canonical receipt/digest formats, bind approvals to owner/kind/
  portfolio/opening/version, and keep real and simulated authority separate.
- Existing caps and per-quotation snapshot/freshness limits remain unchanged.
  Hosted CPU/latency, production read coverage and human real-write acceptance
  are not established by these local results.
