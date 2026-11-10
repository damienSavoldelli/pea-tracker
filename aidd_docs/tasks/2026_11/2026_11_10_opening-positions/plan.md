---
objective: "Record dated synthetic opening state and expose positions through shared REST/MCP services with local D1 persistence."
status: implemented
---

# Dated opening state → positions

Owner authorized local synthetic implementation on 2026-11-10, following the
[approved PRD](../2026_11_08-financial-backend-prd.md),
[resumption sequence](../2026_11_08_oauth-authentication/v1-resumption.md) and
[architecture / decimal contract](../../../INSTALL.md).
This is independent of the remaining OAuth PoC tests. No authentication, deployed
Worker, cloud configuration or existing repository interface is changed.

## Owner-approved decisions — 2026-11-10

These decisions resolve the opening-state questions in the approved PRD for this
bounded slice; they do not settle later fee, ledger or performance conventions.

1. Bourse Direct's explicitly supplied unit PRU is authoritative. Retain quantity,
   declared PRU, currency, provenance and reference timestamp as exact values.
   Never reconstruct historical total cost from rounded PRU or invent fees.
   Declared and calculated values must remain distinct. This slice calculates none.
2. Corrections append complete immutable revisions preserving history, effective
   timestamp and traceability. A correction is not a stock-market transaction.
   A later line-level UI may assemble a complete revision; no financial PATCH or
   silent overwrite is introduced.

Implementation is authorized with synthetic data and local D1 only. The detailed
[slice contract](contract.md) records supported bounds and endpoints. No provider,
scope mapping or deployed Worker is changed; open OAuth checks stay separate.

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

## Increment 2 — opening state and position reads

Implemented and validated locally on 2026-11-10. Each task below is done for the
bounded synthetic contract; it grants no hosted exposure or private-data release.

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

## Implementation evidence

| Check | Observed final result |
| --- | --- |
| Host TypeScript + full Vitest | Pass; 344 tests across 23 suites |
| Docker existing-image check | Pass; strict TypeScript + same 344 tests; no image build, pull or dependency installation |
| OpenAPI structure/data schemas | Pass in contract suite; representative real HTTP responses validated for Memory and D1 |
| Repository/service parity | Pass; declared decimals, full corrections/history, version-pinned pagination, permissions, idempotency and concurrent initial/correction writes |
| Native D1 integrity/atomicity | Pass; SQL/FK failure rolls back revisions, positions and outcomes; UPDATE/DELETE denied; no key consumed on conflict |
| Restart persistence | Pass; both proxy reopen and independent Node/workerd process restart preserve original outcomes and complete revisions |
| Migrations | Pass; fresh/repeat, populated v1/v2 upgrade, failed migration rollback; no opening state fabricated from catalog |
| Real REST/MCP | Pass; loopback-only, official MCP SDK, shared results and no portfolio write tool; default routes absent |
| Worker dry-runs | DEV/production pass at 1499.94 KiB (gzip 260.59); Access PoC passes at 1552.79 KiB (gzip 274.76); no bindings/private configuration loaded |

The first regression pass exposed the old local startup guard's hard-coded two
migrations. Updating that explicit allowlist to the three reviewed migrations
resolved the failure; the final host/Docker passes include the original restart
test. No auth control was weakened. The optional local `--portfolio true` fixture
is outside deployment source and uses only synthetic startup principals. Dockerfile
and Compose include the new migration; a fresh Docker image build was not run.

Limits: 100 positions, EUR nonnegative cash or explicit unknown, no shorts/FX,
no transactions/valuation/historical-cost derivation. Existing OAuth grants are not
automatically extended to portfolio permissions. Hosted OAuth closure, remote D1,
backup/restore, production CPU and real-data gates remain separate and unverified.
Fee/ledger/valuation conventions remain open for subsequent dependent slices.
