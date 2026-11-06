---
status: done
---

# Instruction: Containerize and validate local diagnostics

## Architecture projection

```txt
✅ Dockerfile, compose.yaml, .dockerignore
✅ scripts/smoke-mcp.mjs
✏️ README.md
✏️ aidd_docs/memory/architecture.md
✏️ aidd_docs/memory/codebase-map.md
✏️ aidd_docs/memory/testing.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Inspect Docker CLI, Compose and Engine | Availability/host limitations recorded | CLI |
| Happy path | Build, up, check, published-port SDK smoke | REST health and real MCP initialize/list/call pass | CLI/API |
| Edge case | Inspect context/mounts and node_modules | No secrets/host dependencies; Linux-native dependencies isolated | CLI |
| Hot reload | Temporarily edit a synthetic diagnostic value, observe response, restore and recheck | Published-port response follows source edit and restoration | API |
| Teardown | docker compose down | Only task containers stopped; named dependency volume retained | CLI |

## Tasks to do

### `1)` Add optional development container

1. Use pinned supported Node Debian image, npm ci, non-root process, selective bind mounts and named dependency volume.
2. Bind Wrangler to 0.0.0.0 inside; publish only 127.0.0.1:8787. Do not alter existing Worker or npm scripts.

### `2)` Validate and document

1. Run npm run check, Compose config, image build, container checks and host-port official MCP SDK smoke; report unavailable Engine honestly.
2. Document lifecycle, hot reload, dependency refresh, exclusions and future separate Python service.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Dockerfile/Compose use supported Node and isolated container node_modules, hot-reload source mounts, no remote bindings or credentials |
| 1 | Build context excludes local secrets, Git data, archives and generated output; native macOS dev unchanged |
| 2 | Existing 22 tests/typecheck pass; image builds and Worker starts when Engine available |
| 2 | REST health and real SDK initialization, tools/list and ping pass through host port 8787 |
| 2 | README includes start/stop/test commands and future Python collector guidance without active Python service |

## Validation evidence

- Docker CLI/Engine 29.2.1 and Compose 5.0.2 verified; existing Docker Desktop was initially stopped, then started by the owner. No system software installed or changed.
- Plan validator: VALID; independent read-only plan check incorporated dependency-volume refresh instructions and explicit hot-reload validation.
- Host `npm run check`: strict TypeScript and 22 tests passed. Container `npm run check`: strict TypeScript and all 22 tests passed.
- `docker compose config --quiet`: passed. `docker compose build worker`: passed on native Linux ARM64, Node 22.23.4, uid 1000.
- Initial runtime failure: Debian slim lacked system CA certificates. Added ca-certificates inside the image; rebuilt and obtained a healthy container without disabling TLS verification.
- Actual BuildKit scratch-export context inspected: exactly Dockerfile, package manifests, TypeScript/Worker config, four source files, test file and smoke script. No Git metadata, secrets, review archive, host node_modules or generated artifacts.
- Official SDK smoke passed from host through published 127.0.0.1:8787 and from container loopback: REST health, initialization, tools/list, structured ping, timestamp and stateless response.
- Hot reload passed: temporary synthetic version edit observed through host port; source restored and complete host smoke rerun successfully. No final source behavior changes.
- Runtime checks confirmed absent secret files, no resource bindings, workers_dev disabled and non-root execution. Build accessed public Docker/npm/Debian repositories; no credentials supplied, remote bindings enabled or production operations performed.
- `docker compose down`: task container/network removed; disposable node_modules volume retained. No commit, push, deployment, Cloudflare resource or sandbox change.
- Compatibility coverage is Apple Silicon/macOS with native Linux ARM64. AMD64 and other hosts are not runtime-tested. Node version tag and Debian packages remain updateable upstream artifacts, not a bit-for-bit frozen image.
