---
status: done
---

# Instruction: Contract, concurrency and regression evidence

## Architecture projection

```txt
✅ tests/instruments.contract.test.ts
✅ tests/instruments.regression.test.ts
✅ tests/helpers/openapi.ts
✅ aidd_docs/api/schemas/openapi-3.1-2025-09-15.json
✅ aidd_docs/api/schemas/LICENSE
✅ aidd_docs/api/schemas/README.md
✏️ aidd_docs/api/openapi.json
✏️ aidd_docs/tasks/2026_11/2026_11_08_financial-instruments/contract.md
✏️ README.md
✏️ aidd_docs/memory/architecture.md
✏️ aidd_docs/memory/codebase-map.md
✏️ aidd_docs/memory/testing.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Read actual OpenAPI and shared runtime schemas | Operation/schema/security coverage is explicit | CLI |
| Happy path | Assert four-operation responses/defaults/nulls/headers match contract | Stable published contract proposal and runtime outputs agree | API |
| Edge case | Invalid checksum, default-equivalent replay, concurrent create/PATCH, malformed pagination | Negative semantic fixtures catch behavior beyond schema patterns | API |
| Edge case | Inject internal repository failure | Safe 500 problem, no payload/exception exposure | API |
| Edge case | Probe default app with valid-looking synthetic auth headers and every instrument method | All instrument routes absent; health/ping remain compatible | API |
| Teardown | Close all loopback servers after checks; no deployment | No new cloud resources, dependencies, bindings or index changes | CLI |

## Tasks to do

### `1)` Verify schemas and behavioral contract

1. Add contract tests that load OpenAPI, check references/operation/security coverage
   and compare representable schema fields against shared schemas; use semantic
   fixtures for checksum, Unicode length, principal policy and retry/concurrency.
2. Use installed Zod/Vitest only. Do not write an ad-hoc general OpenAPI/JSON Schema
   validator. If no approved compatible full validator is available, report that
   validation gap explicitly rather than silently install a package or claim full validation.
3. Align contract docs with reviewed implementation details only; provider remains
   unspecified, private operation status remains unexposed. Do not broaden API scope.

### `2)` Establish diagnostic and isolation evidence

1. Add default-entrypoint absence and no-bypass assertions, reusing the existing SDK
   diagnostic tests rather than duplicating all of them. Include concurrency and
   repository-failure cases not already covered by earlier phases.
2. Run npm run check and npm run build (existing Wrangler dry-run only). Record exact
   results and limitations. No remote ping, deployment, database or plugin update.

### `3)` Document completion and next persistence gate

1. Update README and relevant architecture/codebase-map/testing memory to identify
   catalog CRUD as synthetic in-process test coverage, with diagnostic-only default
   Worker and instance-lifetime memory storage. Preserve current commands and all
   Docker/production boundaries; no hook/index synchronization is required.
2. Record local D1 adapter/migrations/SQL acceptance and auth integration as separate
   subsequent work. Do not report first-slice tests as financial, durability, recovery,
   OAuth interoperability or CPU acceptance evidence.
3. Review diff/links and runtime checks; retain existing edits and empty Git index.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | All four operations have schema/security/error evidence and semantic negative fixtures; full OpenAPI-validator status is reported accurately |
| 2 | Diagnostic regression and default-route absence tests pass; npm run check and local dry-run build pass without altered MCP toolset or public financial routes |
| 3 | Docs state tested behavior and storage/auth limitations precisely; next D1/auth gates remain open; no implementation claim extends beyond observed evidence |
| 3 | Whitespace/local links pass; no dependency/config/plugin/cloud/Git-write changes introduced |
