---
status: done
---

# Instruction: Freeze repository semantics and verify local D1 tooling

## Architecture projection

```txt
✏️ src/ports/instruments.ts
✏️ tests/instruments.repository.test.ts
✅ tests/helpers/instrument-repository-contract.ts
✅ tests/helpers/d1-local.mjs
✅ tests/helpers/d1-local.d.mts
✅ tests/fixtures/wrangler.d1-local.jsonc
✅ src/adapters/d1/worker-configuration.d.ts
✅ tests/d1-local-runtime.test.ts
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Run existing 92-test/typecheck baseline; inspect config/schema and generated type help | Baseline preserved; no runtime/dependency upgrade hidden in setup | CLI |
| Happy path | Run reusable acceptance cases against Memory and initialize a fresh local D1 proxy | Memory semantics unchanged; real local binding available without cloud credentials | System |
| Edge case | Config contains remote/account IDs, remote:true, additional resource bindings, vars/secrets or external inheritance | Fixture refuses initialization before any binding/resource operation | System |
| Edge case | Two fixture directories initialize; close/reopen one through official proxy | Separate stores remain isolated; same store can reopen after disposal | System |
| Edge case | Controlled constraint failure in second statement of a local scratch batch | Whole batch rolls back; result metadata distinguishes changed and unchanged statements | System |
| Edge case | Generated D1 types conflict with current strict TS/DOM environment or ID-free config is rejected | Stop for bounded tooling review; no casts, fake IDs, installs or remote fallback | CLI |
| Teardown | Dispose every proxy/runtime, close loopback listeners and remove only owned temporary paths | No workerd process/file handle leak; developer persistent directory untouched | System |

## Tasks to do

### `1)` Extract and document the unchanged repository contract

1. Expand port comments, not signatures: only validated domain/service inputs are in
   contract; get returns null when absent; update throws existing 404/412/409 errors;
   returned values do not expose mutable storage. Keep authorization in services/adapters.
   Explicitly define create's valid record as the service-generated initial state:
   version 1, created_at equal to updated_at and metadata matching canonicalInput.
   Instrument's broader type and Memory's current permissiveness do not establish
   support for arbitrary later-version create inputs. Obtain review of this clarification.
2. Extract reusable acceptance cases with an async repository factory and teardown.
   Keep existing four memory tests and add raw-port expectations for ordering,
   null filters, get-null, internal limit <=101, no-op PATCH version increment,
   original replay after update, changed key payload and inactive ISIN. Version-boundary
   states are prepared through adapter-specific synthetic test setup, not a production
   create precondition loophole or public seed API; assert update error precedence there.
3. Freeze canonical-input v1 fixtures from current service parsing/defaults and property
   order; no source service behavior change, whitespace/Unicode normalization, digest-only
   comparison or new REST field. Two persistent clients must use distinct ID streams
   or crypto UUIDs: the current helper resets deterministic IDs per new fixture.

### `2)` Establish native local bindings without touching deployment configuration

1. Create a test-only Wrangler JSONC with binding INSTRUMENTS_DB, local database name
   pea-tracker-instruments-local, remote:false, migrations_dir ../../migrations,
   compatibility date matching root, workers_dev:false and preview_urls:false.
   Its main is ../../src/index.ts (still diagnostics only). Do not extend root config,
   include named environments, account IDs, remote database/preview IDs or secrets.
2. Use installed Wrangler getPlatformProxy from the Node-only helper with explicit
   configPath, environment:"", envFiles:[], remoteBindings:false and an owned persistent
   path. Check the fixture directory has no .env/.dev.vars files without reading any
   secret file; never load Wrangler credential files. Verify CLI/proxy same-state path
   mapping before relying on restart evidence: CLI persist-to directory corresponds
   to proxy persist.path at its v3 subdirectory.
3. Generate native runtime/binding declarations from this fixture using installed
   Wrangler types into src/adapters/d1/worker-configuration.d.ts; keep generated output
   provenance and regenerate/check it rather than hand-copy D1 interfaces or Env.
   Prove compatibility with existing strict TypeScript/DOM declarations. If this needs
   a broader type/config change or package installation, report it before proceeding.
4. Initialize only disposable local state after implementation approval. Prove no
   remote ID is needed by the pinned binary; config-schema evidence alone is not proof.
   Do not call d1 create, login, remote/preview operations or automatic provisioning.

### `3)` Verify transaction primitives before implementing the adapter

1. Use disposable literal scratch schema in a test-owned database to verify batch
   success, forced second-statement rollback, foreign-key enforcement and per-statement
   meta.changes (including zero rows and one no-op-value update with version increment).
2. No adapter implementation, generated SQL source migration or root app binding is
   needed for this probe. Failure is a stop/review gate, not permission to substitute
   JS locks, generic SQLite mocks, unsafe BEGIN/COMMIT or a new transaction service.
3. Use existing Vitest and MJS/typed-declaration helper pattern for Node lifecycle;
   no assumed Workers pool compatibility, @types/node or Workers-type package install.

Future explicit local commands, documented here only and not run during planning:

```sh
node node_modules/wrangler/bin/wrangler.js types src/adapters/d1/worker-configuration.d.ts --config tests/fixtures/wrangler.d1-local.jsonc --env="" --env-interface D1LocalEnv
node node_modules/wrangler/bin/wrangler.js d1 migrations apply pea-tracker-instruments-local --config tests/fixtures/wrangler.d1-local.jsonc --env="" --local --persist-to .wrangler/instruments-d1-local
```

The migration command belongs after phase 2 authors the SQL files. Tests substitute
a unique test-owned persist-to path, never the developer directory. Use official CLI
arguments directly; no credential extraction, custom Cloudflare HTTP or hidden remote
operation in a test helper. These commands were planning-only when authored;
implementation now provides the fixture/declarations and exercises test-owned state.

## Implementation evidence

- Native ID-free binding initialization, foreign keys, batch rollback, zero-row
  success and runtime reopen pass in `tests/d1-local-runtime.test.ts` (5 cases).
- Official CLI SELECT reads the same persisted scratch row as the proxy, verifying
  CLI root versus proxy root/v3 mapping. Distinct directories remain isolated.
- Native declarations generated with Wrangler 4.158.0/workerd 1.20261104.1,
  compatibility date 2026-11-06; strict TypeScript passes without new dependencies.
- Repository signatures unchanged; approved initial-create preconditions documented.
  Shared suite has 17 cases per adapter; Memory retains its 4 original cases.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Existing memory/service behavior and original tests pass; both adapters can consume one parameterized suite; port has no signature or HTTP coupling change |
| 1 | Canonical/default/Unicode fixtures are frozen; raw get-null, bounded order, immutable replay and error precedence are explicit |
| 2 | Real local D1 opens without account/remote IDs or new dependency; remote bindings disabled, state paths isolated and native types compile strictly |
| 2 | Root wrangler.jsonc, default entrypoint and public route set remain unchanged; no database is provisioned remotely |
| 3 | Pinned local runtime proves whole-batch rollback, enforced FK and reliable update change counts; all resources are disposed after tests |
