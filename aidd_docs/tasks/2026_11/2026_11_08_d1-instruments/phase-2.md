---
status: pending
---

# Instruction: Versioned schema and atomic D1InstrumentRepository

## Architecture projection

```txt
✅ migrations/0001_instruments.sql
✅ migrations/0002_instrument_create_outcomes.sql
✅ src/adapters/d1/instruments.ts
✅ tests/instruments.d1.test.ts
✅ tests/instruments.d1-integrity.test.ts
✅ tests/d1-migrations.test.ts
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Apply ordered source migrations to fresh local state through Wrangler --local | Both schema versions tracked; no request-time schema creation | CLI |
| Happy path | Run the same repository acceptance suite on Memory and local D1 | Equivalent records, ordering, null/boolean values, replay and typed errors | System |
| Edge case | Reapply migration command; upgrade a populated v1 database to v2 | No duplicate migration execution or lost records; v2 supports new creates | CLI |
| Edge case | Force failure after instrument insert but before outcome insert | Neither record nor reserved idempotency key survives rollback | System |
| Edge case | Concurrent keys, ISIN conflicts and two clients updating the same version | One winning create/CAS as applicable; no orphan rows or overwritten outcome | System |
| Edge case | Bad scalar/null/enum/version data, orphan FK or malformed stored snapshot | Constraint rejection or sanitized corruption failure; no silent coercion | System |
| Edge case | Storage failure, PK collision or unknown constraint | No false duplicate_isin mapping and no raw query/binding leakage | System |
| Teardown | Dispose local proxies and owned stores | No global locks/cache or test state retained | System |

## Tasks to do

### `1)` Define two versioned migrations and database integrity rules

1. 0001_instruments.sql creates instruments with explicit column lists matching the
   existing Instrument DTO: id TEXT NOT NULL PRIMARY KEY COLLATE BINARY; name/kind/
   quote_currency/price_unit/created_at/updated_at non-null TEXT; nullable isin,
   exchange_mic and provider_symbol TEXT; active INTEGER 0/1; version INTEGER in
   1..9007199254740991. Preserve explicit nulls and original UTC timestamp strings.
2. Add checks for non-null/type/length bounds, supported kind/unit enums, uppercase
   code shape and safe integer/boolean values. Name length uses code points; reject
   NULs. UUID/code/ISIN shape belongs in constraints where expressible; full ISIN
   checksum, Unicode whitespace and provider semantics remain shared domain validation.
   Row/snapshot decoding validates the domain schema and fails closed on corruption.
3. UNIQUE(isin) is case-sensitive and applies to inactive records; multiple NULLs
   are permitted. Add instruments_active_id(active,id) for filtered keyset pagination;
   the primary-key index supports unfiltered id continuation. No index on names or
   speculative tenancy/history columns. Verify both query paths with EXPLAIN QUERY PLAN.
4. 0002_instrument_create_outcomes.sql creates instrument_create_outcomes with subject,
   operation, idempotency_key, canonical_version=1, canonical_input, instrument_id,
   original_instrument_json and recorded_at. Composite PK(subject,operation,idempotency_key) has
   explicit NOT NULL/BINARY identity; operation is createInstrument. Enforce key/subject
   bounds, valid non-null JSON object snapshot and FK instrument_id -> instruments.id
   with deletion/update restricted. Add the child-key index on instrument_id.
5. Original outcome snapshot stores the whole initial Instrument DTO (including v1
   timestamps/version), not mutable current-row JSON or transport headers. Require
   snapshot id to match instrument_id, snapshot version=1 and snapshot fields to be
   valid during decoding. No TTL or outcome overwrite/delete path. Any SQL trigger
   used for immutable identity/outcome enforcement must only reject invalid writes,
   not introduce hidden side effects; prove it with direct SQL tests.
6. Source migrations contain DDL only and are append-only once applied; do not use
   IF NOT EXISTS to hide drift. Migration tracking uses Wrangler d1_migrations, not a
   separate hand-rolled runner. Test fresh apply, repeat apply, v1->v2 and a deliberately
   failing test-owned migration: prior successful versions/data remain intact and the
   failed version leaves no partial schema. No automatic downgrade/destructive reset.

### `2)` Implement parameterized read and mapping operations

1. D1InstrumentRepository receives the native typed D1Database and implements the
   unchanged port. SQL stays here; services/domain/REST/MCP do not import D1 or SQL.
   Read only explicit DTO columns; decode booleans strictly from 0/1 and reject invalid
   strings, unsafe versions, bad JSON and null/type drift as storage failures.
2. get uses prepared ID lookup and returns null when absent. list uses fixed query
   variants for active/no-active and after/no-after; bound LIMIT up to internal 101,
   binary ascending ID and no OFFSET, full history scan or total-count calculation.
3. Use default primary-binding behavior without Sessions/read replicas in this slice.
   Sessions are not a transaction mechanism. Keep SQL result metadata internal.

### `3)` Atomically create the instrument and original replay outcome

1. Send one native D1 batch with three prepared statements. Both insert predicates
   check the same (subject, createInstrument, key) receipt inside that transaction:
   statement A inserts the candidate instrument only when that receipt does not exist;
   statement B inserts canonical input/version and the candidate snapshot only when
   the receipt does not exist; statement C selects the receipt by the composite key.
2. Fresh key: A and B commit together, C returns the original result. Existing key:
   both inserts skip, C returns the saved canonical input/snapshot. Compare saved
   canonical input/version with the incoming v1 string exactly after successful batch:
   same input returns original Instrument; changed input throws idempotency_conflict
   without a database mutation. No preflight SELECT decides whether to insert.
3. This conditional-insert design does not need INSERT OR IGNORE, REPLACE, a provisional
   receipt with NULL payload, post-commit repair, uniqueness suppression or JS locks.
   Existing-key retries may contain a newly generated candidate ID/time; they must
   never create a row or conflict with the original ISIN. Missing/malformed receipt
   after an otherwise successful batch is a storage failure, not a new create attempt.
4. A new-key duplicate non-null ISIN aborts the complete batch; map only the proven
   instruments.isin unique constraint to existing duplicate_isin/409. PK collision,
   CHECK/FK/runtime errors remain storage failures. Keep underlying D1 errors private.
   Lost-response retry is safe because outcome and row were committed together.

### `4)` Atomically update and classify version conflicts

1. Batch a prepared conditional UPDATE and a SELECT of the same record. UPDATE changes
   only name/active, sets updated_at, increments version once, and matches id plus
   expected version with version < 9007199254740991. Missing PATCH fields preserve
   current values; false is not treated as absent. Keep immutable identity/created_at.
2. Inspect UPDATE meta.changes and the SELECT result captured in that same transaction.
   One changed row returns its captured DTO, even if another writer later commits.
   Zero changed rows: absent record -> instrument_not_found/404; present version not
   equal expected -> version_mismatch/412; equal maximum version -> version_exhausted/409.
   Preserve this precedence. Any other impossible result is a storage failure.
3. Do not perform the diagnostic read after batch completion or rely on last_row_id,
   a read-modify-write JS value, HTTP retry replay for PATCH, or a process-local mutex.
   RETURNING is unnecessary: the batched row read supplies the exact post-update state.
4. Add the shared contract suite and D1-specific SQL integrity/error/rollback tests.
   Force outcome insertion to fail in a disposable DB using a test-only constraint
   or rejecting trigger, invoke the actual repository, then verify no record or key
   reservation remains. Do not add production fault-injection API/configuration.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Ordered migrations, constraints, nullable ISIN uniqueness, FK and both pagination indexes verified in actual Wrangler local D1; source migrations contain no data or remote identifiers |
| 1 | Fresh/repeated/upgrade/failed migration cases prove tracking and rollback without losing earlier data |
| 2 | get-null, binary list order/limits and TEXT/null/boolean/safe-integer round trips match Memory; corrupt rows/snapshots fail safely |
| 3 | Same-key replay, changed-input conflict, different-subject scope, duplicate/inactive ISIN and independent-client races preserve exactly one valid outcome without orphan/partial rows |
| 3 | Forced second-write failure rolls back the actual repository create; unknown storage errors cannot be mislabeled as domain conflicts |
| 4 | CAS races have one winner and exact returned winning state; missing/stale/max-version errors match Memory, with no post-transaction classification race |
