---
objective: "Persist the existing instrument repository contract and original idempotent outcomes across local D1 restarts without exposing financial routes or changing the public Worker."
status: pending
---

# Plan: D1InstrumentRepository

Source: owner's D1 persistence planning request, [approved PRD](../2026_11_08-financial-backend-prd.md), [implemented instrument contract](../2026_11_08_financial-instruments/contract.md), [OpenAPI](../../../api/openapi.json) and [architecture](../../../INSTALL.md).

Planning only. Approval is required before any runtime code/configuration, SQL migration,
local database initialization, dependency installation or test execution that creates
D1 state. No remote D1, deployment, real financial data, public instrument routes,
Git writes, branch changes or hooks. Only this plan folder is written now.

Baseline inspected: commit dff9b8146e26a4e33f94aaa83d57ee28a08f276a; working tree/index
clean. Existing 92-test evidence belongs to the prior slice; no new D1 runtime evidence
is claimed. Installed tooling: Wrangler 4.158.0, Vitest 5.1.0 and strict TypeScript.
No @types/node or @cloudflare/workers-types package is installed at project root.

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Freeze repository semantics and establish isolated Wrangler local D1 tooling | [phase-1.md](phase-1.md) | none |
| 2 | Versioned schema and atomic D1 repository adapter | [phase-2.md](phase-2.md) | 1 |
| 3 | Restart/concurrency/HTTP parity and diagnostic regression evidence | [phase-3.md](phase-3.md) | 1, 2 |

## External sources

| URL | What it settled |
| --- | --- |
| https://developers.cloudflare.com/d1/worker-api/d1-database/ | batch executes prepared statements transactionally with whole-sequence rollback; use it for dependent writes/reads, not an interactive JS transaction |
| https://developers.cloudflare.com/d1/worker-api/prepared-statements/ | Bound SQL parameters and statement result methods; no user input interpolated into SQL |
| https://developers.cloudflare.com/d1/worker-api/return-object/ | D1 result metadata includes changes; validate per-statement results in the pinned local runtime |
| https://developers.cloudflare.com/d1/reference/migrations/ | Ordered SQL migrations and d1_migrations tracking; failed migration rolls back independently of earlier successful versions |
| https://developers.cloudflare.com/d1/best-practices/local-development/ | Wrangler local state and persistence are available; local evidence is not remote deployment/recovery proof |
| https://developers.cloudflare.com/workers/wrangler/api/ | Official Node getPlatformProxy supplies local workerd bindings; persistence path and CLI persist-to/v3 alignment; dispose releases runtime |
| https://developers.cloudflare.com/d1/sql-api/foreign-keys/ | D1 enforces foreign keys; do not disable enforcement for migrations/tests |
| https://www.sqlite.org/lang_createtable.html | Explicit NOT NULL on TEXT primary keys, nullable UNIQUE semantics and CHECK constraints |

Installed evidence also checked: Wrangler config-schema.json permits omitted D1
database_id; GetPlatformProxyOptions supports configPath, environment, envFiles,
persist and remoteBindings. CLI help confirmed migrations apply --local/--persist-to
and types --include-runtime/--env-interface. No resource command or type generation ran.

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| Architecture | Preserve InstrumentRepository signatures and shared service/REST policy boundaries; new native D1 adapter owns SQL/mapping. src/index.ts and src/app.ts remain unchanged | Phases 1–3 |
| Runtime | Proposed getPlatformProxy through installed Wrangler, explicit local config and remoteBindings:false. Actual initialization, generated types/DOM compatibility and batch behavior are unverified gates; no new pool/framework dependency assumed | Phase 1 |
| Regression | Existing memory acceptance tests instantiate Memory directly and need a reusable suite/factory. Keep memory behavior and all 92 original tests; add D1 parity rather than replace diagnostics or schemas | Phases 1, 3 |
| Persistence | New tables/migrations, durable original replay snapshots and SQL compare-and-swap. Runtime restart, rollback and concurrent-client evidence required; no migration/import of ephemeral memory records | Phases 2, 3 |
| API | Request/response fields/statuses and cursor format unchanged. Contract docs must distinguish instance-lifetime memory from persisted local D1; no new route, auth grant or tool | Phase 3 |
| Security | Synthetic local files only; root Wrangler dev/production stay binding-free. Local fixture has no account/remote ID/secrets; no credential-file reads or auth extraction. D1 is not an auth or backup gate completion | Phases 1–3 |
| Container | Existing Docker excludes all SQL by default; selectively allow/copy/mount only the two source migrations. Never include DB files, broad project docs, credentials or dumps | Phase 3 |
| Documentation | Update README/INSTALL and relevant memory after observed implementation evidence; clarify storage-specific durability, schema management, types, local cleanup and remaining gates | Phase 3 |

## Rules

| Rule | Why it applies |
| --- | --- |
| No implementation during planning | Write only these plan/phase documents; no migration, binding or database created now |
| Preserve the port and public REST behavior | Same get/list/create/update semantics, typed outcomes and original replay result across both adapters |
| All database operations explicitly local | Fixed test config, --local CLI flags, remote:false binding and remoteBindings:false proxy; never create/info/remote/preview/deploy commands |
| Preserve diagnostic-only deployment | No root Wrangler bindings, new default routes, fixture principals, D1 instantiation or MCP tools in src/index.ts |
| Atomicity belongs in D1 SQL/batch | No process-local lock, check-then-write outside the transaction or BEGIN/COMMIT split across awaited calls |
| Exact types and safe SQL | Generated native D1 declarations, bound parameters, safe integer versions and explicit TEXT/null/boolean mapping; no any, forced platform casts or monetary SQL arithmetic |
| Synthetic state only | Keep local SQLite/WAL files in ignored, owned .wrangler paths; no actual ISIN watchlist, holdings, tokens, PRU or financial exports |
| No staging/commit/push or hook execution | Current task does not authorize Git writes or context synchronization hooks |

## Decisions

| Decision | Why |
| --- | --- |
| Proposed: keep InstrumentRepository signatures unchanged | Existing record + canonical input + key/subject and expected version suffice; persistence semantics are clarified below |
| Proposed: two append-only SQL migrations | 0001_instruments.sql defines catalog/index; 0002_instrument_create_outcomes.sql defines receipt/FK/integrity rules. No ORM or extra database framework |
| Proposed: batch create with conditional inserts and final receipt read | New record and original outcome commit together; existing key skips both inserts, so replay cannot generate an orphan or overwrite a result |
| Proposed: batch conditional update plus same-transaction row read | CAS changes and returned row share a transaction; zero-match classification cannot race a separate outside SELECT |
| Proposed: retain create outcomes without TTL in this slice | Restarts must not enable key reuse; cleanup/retention changes need a later explicit contract decision |
| Proposed: native Wrangler proxy plus existing Vitest | Uses real local D1 binding without assuming Workers Vitest-pool compatibility or adding packages |
| Proposed: separate local-only binding config, root diagnostic config untouched | Test configuration is not a third deployment/environment. Its main still points to the existing diagnostic entrypoint; the Node fixture alone injects D1 into synthetic HTTP composition |

Risks and contract clarifications requiring review before implementation:

| Risk | Evidence / proposed disposition |
| --- | --- |
| Memory-only concurrency guarantees do not extend to D1 | Existing Map critical section has no awaits. New adapter must pass independent-instance and rollback tests using the actual SQL transaction |
| Canonical input can drift across service releases | Current service uses JSON.stringify on parsed/defaulted fields. Freeze instrument-create canonical form v1 (field order, explicit nulls/defaults, no Unicode normalization); persist its version; future changes need migration/version policy. No new port argument proposed |
| Original replay differs from current instrument | Persist an immutable original Instrument snapshot, not only instrument_id; replay after PATCH/restart returns version 1 and original timestamps/body/ETag/Location |
| Repository contract is implicit and tests are service-coupled | Document valid, service-validated inputs, get-missing=null, update errors, list's internal limit up to 101, null filter and binary ID order; extract the existing suite without weakening it |
| create accepts the broad Instrument type today | Proposed precondition clarification: a service-generated initial record has version 1, equal initial timestamps and metadata matching canonical input. Memory currently does not enforce this at runtime. Arbitrary later-version records are not valid create inputs; this clarification needs review, without a signature change |
| Durable scope and retention are new guarantees | D1 outcome identity is (subject, createInstrument, key). Subject must remain stable through auth changes. No expiry, hard delete or automatic garbage collection in this slice; memory remains ephemeral |
| SQL conversions can alter values | Map 0/1 strictly to boolean, preserve null/TEXT/timestamps and safe integer versions; validate loaded records/snapshots. Unicode/casing/escaping round trips are explicit tests; unsupported accepted values require review, not silent normalization |
| Error classification can mask storage faults | Only proven unique-ISIN constraints map to duplicate_isin; PK collision, FK/CHECK/corruption/runtime errors remain sanitized storage failures. Match pinned runtime evidence, never expose raw D1 errors/SQL/bindings |
| Local tooling/type assumptions are unproven | No root Workers/Node type package. Generate D1 runtime/binding declarations with installed Wrangler, retain strict checks and test DOM compatibility. Stop for approval if a new dependency or contract change is actually needed |
| Persistence is not backup/recovery | Reopening the same local directory proves only tested local durability. No remote quotas, replication, production CPU, encryption, recovery or private-data release evidence |

No public API version/shape change is proposed. The one deliberate documentation
change strengthens D1 replay durability beyond the memory adapter's lifetime; it does
not pretend that MemoryInstrumentRepository survives a process restart. Approval of
this plan should cover these clarifications before code is written.
