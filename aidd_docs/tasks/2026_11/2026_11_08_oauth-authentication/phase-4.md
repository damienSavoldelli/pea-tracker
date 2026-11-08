---
status: pending
---

# Instruction: Validate recovery, operating limits and readiness without cutover

## Architecture projection

```txt
✅ tests/auth.recovery.test.ts
✅ aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/implementation-evidence.md
✅ aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/operations.md
✏️ aidd_docs/memory/architecture.md
✏️ aidd_docs/memory/testing.md
✏️ aidd_docs/memory/codebase-map.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Use approved synthetic PoC and incident policy | Owner, collector, issuer and recovery responsibilities explicit | Operator |
| Happy path | Rehearse credential rotation, recovery and stable owner mapping | Old grants fail per approved lifecycle; idempotency scope retained | System |
| Edge case | Provider/JWKS outage, quota pressure or unknown signing key | Fail closed within bounded cache/CPU/network policy | System |
| Edge case | Immediate access revocation required but only offline JWT exists | Release blocked; additional state design required | Owner |
| Edge case | Public exposure/real data requested without other gates | Separate release decision required; no automatic cutover | Owner |
| Teardown | End approved measurements/recovery exercises | No residual credentials, resource drift or private fixture fallback | Operator |

## Tasks to do

### `1)` Validate lifecycle and recovery rather than only successful login

1. Rehearse threat-model runbooks with synthetic identities: stolen refresh/access
   token, collector grant leak, owner lockout/relinking, tenant/key incident and
   outage. Live tenant changes require the specific phase-3 approval scope or a
   further approval; local simulations are labelled as such.
2. Measure surviving bearer lifetime and configuration propagation. Test refresh
   revocation separately from access JWT expiration. If immediate revocation is a
   requirement, stop until authoritative state and its recovery/concurrency tests
   have an independently approved design and implementation.
3. Verify stable internal owner mapping preserves D1 idempotency across refresh,
   restart and recovery. No repository port, financial accounting or instrument
   migration change is needed merely to authenticate an existing owner.

### `2)` Measure operational feasibility and complete regressions

1. Measure cold/warm JWT/JWKS and MCP initialize/read CPU/latency on native runtime
   and approved hosted PoC where possible; test bounded invalid-token/unknown-kid
   load and provider outage. Record current Workers limits and observed usage.
2. Verify the exact persistent/platform abuse-control mechanism, availability,
   cost and failure behavior. In-memory throttling alone is insufficient. If a
   separate binding/resource is necessary, obtain a reviewed design/approval first.
3. Record observed auth/refresh/M2M counts, quota headroom and actual plan features;
   compare against costs.md. No automatic paid fallback, broader scopes or longer
   bearer lifetimes to avoid quota pressure.
4. Run original and new tests, strict TypeScript, OpenAPI/real HTTP, Docker and both
   default dev/production Worker dry-run bundles. Confirm no binding/route exposure
   change in the default artifact. Preserve all Memory/D1 contracts and MCP ping.

### `3)` Publish reviewable evidence and a separate release decision

1. Write implementation-evidence.md and operations.md with measured results,
   unresolved limits, credential handling, owner/admin recovery, configuration
   inventory and diagnostic-only rollback. Update relevant memory only after actual
   evidence and explicit implementation authorization; do not silently mark gates passed.
2. Request owner review of final provider choice, entitlements, revocation/assurance
   and costs. Recommend no real data or existing-endpoint cutover until that decision
   and INSTALL's security, correctness, recovery and privacy gates are satisfied.
3. No production/default composition enablement, remote D1 provisioning, deployment,
   plugin modification, staging, commit or push is an automatic phase outcome.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Synthetic recovery and revocation semantics evidenced; no instant-revocation claim without authoritative enforcement; durable owner scope stable |
| 2 | CPU, latency, abuse controls and cost/feature limits measured; all old/new tests/types/contracts/Docker/dry-runs pass; default artifact stays diagnostic-only |
| 3 | Evidence distinguishes local/documented/hosted results, remaining release blockers and explicit owner decisions; no unauthorized remote or Git operation |
