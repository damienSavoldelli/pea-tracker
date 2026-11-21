# PEA Tracker — financial backend

Product baseline approved by the owner on 2026-11-08, incorporating the seven
refinements in that approval. Approval settles product direction, not unresolved
accounting conventions, OAuth selection, implementation or release authorization.
Architecture authority: [INSTALL.md](../../INSTALL.md).

A private financial backend for recording and understanding one owner's PEA portfolio,
with consistent information available to authorized clients and AI assistants.

## Overview

Serve one owner with approximately 20 stocks and ETFs. Progressively support instrument
identification, portfolio records, quotations, valuation, allocation and historical
performance. Prioritize reliable financial information over interface breadth.

The product is API-first: complete, reusable REST capabilities documented through
OpenAPI, with MCP as the AI-facing adapter over the same application services.
REST and MCP are interfaces of one application/codebase; they do not duplicate
calculations or call one another over internal HTTP.

## Problem Statement

Manual screenshots and disconnected records make portfolio analysis difficult to
reproduce. The owner needs traceable positions, cash movements and timestamped
valuations, with clear disclosure when prices or history are incomplete.

## Goals

- Reconcile quantities, cost basis and cash against dated opening state and transactions.
- Produce consistent results across authorized interfaces.
- Distinguish cost basis/PRU, unrealized gains and total portfolio performance.
  Prefer weighted-average cost basis; fee treatment and detailed conventions remain
  pending explicit approval before dependent calculations are implemented.
- Distinguish current, stale, missing and incomplete information.
- Preserve financial precision, provenance and correction history.
- Deliver incremental vertical slices; the instrument catalog must not wait for
  advanced performance, dividend or corporate-action rules.
- Target quotation freshness below 45 minutes during expected market coverage.
- Target ordinary warm reads below one second at p95.
- Target EUR 0 recurring infrastructure cost, subject to security and explicit expense approval.

## Non-Goals

- Brokerage integration, credential storage or order execution.
- Multiple owners, tenancy or a required portfolio dashboard.
- Tax reporting or investment recommendations.
- Fabricated transactions or historical returns from incomplete records.
- Initial support for every currency, corporate action or performance methodology.
- CSV convenience and benchmarks in the first delivery.
- A second MCP product or independently duplicated financial backend.

## User Stories

- As the owner, I want instruments identified reliably so quotations reference the correct security.
- As the owner, I want dated opening quantities, cost basis and cash so I can initialize existing holdings without inventing transactions.
- As the owner, I want recorded transactions so positions and cash are explainable.
- As the owner, I want corrections to preserve history so mistakes remain traceable.
- As the owner, I want quotation timestamps and freshness so I can judge valuation reliability.
- As the owner, I want cost basis, unrealized gains and portfolio performance presented distinctly so I do not confuse their meanings.
- As the owner, I want valuation and allocation so I can understand my portfolio.
- As the owner, I want historical performance with a stated methodology and coverage, or an explicit unavailable result.
- As the owner, I want AI access restricted to authorized reads.
- As the owner, I want export, deletion and recovery of my information.

## Acceptance Criteria

1. Instruments retain stable identity, currency, quotation unit and provider provenance.
2. Dated opening state records quantities, cost basis and cash with provenance; it
   does not fabricate earlier purchases or imply complete source history.
3. Opening state plus recorded events explains supported positions and cash balances.
4. Purchases, sales, fees and cash movements follow explicitly approved conventions.
   Weighted-average cost basis is preferred, not authorization to invent fee policies.
5. PRU/cost basis, unrealized gains and total portfolio performance have separate
   definitions, inputs and output fields; one is not substituted for another.
6. Retried submissions do not duplicate financial effects; failed operations leave
   no partial balance changes.
7. Financial values preserve the decimal precision and rounding contract in INSTALL.md.
8. Corrections retain original records and identify replacements or reversals.
9. Quotations distinguish market time from retrieval time; retrieval failures never
   become zero prices or advance successful freshness timestamps.
10. Valuations disclose stale or missing inputs and incomplete coverage.
11. Equivalent authorized reads return equivalent financial results across interfaces.
12. Historical returns identify methodology, period and coverage; insufficient source
    history produces an explicit unavailable result with a reason, never a fabricated
    zero or a return inferred from today's PRU. Opening state alone does not establish
    earlier performance.
13. MCP cannot mutate financial state; administration and quotation ingestion require
    separate authorization grants.
14. OAuth selection remains open. No private financial REST or MCP endpoint is publicly
    exposed without approved authentication and authorization.
15. Financial data remains synthetic until relevant authentication, security,
    correctness and recovery gates pass. Real data also requires applicable privacy,
    monitoring and release approvals, in any environment.
16. Incremental delivery permits the instrument REST API before ledger/performance
    methodology, dividends or advanced corporate actions are settled. Each supported
    financial capability must meet its own applicable acceptance criteria before use.
17. Existing public REST health and MCP ping behavior remains compatible as features grow.

## Dependencies

- Owner-approved accounting decisions and corresponding specifications for dependent
  calculations, not for unrelated instrument catalog delivery.
- Validated instrument, currency, unit and quotation-provider coverage before collection
  or valuation. Catalog syntax validation alone does not prove PEA eligibility or coverage.
- Authentication selection and actual-client interoperability evidence before private
  public access; no provider-specific implementation is approved by this PRD.
- Independent recovery destination, tested restoration and alert delivery before real data.
- Privacy, provider terms, complete operating-cost review and release approval.
- Synthetic fixtures throughout development until real-data prerequisites pass.
- Separately reviewed implementation plans and explicit dependency/resource/deployment approvals.

## Open Questions

- How should broker fees affect weighted-average cost basis, PRU and sale results?
  Which remaining accounting conventions and reconciliation rules should be approved?
- How do trade dates, settlement dates and event ordering affect cash and positions?
- What opening-state evidence, effective date and correction process are required?
- Which dividends, corporate actions and negative-balance cases are initially supported?
- Which currencies and conversions are supported by valuation and performance?
- What defines unrealized percentage return and its zero-cost cases?
- Should historical performance begin with TWR or MWR, and what source history is sufficient?
- Which prices, session boundaries and stale-price rules determine valuation?
- Does allocation include cash, and what is its denominator?
- When are snapshots recorded, and how are corrected historical results revised?
- Which OAuth provider passes interoperability, owner restriction, security, lifecycle,
  maintenance, CPU and complete cost evaluation?

## Dated supplement — 2026-11-14: V1 status and V1.1–V2.3 scope

This supplement preserves the original 2026-11-08 approval, acceptance criteria,
dependencies and open questions above. It records subsequent decisions and evidence
from the owner handover and approved documentation lots. For current version scope
and status, read it alongside the [roadmap](../../roadmap.md),
[architecture baseline](../../INSTALL.md) and
[V1 runbook](2026_11_14_live-quotations-read/runbook.md). It does not authorize
development, tests, new private-data loading, remote operations or release.

### Evidence and current V1 boundaries

| Level | Established scope / limits |
| --- | --- |
| Developed | Instrument catalogue, immutable dated opening state/positions/cash, stored quotations and status/history, exact EUR valuation, shared REST/read-only MCP and separate Python/yfinance machine ingestion |
| Tested locally | Dated synthetic Memory/native D1, domain, contract/HTTP/MCP, replay/concurrency/restart and collector evidence remains in the historical V1 plans/contracts; no tests rerun for this supplement |
| Validated in operation | Prior owner-session real ChatGPT catalogue/position/cash/quotation/grouped valuation reads and hosted ingestion evidence; not an individual certification of every REST route or every security/recovery requirement |
| Still to confirm | First complete Scheduled cycle of 16 November 2026: successful actual `Run collector`, advancing successful-fetch timestamps and market dates interpreted with no-recent-trade cases |
| Planned / under study | V1.1 and later roadmap capabilities; no global feasibility approval, no V1.1 development started and no new financial formula validated |

REST and MCP call the same application/domain services directly, without internal
HTTP. The Python collector retrieves provider quotations separately and delivers
HTTPS batches to ingestion; valuation reads do not call the provider. The financial
reader exposes no administration; the collector has no D1 or portfolio access.
The actual reader has no real calendar adapter, so freshness context remains unknown.
Quotation reads do not form an atomic cross-instrument market snapshot. Current
monitoring shares GitHub's availability; the optional external heartbeat is unconfigured.
No tag or release has been created. See the runbook for the limits of remote-setting
evidence; publication/dashboard screenshots do not prove scheduled execution.

### Subsequent decisions and preserved historical requirements

- **Opening-state question refined, 2026-11-10:** the broker-declared unit PRU is
  authoritative as a declaration. Full immutable corrections preserve the initial
  effective date and history; they are not trades. Never reconstruct exact historical
  total cost/fees from rounded PRU. See the unchanged
  [opening-state decisions](2026_11_10_opening-positions/plan.md) and
  [contract](2026_11_10_opening-positions/contract.md).
- **Valuation scope refined, 2026-11-11:** explicit provider/price kind, unadjusted
  observations, exact products and sums before half-even EUR display, no FX, labelled
  stale/unknown estimates and explicit partial coverage. Null cash never means zero.
  This settles the current bounded slice, not PRU/gain/return conventions or a real
  market calendar. See the unchanged [valuation decisions](2026_11_11_valuation/plan.md).
- **Authentication status updated:** the original open selection in criterion 14
  and the final open question describe the earlier evaluation. Current owner reads
  use Cloudflare Access/Managed OAuth; machine ingestion uses separate Access Service
  Auth. This does not claim all lifecycle, renewal/revocation, cost or negative hosted
  cases have been established, and is not an instruction to reopen the comparison.
- **Security/recovery requirements retained:** existing real V1 operation does not
  establish that every original prerequisite in criterion 15 or Dependencies passed.
  Missing evidence and explicitly bounded owner decisions must remain visible;
  documentation does not waive independent recovery, privacy, provider rights or
  applicable release requirements, nor authorize further data loading.

### Validated scope allocation; future delivery remains conditional

| Version | Product direction, not implementation approval |
| --- | --- |
| V1.1 | Calendar/freshness; purchases, sales, dividends, fees, deposits/withdrawals and cash journal; capital invested, PRU, realized/unrealized gains; study of an explicit simple return; useful monitoring |
| V2.0 | Multi-portfolio with real/fictitious isolation, explicit API/MCP authorization and shared quotations; multi-provider studies with controlled selection/fallback |
| V2.1 | OHLCV, watchlists and deterministic indicators, conditional on data coverage, usage rights and capacity |
| V2.2 | Trading Lab decision journal, distinct from V1.1's financial journal; evaluate TradingView Paper Trading before optional internal simulation |
| V2.3 | Periodic performance, TWR/XIRR if appropriate, portfolio allocation, advanced analysis/benchmarks and optional interfaces |

The real PEA remains the priority. Trading Lab is complementary and isolated; small
transversal increments may be studied earlier only if feasible without compromising
the PEA. Multiple portfolios do not imply multiple owners, a simulation engine or
permission for brokerage order execution. API/MCP separation preserves read-only MCP
and distinct administrative authorization. Interfaces remain optional.

All reference financial calculations belong to the PEA Tracker domain. ChatGPT
interprets engine results and may perform separate, explicitly indicative simulations;
these do not replace authoritative portfolio results. Observability must follow the
actual shared read services and separate provider/ingestion path.

Exports, deletion, retention, backup and restoration retain their existing requirements
and evidence gaps without being assigned an artificial delivery version. The original
export/recovery user story is not a claim that these capabilities are complete.

### Decisions still required before dependent specifications

Update 2026-11-19, explicitly approved by the owner for the first local increment: EUR-only buy/sell and deposit/withdrawal declarations, explicit effective dates, no overselling or negative cash, chronological append and later traceable counterposting. Cash amounts are explicit executed declarations; fees/dividends, calculated PRU and performance remain outside this increment. The journal is separately bound to a stable portfolio identity and one immutable opening revision; real/simulated isolation is anticipated without implementing V2 portfolio management. No production data mutation, migration or deployment follows from this approval. See the [bounded journal contract](2026_11_19_financial-journal/contract.md). The remaining questions below are not silently resolved by this slice.

- Define invested capital and any simple return explicitly: inputs, period, treatment
  of flows, coverage, zero-denominator cases and limitations. No formula is selected.
  Periodic returns and TWR/XIRR remain V2.3, not implicit V1.1 acceptance criteria.
- Resolve purchase/sale fees, usable starting cost basis, PRU reconciliation, signed
  gains, supported dividends/corporate actions, currencies and negative-balance cases.
  Weighted-average remains a preference, not approval of missing conventions.
- Choose trade/settlement semantics, deterministic event ordering, corrections and
  the relationship between corrected opening revisions and subsequent events.
- Specify decimal division precision and rounding under the existing exact-decimal
  contract; current finite valuation arithmetic is not a general financial engine.
- Study stable portfolio identity, event attachment and migration compatibility before
  fixing V1.1's model. Current global revisions, cursors, permissions and durable
  idempotency outcomes must be preserved; no multi-portfolio design is selected yet.
- Establish calendar source, time zones, holidays/half-sessions, opening rules and
  freshness/alert semantics for illiquid instruments; define grouping and recovery
  notifications, with explicit GitHub dependency or separately approved independence.
- For later historical performance, establish source-history sufficiency, valuation
  inputs/snapshots and correction revisions. Opening state or today's PRU never
  establishes earlier returns. Allocation denominator/cash treatment remains open
  within V2.3.

Before committing to an implementation plan, verify the relevant APIs, limits, licences,
costs, compatibility, storage and security; use a bounded PoC only when necessary
and authorized. Record go / conditional / defer / abandon separately from evidence.
This supplement closes none of those feasibility questions by assertion.

### Authorized local increment — 20 November 2026

The owner authorizes weighted-average remaining cost/PRU in the existing projected V1.1 reads: declared opening quantity × PRU with provenance, purchase amounts added, partial sales release the exact pre-sale average cost, full closures reset cost to zero. No floating-point financial amounts; exact fractions with half-even decimal representation at 18 places only. Counterposts invert original cost deltas; incompatible/unknown bases remain explicitly unavailable. No fee/dividend/performance engine, production loading, migration or deployment authorized. Historical V1 responses and valuation amounts remain unchanged. [Rules, limitations and evidence](2026_11_19_financial-journal/cost-basis.md).

### Local financial scope completed — 21 November 2026

Subsequent explicit owner instructions authorized and delivered the bounded [fees](2026_11_19_financial-journal/fees.md), [received dividends](2026_11_19_financial-journal/dividends.md), [realized/unrealized gains](2026_11_19_financial-journal/gains.md) and [external flows/conditional monetary gain](2026_11_19_financial-journal/performance.md) increments. These supersede the earlier exclusions for their own local scope, without changing historical V1 contracts or production. Exact arithmetic, explicit opening-cost provenance, unknown historical fees, portfolio isolation and traceable corrections remain mandatory. No real initial market-valuation reference has been selected/persisted; actual monetary performance remains unavailable by default, and no percentage-return method is implemented. Local commit is explicitly authorized; push, deployment, production migration, OAuth changes and MCP writes are not authorized by this closure.
