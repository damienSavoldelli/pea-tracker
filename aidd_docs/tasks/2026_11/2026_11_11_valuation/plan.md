---
status: implemented
objective: "Read a deterministic synthetic portfolio valuation from existing opening state and quotations."
---

# Current valuation — approved V1 slice

Authority: owner approval 2026-11-11, [PRD](../2026_11_08-financial-backend-prd.md),
[roadmap](../2026_11_08_oauth-authentication/v1-resumption.md),
[decimal baseline](../../../INSTALL.md#exact-decimal-contract).

## Owner decisions — 2026-11-11

- Explicit provider and price kind; unadjusted only; no automatic fallback.
- Last usable quotation supports an estimate with original timestamps/provenance.
  Delayed/stale/unknown freshness remains explicit, never a realtime claim.
  Missing quotations exclude a position, never invent a price.
- Expose coverage/exclusion reasons and partial subtotal separately from a full total.
- Quantity × price for currency_unit; quantity × price / 100 exactly for
  hundredth_currency_unit. No intermediate rounding; half-even EUR display at 2 places.
  Sum exact position values before rounding aggregates.
- Foreign currencies unsupported, no FX. Cash null remains unknown; declared EUR
  cash is included only when known. Declared PRU never becomes historical cost.
- No gains, returns, historical performance, transactions or collector implementation.

## Delivery

1. Done: exact bounded decimal arithmetic and shared valuation projection service.
2. Done: read-only REST/OpenAPI and MCP, explicitly injected in local composition only.
3. Done: domain, Memory/native local D1, loopback HTTP and SDK tests; regressions,
   strict TypeScript, OpenAPI and local Worker dry-run. Final diff/security review.

Reuse existing repository ports and immutable records; no new migration, stored
valuation snapshot, OAuth mapping, deployed entrypoint or remote resource change.
Stay on the current branch; no staging/commit/push/deployment authorized.
Detailed interface and consistency boundaries: [contract.md](contract.md).

## Evidence

2026-11-11:

| Check | Result |
| --- | --- |
| New domain/service/HTTP suites | 43 tests pass: half-even ties/carry, 100 maximal products, smallest supported hundredth-unit value, absent/failed/stale/unknown/closed-session quotes, explicit selection, partial coverage, unknown/zero cash, incompatible/foreign currencies, revisions, clocks and least privilege |
| Host regressions | 438 tests / 29 suites pass, including existing D1 migrations, concurrency, rollback, process restarts, OAuth, MCP and diagnostics |
| Docker | Existing image/current source mounts: strict TypeScript and same 438 tests / 29 suites pass; no image build, pull or dependency install |
| TypeScript | Strict noEmit passes on host and Docker |
| OpenAPI | Offline official document/schema validation and representative real loopback Memory/D1 HTTP responses pass; prior paths/schemas unchanged |
| MCP | Official client initialization/list/call; same results as REST at fixed synthetic evaluation time, denied without both financial read permissions, no write tool |
| Worker dry-runs | DEV: 1513.27 KiB / gzip 262.80; Access PoC: 1564.05 KiB / gzip 277.01. No bindings/private configuration loaded; no upload |

Tests use native Wrangler local D1, with no new migrations. The initial sandboxed
test attempt could not bind loopback/write Wrangler logs; the approved unrestricted
local rerun passes. The fixture's synthetic collector grant was corrected to cover
both fixture instruments; application grant checks were preserved.

BigInt implements only exact finite products, base-10 unit scaling, bounded sums and
half-even display. It avoids a new dependency and has no fixed-precision truncation;
it is not a general division, FX or performance engine. Input/storage decimal
contracts stay unchanged, and BigInts never cross JSON/D1 boundaries.

No remaining business decision blocks this slice. Live-provider calendars/coverage,
deployment/security gates, valuation snapshot persistence and performance accounting
remain outside it. Local tests do not prove deployed latency/CPU, remote restore or
atomic reads across all instruments. No real data or remote resource was used.
