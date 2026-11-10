---
objective: "Record dated synthetic opening state and expose positions through shared REST/MCP services with local D1 persistence."
status: blocked
---

# Dated opening state → positions

Owner authorized local synthetic implementation on 2026-11-10, following the
[approved PRD](../2026_11_08-financial-backend-prd.md),
[resumption sequence](../2026_11_08_oauth-authentication/v1-resumption.md) and
[architecture / decimal contract](../../../INSTALL.md).
This is independent of the remaining OAuth PoC tests. No authentication, deployed
Worker, cloud configuration or existing repository interface is changed.

## Required decisions — requested, not approved

The PRD explicitly leaves opening-state/correction conventions open. No detailed
opening-state REST/OpenAPI contract or portfolio repository exists in the codebase;
the older resource table is a proposal, not an approved contract.

1. Authoritative opening cost input: supplied total cost basis with PRU calculation
   deferred, or supplied unit PRU with total-cost calculation deferred. Do not infer
   either from the other or invent fee treatment.
2. Correction model: recommended complete immutable replacement revision retaining
   the original effective timestamp and prior revisions, or separately specified
   line-level corrections. No silent overwrite or fabricated historical trade.

Pending these choices, do not freeze financial DTOs, migrations or position semantics.
There is no runtime portfolio endpoint yet. This blocker concerns these contracts,
not the approved independent decimal representation work below.

## Increment 1 — exact decimal boundary

Implemented `src/domain/decimals.ts` with the installed Zod dependency only:

- Plain decimal strings; at most 30 significant digits, field-specific scale,
  bounded input length; no monetary conversion to JS Number/SQLite REAL.
- Canonical leading/trailing zeros and negative zero; reject excess scale before
  canonicalizing, including trailing zeros; preserve null versus zero.
- Reusable signed representation. Each eventual quantity/cash/cost field must
  separately enforce its approved sign and currency policy.
- No arithmetic, division, rounding, PRU derivation or financial default. The
  80-digit arithmetic requirement remains applicable to future calculations.

`tests/decimals.test.ts` contains 28 synthetic cases, including precision boundaries,
values beyond JS safe integers, invalid wire types/syntax and JSON round trips.
Targeted tests and strict TypeScript passed. Full host regression passed: 312 tests
across 20 suites, including existing local D1, REST/MCP, authentication and diagnostic
checks. The full suite used normal sandbox escalation for local ports/logs. No
Docker rerun, OpenAPI validation or Worker build was needed for this unmounted
domain-only change. No new dependency, migration or deployed composition exists.

## Remaining implementation after decisions

1. Record the decisions and bounded DTOs/OpenAPI: opening-state administration/read
   and current position reads, effective versus recorded timestamps, provenance,
   revision history and unsupported/history-unavailable outcomes. Fix the exact
   REST resource shapes before adapter implementation.
2. Add a portfolio repository port and Memory/local D1 adapters alongside the
   unchanged InstrumentRepository. Reuse instrument IDs and D1 binding/migration
   conventions; prove atomic revision/idempotency writes, FK integrity, concurrent
   correction behavior and process-restart durability.
3. Implement shared services with explicit portfolio read/admin capabilities,
   isolated REST adapters and read-only MCP tools. Do not automatically extend
   AccessAuthenticator permissions or alter either PoC/deployed Worker. Explicit
   test composition supplies synthetic principals; default diagnostics stay intact.
4. Test domain rules, repository parity, real local HTTP and shared REST/MCP
   results against the contract. Preserve existing instrument/D1/auth regressions;
   run TypeScript, OpenAPI and Worker dry-run checks when those surfaces change.

Quotes, valuation, ledger accounting and return methodologies are subsequent slices.
No historical performance may be inferred from the opening state. All data stays
synthetic; real-data security/correctness/recovery gates remain mandatory.
No staging, commit, push, deployment or cloud provisioning is authorized here.
