---
objective: "Verify a synthetic Financial Instruments REST slice over shared services, without changing public diagnostic behavior or exposing private endpoints."
status: implemented
---

# Plan: Financial Instruments REST API

Source: owner's 2026-11-08 approval/refinements; [approved PRD](../2026_11_08-financial-backend-prd.md), [slice contract](contract.md), [initial OpenAPI](../../../api/openapi.json), and [architecture](../../../INSTALL.md).

Approved for implementation by the owner with one refinement: exercise the slice
through real loopback HTTP in an isolated synthetic environment. The dedicated
Node harness outside src uses fixed server-side principals, Host/Origin guards and
bounded bodies; it is never imported by the deployment entrypoint. This refinement
supersedes the earlier in-process-only test restriction. Existing uncommitted
architecture/design edits are retained; the index was empty at initial inspection.

Implementation and validation are recorded in [implementation.md](implementation.md).

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Shared catalog model, policies and memory repository | [phase-1.md](phase-1.md) | none |
| 2 | REST capabilities through isolated application composition | [phase-2.md](phase-2.md) | 1 |
| 3 | Contract, edge-case and diagnostic regression evidence | [phase-3.md](phase-3.md) | 1, 2 |

## External sources

| URL | What it settled |
| --- | --- |
| https://spec.openapis.org/oas/v3.1.1.html | JSON OpenAPI document structure; private operation security declarations do not implement enforcement |
| https://anna-web.org/identifiers/ | ISIN shape and modulus-10 checksum; no allocation/eligibility verification |
| https://developers.cloudflare.com/d1/best-practices/local-development/ | Local D1 state/runtime is feasible, but deferred; no remote resources required inherently |
| https://developers.cloudflare.com/workers/testing/vitest-integration/ | Workers test integration exists; compatibility with installed Vitest 5.1.0 remains unverified and is outside this slice |

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| Runtime | Existing Hono/Zod/Vitest support service and real loopback HTTP tests; installed esbuild/Ajv tools used without package changes. Docker selectively receives the contract JSON/schema/license; no Worker config or cloud changes | Phases 1–3 |
| Regression | src/index.ts composition changed with diagnostic modules untouched. Baseline 22 tests and final 92 host/container tests passed, including default-route absence and official SDK init/list/ping; dry-run bundles pass | Phases 1, 2, 3 |
| Architecture | New REST routes depend on shared services and a narrow repository port; services contain no HTTP/SQL. Default application mounts no financial routes; no financial MCP tool added | Phases 1, 2 |
| Persistence | Implemented in-memory acceptance adapter only; restart loss and no distributed/durable guarantees. D1, bindings, SQL and migration tests remain deferred | Phase 1 |
| Security | Synthetic test principals only, service and adapter checks, deny before repository access; actual auth selection/verification/abuse controls remain unimplemented. No private public exposure | Phases 1–3 |
| Contract | Offline official OAS document validation plus actual data-schema/response validation and semantic fixtures pass; narrow Ajv dynamic-anchor workaround and media-range annotation documented in schema notes | Phases 2, 3 |
| Documentation | README and architecture/codebase-map/testing memory must describe tested-only catalog and absent durability/auth. INSTALL/PRD already distinguish accounting concepts; do not restate financial policy in code | Phase 3 |

## Rules

| Rule | Why it applies |
| --- | --- |
| Approved slice only | Implement the approved catalog plus loopback HTTP refinement; no advanced financial features |
| Synthetic data only | No actual instrument watchlist/holdings/PRU/transactions/tokens in fixtures, docs or logs |
| API-first, one Worker codebase | Four reusable REST operations; future MCP consumes shared services directly, never internal HTTP |
| Keep financial concepts and dependencies separate | No PRU/fees/performance/dividend/corporate-action calculation or prerequisite in catalog delivery |
| No public financial endpoint without approved auth | Default entrypoint stays diagnostic-only; no dev flag/header/request URL can create a principal |
| No cloud/D1/dependency/deployment/plugin/Git actions | Requires separate explicit authorization; no config bindings, fake database IDs or hooks |
| Preserve health and MCP ping | Keep current public metadata/version, transport, tools list, schemas, headers and method/error behavior |
| Direct Git only, approval for writes | Read-only status/diff permitted; no staging, committing, pushing, hooks or branch changes |

## Decisions

| Decision | Why |
| --- | --- |
| Approved: in-memory repository for this synthetic slice; D1 later | Lowest setup cost with existing tests; repository acceptance cases preserve a path to D1 without pretending durable evidence |
| Approved: explicit server-side service/auth dependency injection; default diagnostics only | Allows REST vertical-slice acceptance while OAuth is unresolved, with no public financial exposure or auth bypass |
| Approved: immutable identity/quote metadata, PATCH only name/active | Avoids historical identity rewrites before mapping-version design is needed; supports catalog correction/deactivation safely |
| Approved: nullable unique ISIN, one quote reference per instrument | Pragmatic initial stock/ETF model; no speculative multi-listing framework. Additional listing requirements trigger contract review |
