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
