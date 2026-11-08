# D1 Instruments implementation evidence — 2026-11-08

Source: [approved plan](plan.md). Synthetic local data only. No Git writes,
remote D1 resource, deployment, public instrument route or real financial data.

## Delivered design

- `D1InstrumentRepository` implements the unchanged get/list/create/update port.
  SQL, native binding types, boolean conversion and strict persisted DTO decoding
  stay in the adapter. Shared application services and authorization are unchanged.
- `0001_instruments.sql`: catalog table, binary UUID primary key, nullable unique
  ISIN including inactive records, safe integer version, scalar/enum checks,
  `(active,id)` index, immutable identity and one-step version rejection triggers.
- `0002_instrument_create_outcomes.sql`: subject/operation/key primary key,
  canonical form version 1, original full response snapshot, restricted instrument
  FK and child index; immutable outcome triggers. Snapshot identity/version/initial
  times checked in SQL and complete domain/canonical consistency checked on read.
  No TTL, hard-delete API or outcome cleanup mechanism.
- Create uses one native three-statement batch: conditionally insert row,
  conditionally insert receipt, read receipt. An existing key skips both writes.
  Same input returns original DTO; changed input returns 409 without a new write.
  Only the verified native ISIN unique violation maps to duplicate_isin; other
  failures remain sanitized. No preflight SELECT, OR IGNORE/REPLACE or JS lock.
- PATCH batches conditional version UPDATE and SELECT. One change returns the
  captured post-update row. Zero changes use that captured row to classify absent
  404, stale 412, matching exhausted version 409. A zero-row UPDATE is SQL success,
  and no dependent write exists. Other SQL failures roll back the batch.

## Tooling gates resolved

- Pinned Wrangler 4.158.0 initializes actual local D1 without account/database IDs;
  no provisioning fallback or additional package was needed. Native declarations
  were generated with workerd 1.20261104.1, compatibility date 2026-11-06.
- Fixed fixture config sets remote:false and no public exposure; official proxy
  uses remoteBindings:false, envFiles:[] and explicit empty environment selection.
  Root Worker config and deployment entrypoint are unchanged and binding-free.
- Official CLI `--persist-to <owned directory>` and proxy `persist.path` at
  `<owned directory>/v3` see the same database. A CLI read verifies the proxy-written
  probe. All state stays in ignored `.wrangler` paths.
- Ordered source migrations use Wrangler `d1_migrations`; fresh, repeated,
  populated-v1 upgrade and failing-version rollback are tested. No request-time DDL.
- D1 launcher requires migrations already applied, fixes principal at startup and
  reuses the original loopback/Host/Origin guards. Its detached runtime child avoids
  Miniflare synchronous terminal signal exits; process-group SIGINT initiates IPC
  shutdown, closes HTTP, awaits proxy disposal and removes the generated bundle.
  Developer state `.wrangler/instruments-d1-local` remains across launches. Tests
  dispose runtimes and remove only their owned `.wrangler/d1-tests-*` stores.
- Generated Worker types tighten Response.json() to unknown. One existing HTTP
  test now parses its payload with the existing Zod schema; no dependency change.
  Commit review removed five upstream trailing-space lines from generated types;
  this normalization changes no declaration semantics.
- Docker receives only two exact SQL source exceptions/copies/read-only mounts.
  SQLite/WAL files, dumps, credentials and Wrangler state remain excluded; its
  normal Worker stays diagnostic-only and no new port is published.

## Validation

| Check | Result |
| --- | --- |
| Host `npm run check` | Strict TypeScript + 171 tests across 12 suites passed |
| Docker image build | Passed with only the two allowlisted source SQL files |
| Docker `npm run check` | Strict TypeScript + 171 tests across 12 suites passed |
| OpenAPI schema/HTTP responses | Passed in host and container suites, for both repositories |
| Dev Worker dry-run | Passed, 1489.13 KiB upload / 258.58 KiB gzip; No bindings found |
| Production Worker dry-run | Passed, same size; No bindings found |
| `git diff --check` | Passed |
| Deployment entrypoint/root config/dependencies/security instructions | Unchanged; index remains empty |

Changed areas: native adapter/generated types and port comments; two source
migrations; fixed local D1 fixture and lifecycle helpers/launcher; shared repository
and real HTTP test suites, new runtime/migration/integrity/restart tests; exact Docker
SQL allowlist/copies/mounts; README, INSTALL, storage-only OpenAPI annotation,
instrument contract addendum, relevant memory and this plan/evidence folder.

Coverage includes 17 shared repository cases per adapter, real HTTP/OpenAPI
workflows per adapter, concurrent same-key/same-input and changed-input creation,
distinct-key duplicate ISIN creation, concurrent CAS, no-op updates, missing/stale/
maximum-version precedence, rollback on failed receipt insertion, failed-key retry,
PK/unknown constraint failures, corruption and sanitized HTTP 500 responses.

The runtime gate proves whole-batch rollback on SQL failure and separately proves
that a zero-row UPDATE followed by an independent INSERT would commit that INSERT.
The repository's SELECT-only dependent statement avoids that partial-write hazard.

Actual process shutdown/restart recovers current records/versions, old cursors,
original 201 body/ETag/Location and an acknowledged-but-discarded create result.
Changed retries remain conflicts and no extra record is created. EXPLAIN QUERY PLAN
confirms primary-key continuation and the active/id index. Existing health and MCP
initialization/discovery/ping regressions remain in the full suite.

One initial full Docker run had an unidentified native storage failure while the
pagination fixture issued 102 simultaneous creates. Instrumented targeted/full
reruns did not reproduce it, so queue saturation is not established. Pagination now
seeds sequentially; dedicated 2-client/6-request race tests remain concurrent.
This slice provides no 102-way load or production throughput guarantee.

## Remaining limits

- Graceful local restart evidence is not power-loss durability, remote D1 behavior,
  Time Travel, independent encrypted backup or restoration evidence.
- No OAuth/provider selection, production authorization, rate-limit or CPU gate is
  completed. Any local process can use the selected synthetic fixture role. Never
  publish, tunnel or proxy the fixture; no real financial information is allowed.
- Stable authenticated subject identity, canonical-version evolution and future
  outcome retention require explicit policy before changing the persisted contract.
- There is no migration from ephemeral Memory state, replica/session policy,
  automatic retry/load control or remote D1 configuration in this increment.
- Existing financial/accounting decisions remain open; this adapter adds metadata
  persistence only. Nothing stages, commits, pushes or changes cloud resources.
