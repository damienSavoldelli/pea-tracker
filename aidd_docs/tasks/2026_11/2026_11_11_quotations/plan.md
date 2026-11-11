---
objective: "Persist synthetic quotation declarations and expose provenance, clocks and explicit freshness through shared REST/MCP read services."
status: implemented
---

# Quotations → provenance → timestamps → freshness → reads

Authority: owner implementation request following commit `1b29796`,
[approved financial PRD](../2026_11_08-financial-backend-prd.md),
[V1 sequence](../2026_11_08_oauth-authentication/v1-resumption.md) and
[INSTALL](../../../INSTALL.md). This is the next bounded slice, not a new
architecture/provider evaluation. Existing OAuth checks remain separate.

## Scope and decisions reused

- Store positive exact provider prices (max 30 significant digits / 12 fractional
  places), currency, unit, provider and provenance. Preserve lexical source price
  separately from canonical value; neither is a valuation or calculated price.
- Keep market_timestamp, fetched_at and server recorded_at distinct. Collection
  failure never supplies a zero price, replaces the last usable quote or advances
  the successful-fetch timestamp.
- Reuse INSTALL's collection-age thresholds during coverage: >45 minutes warns,
  >60 minutes is stale. Market age and provider-declared delay remain separate.
- Require explicit provider, quote kind and adjustment selectors. Distinguish last
  trade from session close; support only unadjusted observations in this increment.
- A trusted server calendar supplies open/closed/expected-session context. No real
  calendar is guessed: the default is unknown, never a real-time claim. Synthetic
  tests exercise known coverage and completed/missing sessions.
- Collector ingestion is separate from MCP/REST reads and administration, with
  exact server-configured subject/provider/instrument grants. No OAuth or Access
  grant mapping is widened. Shared services/repository ports have no transport logic.

No financial decision blocks these conservative declared-data capabilities.
Real exchange calendars, provider coverage/delay assurance and corporate-action
adjustments remain future integration prerequisites, not silently implemented rules.

## Delivery tasks

1. Domain schemas and versioned freshness policy; invalid/missing/old/delayed values
   and no-price failure outcomes; calculated metadata distinct from declarations.
2. QuotationRepository plus Memory/native D1 adapters, immutable SQL migration,
   indexes/FKs, atomic batches, durable replay outcomes and concurrency conflicts.
3. Local REST ingestion/history/status contracts and read-only MCP adapters over
   the same service; no HTTP calls between adapters. Default deployed composition
   continues to mount diagnostics only.
4. Unit, shared Memory/D1, real loopback HTTP, official MCP SDK and offline OpenAPI
   checks; migrations, rollback, restart and existing regressions; TypeScript and
   Worker dry-run packaging. Review the complete diff without staging or commit.

Detailed behavior and local boundaries: [contract.md](contract.md).
All four tasks are implemented and validated for the local synthetic contract.

## Validation evidence — 2026-11-11

| Check | Result |
| --- | --- |
| Host full suite | 395 tests pass across 26 suites; includes existing instrument/portfolio/auth/diagnostic regressions |
| Docker existing-image check | TypeScript + same 395 tests pass; no pull, image build or dependency installation |
| TypeScript | Strict noEmit passes |
| OpenAPI | Official offline document/data-schema checks pass; real Memory/D1 HTTP responses conform. Existing paths, component schemas and error responses compared semantically with HEAD and unchanged |
| Domain/freshness | Decimal bounds, source precision, failure nulls, 45/60-minute boundaries, delay/market age separation, missing sessions, prior closes and clock rollback pass |
| Memory/native D1 contracts | Atomic immutable batches, exact duplicates, changed-key payloads, concurrent keys/independent D1 adapters, window-bound cursors and least-privilege grants pass |
| Durability/integrity | Receipt failure rolls back observations/outcomes; immutable SQL rows; durable replay after local binding disposal/reopen; FK checks pass |
| Migration regression | Fresh/repeat and prior-schema upgrades pass, including populated v3 opening-state preservation; no prices fabricated on upgrade |
| REST/MCP | Real guarded loopback HTTP + official MCP SDK pass; shared read results and no MCP ingestion tool; default Worker quotation routes remain absent |
| Worker dry-runs | DEV/production: 1510.16 KiB, gzip 262.49; Access PoC: 1563.04 KiB, gzip 276.80. All exit successfully with no bindings/private configuration loaded |

The quotation durability check reopens the native local D1 binding; it does not
claim a new quotation-specific full-process crash/power-loss or remote restore
test. Existing independent Node/workerd instrument/portfolio restart tests pass.
The Dockerfile includes migration 0004, but a fresh image build was not run;
Docker evidence uses the existing image with the current source/migration mounts.

No business decision blocks this synthetic declared-data slice. Real-provider
integration still needs verified exchange calendars, timestamp semantics, delay,
coverage and usage terms. Adjusted prices, zero/negative-price instruments and
provider automation remain unsupported rather than silently assigned rules.
No valuation, OAuth closure or real-data readiness is claimed.

## Explicit exclusions

No Python/yfinance collector, provider network call, scheduled workflow, valuation,
transaction/fee accounting, FX conversion, adjusted-price calculation or historical
portfolio performance. No real financial data, new dependency, remote D1/resource,
deployment, OAuth change, staging, commit or push is authorized by this slice.
