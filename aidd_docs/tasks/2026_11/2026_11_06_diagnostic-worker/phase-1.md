---
status: done
---

# Instruction: Implement and validate diagnostic Worker

## Architecture projection

```txt
✅ package.json, package-lock.json, tsconfig.json, wrangler.jsonc
✅ src/index.ts, src/diagnostics.ts
✅ src/adapters/rest/health.ts, src/adapters/mcp/handler.ts
✅ tests/worker.test.ts
✏️ README.md, AGENTS.md, aidd_docs/INSTALL.md
✏️ aidd_docs/memory/{architecture,project-brief,codebase-map,coding-assertions,testing}.md
✏️ .gitignore
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Install pinned packages and typecheck | Strict compilation passes | CLI |
| Happy path | GET health; initialize MCP; list/call ping | Exact health, SDK negotiation and structured diagnostics | API |
| Edge case | Unknown tool, invalid arguments/JSON, unsupported methods/origin | Protocol errors or safe bounded HTTP rejection | API |
| Teardown | Close clients and stop local Wrangler | No running local service left behind | CLI |

## Tasks to do

### `1)` Implement diagnostic adapters

1. Create strict TypeScript tooling, Hono routing, Vitest tests and a fresh SDK server/transport for each request.
2. Register only ping with an empty strict schema; separate REST and MCP routing.

### `2)` Validate behavior and refresh context

1. Test SDK client negotiation plus raw invalid requests, typecheck and local dry-run bundle.
2. Smoke-test Wrangler locally and record exact versions, constraints and future ChatGPT prerequisites.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | GET /api/v1/health returns status ok, service pea-tracker, version 0.1.0 |
| 1 | /mcp uses official Streamable HTTP with initialization, tools/list and tools/call ping |
| 1 | Ping has no parameters; structuredContent contains status ok, service pea-tracker, version 0.1.0 and valid UTC ISO timestamp; no REST delegation or private data |
| 2 | Automated tests cover unknown tools, invalid inputs/methods and stateless request independence |
| 2 | Typecheck, tests, dry-run bundle and local Worker smoke test pass without remote resources |
| 2 | Documentation cleanup verified; local commands and compatibility constraints documented; no staging or deployments |

## Validation evidence

- `npm run check`: strict TypeScript passed; 22 Vitest tests passed.
- `npm run build`: Wrangler local dry-run bundle passed, no bindings, no deployment.
- Local Wrangler/workerd smoke: exact REST health, official client initialization, tools/list, tools/call ping, UTC timestamp and absent session identifier passed; server stopped afterward.
- `npm install`: 167 packages installed; audit reported zero vulnerabilities at installation time.
- Existing cleanup confirmed: no guideline/contribution placeholders; explicit Codex reads; Claude imports/markers retained; VCS conventions and automatic-hook staging warning present.
- Independent plan review requested explicit Hono/Vitest and structuredContent assertions; both incorporated.
- Network install, Wrangler preferences access and loopback smoke required sandbox escalation approvals. Codex configuration was not changed; no hooks were invoked.
- No deployed CPU benchmark, OAuth interoperability, private-data validation or actual ChatGPT connection was performed.
