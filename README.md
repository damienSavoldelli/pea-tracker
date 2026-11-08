# pea-tracker
AI-ready portfolio tracking architecture leveraging Cloudflare Workers, automated market data pipelines, REST APIs, and Model Context Protocol (MCP) for seamless integration with AI agents.

## Initial application features

PEA Tracker is one evolving application in one repository and shared codebase.
Health and MCP ping are its first features, not a disposable server or separate
project. Portfolio management, collection and OAuth will extend this application.
The default Worker exposes public diagnostics only. A synthetic instrument catalog
is implemented through shared services, REST adapters, per-app memory storage and
a native D1 repository. Both are available only through isolated synthetic tests
and separate loopback HTTP harnesses. There is no remote D1 database, portfolio
ledger, quotation retrieval, real data or OAuth provider.
Production security requirements remain in [the architecture baseline](aidd_docs/INSTALL.md).

## Synthetic Financial Instruments REST API

The [OpenAPI contract](aidd_docs/api/openapi.json) defines create/list/get/update
operations under `/api/v1/instruments`. See the [slice contract](aidd_docs/tasks/2026_11/2026_11_08_financial-instruments/contract.md)
for metadata validation, pagination, idempotency, ETags and errors. Identity/quote
metadata is immutable in this slice; PATCH changes only name/active state.

Start the explicit local HTTP harness separately from Wrangler:

```sh
node scripts/dev-instruments.mjs --principal admin --port 8788
```

It binds only `127.0.0.1`, starts empty, fixes its synthetic principal for the
server's lifetime and rejects foreign Host/Origin/cross-site requests. Default
principal is `reader`; available fixtures are `reader`, `admin`, `collector` and
`anonymous`. There are no passwords/tokens, and Authorization/X-Role headers cannot
change the fixture. Any local process can use the selected role: this is synthetic
test tooling, not production authentication. Do not tunnel, proxy or publish it.
Use only synthetic records. Ctrl-C stops it, drops memory and removes its generated
bundle from its own `.wrangler/instruments-local-*` directory.

In another terminal, create and list a clearly synthetic record:

```sh
curl http://127.0.0.1:8788/api/v1/instruments \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: synthetic-example-a' \
  --data '{"name":"Synthetic ETF A","kind":"etf","quote_currency":"EUR","price_unit":"currency_unit"}'
curl 'http://127.0.0.1:8788/api/v1/instruments?limit=10'
```

POST returns Location and ETag headers. Item GET uses that Location; PATCH requires
the current `If-Match` ETag and accepts name/active only. Same-key/default-equivalent
POST retries return the original 201 result, even after later updates. A stale PATCH
returns 412. Memory storage and replay guarantees end when the app instance stops.

### Persistent synthetic local D1

Explicitly initialize local state, then start the D1 harness:

```sh
node node_modules/wrangler/bin/wrangler.js d1 migrations apply pea-tracker-instruments-local --config tests/fixtures/wrangler.d1-local.jsonc --env= --local --persist-to .wrangler/instruments-d1-local
node scripts/dev-instruments-d1.mjs --principal admin --port 8788
```

The fixed fixture has no database/account ID, disables remote bindings, and loads
no environment files. It does not change the root Worker configuration. Startup
requires both migrations; it never creates schema during an HTTP request. Use the
same synthetic curl examples above. The same loopback/Host/Origin guards and fixed
principals apply. Ctrl-C closes HTTP and disposes the owned local runtime; the database
under `.wrangler/instruments-d1-local/v3` is intentionally retained. Wrangler CLI
uses the parent directory with `--persist-to`; `getPlatformProxy` uses its `v3`
subdirectory. Tests verify that both access the same store.

Source migrations `0001_instruments.sql` and `0002_instrument_create_outcomes.sql`
are ordered and tracked by Wrangler. Create atomically saves the catalog row and
immutable original response snapshot; replay remains the original version even
after PATCH and process restart. PATCH uses a conditional version update followed
by a read in one batch. A zero-row update is SQL success and is classified as
missing/stale/exhausted without any dependent write. There is no outcome expiry or
cleanup policy in this slice. Local restart tests do not prove power-loss recovery,
remote durability, backups, OAuth or production readiness. Use synthetic data only.

Regenerate native D1/Worker types with the installed Wrangler (no new dependency):

```sh
node node_modules/wrangler/bin/wrangler.js types src/adapters/d1/worker-configuration.d.ts --config tests/fixtures/wrangler.d1-local.jsonc --env= --env-interface D1LocalEnv
```

Normalize trailing whitespace in the generated declarations before committing;
the pinned generator currently emits five trailing-space lines.

`npm run check` includes unit, repository, in-process HTTP, real loopback HTTP,
OpenAPI and diagnostic regression tests. It must be permitted to bind temporary
loopback ports. Tests close every server. OpenAPI checks use an offline official
schema snapshot with installed Ajv/ajv-formats; the [validation notes](aidd_docs/api/schemas/README.md)
document the narrow Ajv workaround and format limits. The launcher uses installed
esbuild. These tools currently come from the locked transitive dependency graph;
no packages were installed or added for this slice.

`src/index.ts`, `npm run dev`, Docker's Worker and both deployment environments
remain diagnostic-only: instrument requests return 404 and MCP lists only ping.
Neither fixture authentication nor either repository is wired into that entrypoint.
Real OAuth, remote persistent storage, recovery, abuse controls and private-data release
gates remain open. Node HTTP tests/dry-run bundles do not establish Workers CPU limits.

Use Node.js 22.12 or newer supported by the pinned tooling:

```sh
npm ci
npm run check
npm run build
npm run dev
```

`dev` runs Wrangler locally on `127.0.0.1:8787`. `build` creates a local dry-run
bundle; it does not deploy. No deployment script is provided. No Cloudflare login,
account, database binding or secrets are needed for this increment.

```sh
curl http://127.0.0.1:8787/api/v1/health
curl http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"local-diagnostic","version":"1.0.0"}}}'
```

The REST response is `{"status":"ok","service":"pea-tracker","version":"0.1.0"}`.
MCP supports initialization, tool discovery and invocation of `ping` with `{}` or
omitted arguments. Its `structuredContent` contains the same metadata plus a UTC
ISO timestamp; text content mirrors it for compatible clients. MCP protocol `ping`
is distinct from the registered diagnostic tool named `ping`.

### Compatibility and transport

Direct dependencies are pinned: MCP SDK 1.32.2, Hono 4.13.16, Zod 4.6.7;
development tooling: TypeScript 7.0.2, Vitest 5.1.0 and Wrangler 4.158.0.
The lockfile pins transitive packages. Vitest requires Node ^22.12, ^24 or >=26;
Wrangler requires Node >=22. Use a supported LTS meeting both constraints.
The pinned Wrangler release pulls Miniflare 5.20261104.0-beta transitively; the
local runtime smoke test passed, but upgrades should repeat both SDK and workerd
checks. Public HTTPS exposure is prepared only for the named development environment;
it becomes active only after a separately approved deployment.

Use the official SDK's Web-standard transport, not its Node HTTP wrapper. Each
request gets its own server and transport, no session identifier or persisted
connection state, and JSON responses within Streamable HTTP. Clients must advertise
both JSON and event-stream acceptance. Standalone GET event streams and DELETE
sessions are unsupported (405); notifications receive the SDK's acknowledgment.
There is no SSE resumability or server-initiated notification stream. Strict empty
tool input rejects unknown keys. Requests are capped at 64 KiB, and supplied browser
Origins must match the request URL origin; no permissive CORS is enabled.

SDK v1 is intentionally pinned to its available maintained release; v2 examples use
different package/import paths and must not be copied without a compatibility review.
Sources: [official SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x),
[Web-standard transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/webStandardStreamableHttp.ts).

### Future ChatGPT connectivity test

Requires separate approval for any cloud resources or deployment, a reachable HTTPS
MCP URL, verified connector access in the actual ChatGPT account, and a supported
client protocol version. localhost is not a publicly reachable endpoint. A synthetic
unauthenticated diagnostic test does not choose OAuth or permit private-data access.
Evaluate Workers OAuth Provider versus Auth0 for interoperability, security,
maintenance and cost before selection. Complete private-data gates before introducing
real financial information. Local tests do not establish Workers Free CPU performance
or successful ChatGPT connectivity.

## Local OAuth verification

The explicit `createProtectedApp(verifier, instrumentService)` composition validates
RS256 access JWTs with trusted issuer/JWKS, exact resource audience, owner/client
allowlists and delegated scope ceilings. REST read/admin, MCP reads and collector
policy are separate. Financial MCP offers only list/get instrument reads and calls
the same services as REST. The default deployed entrypoint still uses `createApp()`
without these dependencies, so public health/ping behavior remains unchanged.

`npm run check` runs the original instrument/D1/diagnostic tests plus signed-token
policy, JWT/JWKS, real loopback HTTP, MCP and native workerd tests. Fixtures generate
synthetic keys in process, close their servers and load no real Auth0 credentials.
The guarded Node HTTP fixture binds only 127.0.0.1; the test-only Worker manifest
also binds loopback and has no remote bindings. Do not deploy or tunnel these fixtures.
No dependencies were installed: the already locked jose 6.2.15 is now a direct pin.

See [local OAuth evidence](aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/local-implementation.md)
for policy, verification limits and remaining hosted-provider gates. This increment
does not implement an authorization server, immediate JWT revocation, real collector
ingestion or live ChatGPT/Claude OAuth linking.

The separate `src/entrypoints/oauth-poc.ts` prepares genuine Auth0 verification over
synthetic Memory data. Its closed Wrangler template is not a deployment approval;
see [phase-3 setup and evidence](aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/interop-evidence.md)
for required tenant settings, separate-host approval and hosted-client test gates.

## Cloudflare development and production environments

One `wrangler.jsonc` defines both deployments of the same application. Shared source,
entrypoint and compatibility settings stay at the top level; no parallel ping project
or copied application is created. Prefer named environments over separate config files
or ad hoc name overrides, which would make configuration drift easier.

| Selection | Worker name | Public workers.dev endpoint |
| --- | --- | --- |
| Default local commands | pea-tracker-dev | Disabled by default |
| `--env dev` | pea-tracker-dev | Prepared for an approved development deployment |
| `--env production` | pea-tracker | Disabled pending production readiness/exposure decision |

Explicit names avoid Wrangler's automatic environment-name suffix. The default name
matches development, so it does not introduce a third intended deployment or implicitly
target production. Local `npm run dev` and Docker remain local and unchanged.
Use explicit `--env dev` or `--env production` for every future remote operation;
do not use a bare deployment command.

Local preparation commands only (no deployment or provisioning):

```sh
npm run check
npm run build -- --env dev
npm run build -- --env production
```

`build` always includes `--dry-run`. No deployment script or CI deployment is added.
For a later explicitly approved development deployment, the target command will be
`npm exec -- wrangler deploy --env dev`; it has not been run. Account/subdomain,
permissions, public diagnostic exposure and applicable readiness checks must be
confirmed first. Preview URLs are disabled. Production requires its own approval
and exposure configuration; workers_dev=false alone is not a deployment prohibition.

Future D1/KV bindings, non-secret variables and secrets must be configured explicitly
per environment with distinct development/production resources; never share private
production data with development. Do not add placeholder resource IDs that could
trigger provisioning. Both environments currently have no resource bindings or secrets.
Development naming does not relax private-data security gates. OAuth selection remains
open, and the current diagnostic responses/service identity remain `pea-tracker`.
See [Cloudflare environments and inheritance](https://developers.cloudflare.com/workers/wrangler/environments/).

## Optional Docker development

Production remains Cloudflare Workers and GitHub Actions. Docker is for local
development/testing only; native macOS `npm run dev` remains unchanged. Use an
existing Docker Engine and Compose installation; no Cloudflare login is required.

```sh
docker version
docker compose version
docker compose up --build --detach --wait
docker compose logs --tail=50 worker
curl http://127.0.0.1:8787/api/v1/health
docker compose exec worker npm run check
docker compose exec worker node scripts/smoke-mcp.mjs
docker compose down
```

To test real MCP initialization, discovery and ping through the container's published
host port, run `node scripts/smoke-mcp.mjs` on the host (requires the existing local
`npm ci` installation). The `exec` variant above tests the container's own loopback.
Both use the official MCP client and verify structured diagnostics, not custom JSON
substitutes. Stop any native Wrangler process before starting Compose: both use 8787.

The image pins `node:22.23.4-bookworm-slim`, compatible with the existing tooling,
and installs the lockfile with `npm ci`. Debian/glibc avoids Alpine/musl differences
for Wrangler/workerd native binaries. The image installs Debian `ca-certificates`,
required for workerd startup even when the diagnostic Worker makes no external calls;
TLS verification is not disabled. No platform override is forced: use native Linux
ARM64 on Apple Silicon or AMD64 on Intel. This version tag is not an immutable
image digest; Docker resolves it at build time. No host node_modules are copied.
Sources: [official Node image](https://hub.docker.com/_/node),
[Docker volume initialization](https://docs.docker.com/engine/storage/volumes/).

Wrangler runs as the non-root `node` user with `--local --ip 0.0.0.0 --port 8787`;
the host port is bound to `127.0.0.1`. Source, tests and smoke scripts are read-only
bind mounts, allowing editor changes and Wrangler rebuilds without exposing the
repository root. The named `worker_node_modules` volume is populated from the image
on first use and separates Linux dependencies from macOS dependencies. Docker-managed
volumes survive `docker compose down`.

After changing package manifests/lockfile, TypeScript configuration or Wrangler
configuration, rebuild and recreate the development volume:

```sh
docker compose down --volumes
docker compose up --build --detach --wait
```

`--volumes` deletes this Compose project's disposable dependency volume; do not use
it for future persistent application data. Ordinary source edits need no rebuild.
If Docker Desktop file events fail to trigger reload, restart the Worker with
`docker compose restart worker`; file watching must be checked on the actual host.

Contract tests receive the allowlisted synthetic OpenAPI/schema JSON files and two
exact source SQL migrations through image copies and read-only Compose file mounts;
SQLite files, dumps and local D1 state remain excluded. Other AIDD docs stay outside
the image/runtime mounts. The local instrument harness is not started by Compose.

The allowlisted `.dockerignore` excludes Git/assistant metadata, `.env*`, `.dev.vars*`,
private archives, keys, SQL dumps, node_modules, dist, coverage and Wrangler state.
Even safe `.env.example` files are excluded from images. Selective runtime mounts
also exclude root secret files: `.dockerignore` alone does not protect bind mounts.
Do not add secrets to source/test/script directories. No Docker socket, host home,
Cloudflare credentials, env_file or remote bindings are mounted/configured. Wrangler
telemetry is disabled. Builds download public images and npm dependencies; this is
not an offline or network-isolated environment. Never pass Cloudflare credentials
or enable remote mode for this diagnostic service.

### Future Python collector

Add a separately scoped Python image/service only when implementing the collector,
with its own pinned dependencies, pytest command and isolated mounts. It could call
the Worker over the Compose service network, without exposing another host port.
Use synthetic fixtures first; financial data and authentication still require their
production gates. No Python/yfinance service is active in this Compose environment.
