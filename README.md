# pea-tracker
AI-ready portfolio tracking architecture leveraging Cloudflare Workers, automated market data pipelines, REST APIs, and Model Context Protocol (MCP) for seamless integration with AI agents.

## Local diagnostic proof of concept

This increment exposes public diagnostics only. It has no database, portfolio data,
market-data requests, secrets, administrative endpoints or authentication provider.
Production security requirements remain in [the architecture baseline](aidd_docs/INSTALL.md).

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
checks. `workers_dev` is disabled in configuration; a future approved public
connection test must explicitly choose and configure its HTTPS exposure.

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
