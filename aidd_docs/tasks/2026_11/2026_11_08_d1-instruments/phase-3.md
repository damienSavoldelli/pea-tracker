---
status: done
---

# Instruction: Prove restart durability, HTTP parity and deployment isolation

## Architecture projection

```txt
✏️ tests/helpers/instruments-http-server.mjs
✏️ tests/helpers/instruments-http-server.d.mts
✅ scripts/dev-instruments-d1.mjs
✅ tests/instruments.d1-restart.test.ts
✅ tests/instruments.d1-network.test.ts
✏️ tests/instruments.regression.test.ts
✏️ .dockerignore
✏️ Dockerfile
✏️ compose.yaml
✏️ README.md
✏️ aidd_docs/INSTALL.md
✏️ aidd_docs/api/openapi.json
✏️ aidd_docs/tasks/2026_11/2026_11_08_financial-instruments/contract.md
✏️ aidd_docs/memory/architecture.md
✏️ aidd_docs/memory/codebase-map.md
✏️ aidd_docs/memory/testing.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Migrate a unique local persist-to path, open a fixed-principal D1 HTTP harness on 127.0.0.1 | Local state only; no public binding or auth change | CLI |
| Happy path | Run create/list/get/PATCH HTTP requests against Memory and D1 using the same contract assertions | Identical DTO/status/header semantics, including original replay | API |
| Edge case | Create, PATCH, dispose runtime, reopen same path with new adapter/service and then a new harness process | Current row/version survive; original create replay remains v1, including initial times and metadata | API |
| Edge case | Retry after commit whose result was discarded; reuse the key with changed input after restart | Original outcome returned or 409, never a second row | API |
| Edge case | Two independent D1 repository instances concurrently create or PATCH | Same-key and ISIN uniqueness plus version CAS hold without a shared JS lock | System |
| Edge case | Query fresh/old cursors or submit stale version after restart | Cursor ordering/filter contract unchanged; persisted version rejects stale PATCH | API |
| Edge case | Default Worker receives instrument requests despite test bindings elsewhere | 404; health metadata and MCP ping-only discovery unchanged | API |
| Teardown | Close HTTP server before disposing proxy; terminate owned processes and remove only test temp data | No listeners/workerd children or modified developer database; developer local state retained intentionally | System |

## Tasks to do

### `1)` Add local-only D1 composition through the existing HTTP guard

1. Allow the existing test-only HTTP helper to receive an InstrumentRepository from
   server-side composition, defaulting to its current memory repository. Keep fixed
   startup principals, literal 127.0.0.1 bind, Host/Origin/cross-site/body/timeout guards
   and no identity/config selection through requests. Do not change src/app.ts/index.ts.
2. Add an explicit D1 local launcher using the fixed fixture config and official proxy,
   remoteBindings:false/envFiles:[], owned persistent path, and the same guarded HTTP
   helper. Migrations are a separate explicit Wrangler --local command; startup checks
   expected schema and fails if unapplied, rather than migrating on an HTTP request.
3. Preserve the existing memory launcher and defaults. No remote config/ID/host toggle,
   cloud auth or generic raw-SQL endpoint. D1 launcher stops HTTP first, disposes local
   runtime and removes only its generated bundle; it retains developer DB state across
   launches. Test-owned paths alone are eligible for cleanup after restart assertions.

### `2)` Prove persisted semantics under independent clients and process restarts

1. Run parameterized raw-port/service acceptance cases against fresh Memory/D1 stores,
   including field/default/null/Unicode round trips, copy isolation and deterministic
   pagination. For concurrency, create two repository/service objects against the same
   actual D1 binding with independent ID generation, not two isolated databases or mocks.
2. After create plus PATCH, dispose/reopen workerd on the same directory and create
   new repository/service objects. Assert current row version/name/active state and
   stale-version rejection; replay returns the exact original Instrument/HTTP 201,
   original ETag/Location/time, not the current modified row. Changed canonical input
   conflicts and a second subject/key remains distinct. Failed validation reserves no key.
3. Add a real Node harness process stop/restart test, using owned child processes and
   the same synthetic fixture subject/path. Restart after an acknowledged commit and
   a deliberately discarded create result; do not rely only on recreating a class
   around a still-live proxy. Wait for disposal/exit before reopen and always clean up.
   This proves tested local restart behavior, not power-loss, backup or remote recovery.
4. Add concurrent same-key/same-input and same-key/different-input creates, distinct-key
   same-ISIN creates, null-ISIN creates and same-version PATCH races. Check row/outcome
   counts, winner/loser errors and returned captured state. Request arrival order is
   nondeterministic; outcome invariants must be deterministic.
5. Validate real HTTP success and representative failures against existing offline
   OpenAPI assertions. Verify authorization before DB access with denied fixtures;
   sanitized 500 on corruption/storage failure, no SQL/binding payload leaks. Keep
   every original health/MCP/default-route regression assertion and public response shape.

### `3)` Preserve local tooling and record verified boundaries

1. Docker must receive only the two pristine source SQL migrations and generated
   native type declarations needed by tests, using selective build-context exceptions,
   copies and read-only file mounts. Current .dockerignore excludes **/*.sql: add
   exact migration exceptions after that denial; never broadly allow dumps/DB files.
   Keep SQLite/WAL/state excluded, no credential/home mounts or new published port.
2. Document commands/state/type generation and both storage lifetimes in README,
   architecture/testing/codebase memory and existing contract. Update only OpenAPI
   storage-description extensions/parameter prose, not operation fields/statuses/security.
   Keep no TTL/deletion promise and explicitly identify all fixture data as synthetic.
3. Run strict TypeScript, all old/new tests, OpenAPI validation, real loopback HTTP,
   container checks when Docker files change and root dev/production dry-run bundles.
   Assert root config remains binding-free; both builds must retain diagnostics only.
4. Record actual test counts, migration/rollback/restart evidence, query plans and
   tooling limitations in the implementation record. No production CPU, cloud
   durability, OAuth, financial-methodology or recovery-gate claims. No Git writes,
   hooks, deployment or remote D1 operation is authorized by the plan.

## Test acceptance criteria

Implementation evidence: host and Docker strict TypeScript +171 tests/12 suites
pass. Real HTTP/OpenAPI runs against both repositories; restart uses a new Node
and workerd process, including process-group SIGINT shutdown. Both dev/production
dry-run bundles pass and report no bindings. Default health/MCP regressions pass;
src/index.ts, src/app.ts and root wrangler.jsonc remain unchanged. Only source SQL
is allowlisted for Docker; no state, credentials, remote resources or Git writes.
See [implementation.md](implementation.md) for commands, concurrency guarantees,
observed transient load-test limitation and remaining release gates.

| Task | Acceptance criteria |
| --- | --- |
| 1 | Both local launchers use the same services/HTTP guard; D1 persists across launches while default Worker and memory launcher behavior remain unchanged |
| 1 | No request can select a principal, external config, remote database or bind address; all runtime/HTTP resources are closed safely |
| 2 | New workerd runtime and a new harness process recover rows, versions and original idempotent results from disk; changed retries conflict without extra writes |
| 2 | Independent-client concurrency/rollback tests and OpenAPI HTTP parity pass against actual Wrangler local D1; no mock counted as SQL durability evidence |
| 3 | Existing 92 tests plus added D1 cases, strict types, contract validation, Docker checks and both diagnostic-only dry-run bundles pass; no private route/resource exposed |
| 3 | Docs accurately state tested local durability and remaining auth/recovery limits; only approved implementation files change and no sensitive state is staged or published |
