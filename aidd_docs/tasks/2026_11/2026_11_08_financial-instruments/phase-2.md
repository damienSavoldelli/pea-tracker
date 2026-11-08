---
status: done
---

# Instruction: REST adapters and isolated application composition

## Architecture projection

```txt
✅ src/adapters/rest/instruments.ts
✅ src/app.ts
✏️ src/index.ts
✅ tests/instruments.http.test.ts
✅ tests/helpers/instruments-http-server.mjs
✅ tests/helpers/instruments-http-server.d.mts
✅ scripts/dev-instruments.mjs
✅ tests/instruments.network.test.ts
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Build isolated Hono app and real 127.0.0.1 HTTP harness with fixed synthetic verifier | No token parsing/bypass; fixtures selected only server-side | API |
| Happy path | POST, list GET, item GET, PATCH active/name | 201/200 responses, schemas, Location/ETag and no-store/nosniff | API |
| Edge case | Missing dependencies or default Worker receives instrument requests | No instrument route; 404; diagnostics remain available | API |
| Edge case | Invalid principal or read-only actor attempts POST/PATCH | 401/403 before repository access/existence disclosure | API |
| Edge case | Bad JSON/query/headers/Accept/content type/body size | Documented 400/406/413/415/422/428 with safe problem response | API |
| Edge case | Duplicate create, stale/wrong If-Match, missing ID | 409/412/404, without partial mutations | API |
| Edge case | Unsupported methods including HEAD on instrument routes | Authenticated 405 and correct Allow; no inherited GET/HEAD behavior | API |
| Teardown | Close loopback servers and dispose isolated apps/fixtures | No remaining listening port, public endpoint or persisted catalog | System |

## Tasks to do

### `1)` Map HTTP requests to application capabilities

1. Implement the four proposed operations and strict parsing/error mapping in the
   new REST adapter. Reuse domain schemas/invariants; no repository/financial logic.
2. Enforce trusted authentication then operation capability before resource queries.
   Parse JSON/media type, 16 KiB body limit, query uniqueness/bounds and mutation
   headers; return sanitized problem+json. Missing Idempotency-Key is 400.
3. Emit exact create replay body/ETag/Location; require strong If-Match for PATCH.
   Explicitly handle unsupported methods, HEAD and JSON Accept behavior as documented.
4. Keep no-store/nosniff and no permissive CORS. Scope new errors/limits to instrument
   routes; do not normalize existing MCP/health error payloads.

### `2)` Introduce safe application composition

1. Move existing app composition to src/app.ts with an explicit factory. Preserve
   existing diagnostic route imports, middleware order, origin/body/error behavior
   and exact diagnostic metadata. Do not edit health.ts, mcp/handler.ts or diagnostics.ts.
2. Require both service and trusted authentication dependency to mount instrument
   routes; otherwise leave them absent. src/index.ts exports default diagnostic app.
   Never create a memory repository, synthetic identity or fallback auth in that entrypoint.
3. Test with app.request and the owner-approved loopback HTTP harness. Keep the harness
   outside src, bind only 127.0.0.1, select a fixed principal at startup, reject foreign
   Host/Origin/cross-site requests and bound request bodies. Add no auth header override,
   environment flag, public sandbox or new MCP tools. npm run dev remains diagnostic-only.
4. Provide a separate explicit launcher and real HTTP CRUD/error/retry/pagination/
   concurrency/authorization/health/MCP tests. Close every server and remove only the
   launcher's own generated bundle directory at teardown. No financial disk persistence.

### `3)` Verify the complete REST slice in isolation

1. Exercise four operations through HTTP Request/Response with real shared services
   and memory repository, including policy denials, headers/defaults/nulls and errors.
2. Run unchanged diagnostic suite against the default app. Verify all instrument
   methods are absent there and MCP still advertises only parameterless ping.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Four REST operations satisfy contract payloads/statuses/headers; adapter contains no direct storage or financial logic |
| 1 | Listed failure branches return safe problem responses; invalid/denied operations cannot create partial state or disclose records |
| 2 | Default exported Worker responds 404 to instrument operations, even if request headers attempt to assert admin identity |
| 2 | Health exact response/methods and official SDK MCP initialization/list/ping/error behavior remain compatible without modifying their implementations |
| 3 | In-process and real loopback HTTP CRUD/pagination/retry/precondition tests plus existing npm run check pass; no public service/config/dependency changes; harness stopped after validation |
