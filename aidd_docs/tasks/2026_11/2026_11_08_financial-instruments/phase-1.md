---
status: done
---

# Instruction: Shared catalog model, policy and memory repository

## Architecture projection

```txt
✅ src/domain/instruments.ts
✅ src/ports/instruments.ts
✅ src/application/authorization.ts
✅ src/application/instruments.ts
✅ src/adapters/memory/instruments.ts
✅ tests/instruments.service.test.ts
✅ tests/instruments.repository.test.ts
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Run existing npm run check before edits; create fresh repo, deterministic clock/IDs and synthetic principals per test | Diagnostic baseline recorded; isolated fixtures | CLI |
| Happy path | Create/read/list/update/deactivate a synthetic stock and ETF | Stable identity, expected defaults/nulls, versions, timestamps and sorting | System |
| Edge case | Invalid fields, ISIN checksum, casing, Unicode bounds or server-owned input | Typed validation failure, no write or key reservation | System |
| Edge case | Duplicate non-null ISIN, including inactive record | Conflict; no duplicate row; null ISINs remain permitted | System |
| Edge case | Replay same key with canonical defaults; change payload under same key | Exact original outcome or conflict, respectively | System |
| Edge case | Concurrent duplicate creates or two updates with the same version | At most one created record; exactly one update winner | System |
| Edge case | Missing/read-only/MCP/collector principal attempts admin operation | Denied before repository access; no implicit grant | System |
| Edge case | Mutate returned object or construct second app/repository | Stored state unaffected; no fixture leakage | System |
| Teardown | Release per-test repository/fixtures | No module-global state, retained financial files or running service | System |

## Tasks to do

### `1)` Establish catalog invariants and capability policy

1. Read the approved PRD, contract.md and OpenAPI; implement metadata only. Run existing
   diagnostics first and resolve baseline failures before changing composition.
2. Define domain types/validation using installed Zod; implement ISIN checksum and
   Unicode code-point name limits explicitly, not UTF-16 code-unit length by accident.
   No monetary decimal library or financial calculation belongs in this slice.
3. Define trusted principal and distinct read/admin permissions. Services require a
   verified context and reject missing permission; raw HTTP scopes/headers are never
   a source of trusted permissions. Future REST/MCP auth adapters own scope mapping.

### `2)` Implement the repository port and acceptance adapter

1. Define get, bounded list, atomic create-with-replay, and versioned update semantics.
   Use typed validation/conflict/missing/precondition errors rather than HTTP responses.
2. Build per-instance in-memory storage with defensive copies, non-null ISIN uniqueness,
   canonical input comparison, original response replay and compare-and-swap updates.
   Prevent async interleaving from splitting mutation/replay checks into separate writes.
3. Use cursor payload version/last-ID/filter with strict bounded parsing and deterministic
   ID ordering. Reject malformed/mismatched cursors; document absence of snapshot semantics.
4. Test adapter behavior through the port, so a later D1 adapter can reuse acceptance
   cases. No SQL, migration, binding, Wrangler change or disk persistence.

### `3)` Implement shared application capabilities

1. Provide list/get/create/update service operations with injected clock and ID generator,
   policy-before-access checks and no Hono/MCP/SQL dependencies.
2. Apply create defaults once before replay comparison; preserve immutable metadata,
   creation timestamp and original idempotent outcome. Increment version once for PATCH.
3. Add service/repository tests for success, denial, retry, uniqueness, pagination,
   compare-and-swap and application-instance lifetime limits.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Existing diagnostics pass before work; valid metadata accepted and invalid/unknown/financial fields rejected; Unicode and checksum fixtures demonstrate specified boundaries |
| 1 | Missing permission prevents every repository call; no admin inheritance from read/MCP/collector identity |
| 2 | Same-key/default-equivalent concurrent creates produce one stored record and original replay outcome; changed input conflicts; invalid requests reserve no key |
| 2 | Duplicate non-null ISIN conflicts even when inactive; null ISINs coexist; deterministic bounded pages and independent repository instances verified |
| 2 | Concurrent updates at one version have one winner; defensive-copy tests prevent external mutation |
| 3 | All four capabilities obey typed contract and injected time/IDs, with no transport/storage imports in application logic; npm run check passes |
