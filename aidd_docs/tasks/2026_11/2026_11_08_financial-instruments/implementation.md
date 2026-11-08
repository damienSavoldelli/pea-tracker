# Financial Instruments — implementation evidence

Completed 2026-11-08 against the owner-approved plan and real-loopback-HTTP refinement.
Plan status: implemented; phases 1–3: done. No branch/staging/commit/push, hook,
Cloudflare resource, D1 database, deployment, plugin change or real portfolio data.
Existing uncommitted architecture/product documentation was preserved and reconciled.

## Delivered behavior

- Four instrument REST operations, strict stock/ETF metadata validation, checksum-valid
  optional ISIN, explicit nullable fields and no financial calculation inputs.
- Shared application services, separate read/admin capability checks and a narrow
  repository port; no transport-owned database/calculation logic or internal HTTP.
- Per-instance in-memory repository with original create-outcome replay, canonical
  defaults, subject/operation/key scope, non-null ISIN uniqueness, version CAS,
  bounded cursor pages and defensive copies. No await splits a memory mutation.
- Sanitized problem+json errors, JSON negotiation, body/query bounds, strong ETags,
  no-store/nosniff and no permissive CORS. Unsupported authenticated methods return
  405 with Allow; anonymous requests remain 401.
- Explicit Node fixture harness at 127.0.0.1 only, fixed startup principal, no
  request-selected identity, Host/Origin/cross-site guards, timeouts and connection/body
  limits. Default principal is reader; admin is an explicit synthetic fixture choice.
- Default Worker entrypoint never constructs the fixture or repository; instrument
  routes remain absent there. Health/MCP implementation modules and toolset unchanged.
- Offline official OAS schema plus actual JSON Schema 2020-12 component/response
  validation using already installed Ajv/ajv-formats; no application package changes.
- Selective Docker copies/read-only mounts for the two contract JSON documents,
  preserving the existing container test workflow and secret/context exclusions.

## Validation results

| Check | Observed result |
| --- | --- |
| Baseline npm run check before code changes | TypeScript passed; 22 existing tests passed |
| Final host npm run check | Strict TypeScript passed; 92 tests across seven files passed |
| docker compose config --quiet | Passed |
| docker compose build worker | Passed; existing lockfile npm layer cached; no manifest/package additions |
| docker compose run --rm --no-deps worker npm run check | TypeScript and the same 92 tests passed in Linux/Node container; no host ports published |
| npm run build -- --env dev | Wrangler 4.158.0 dry-run passed, no bindings, no deployment |
| npm run build -- --env production | Wrangler 4.158.0 dry-run passed, no bindings, no deployment |
| JavaScript launcher/harness syntax | node --check passed for both .mjs files |
| Manual launcher smoke | Fixed admin fixture at 127.0.0.1:8788; curl POST returned 201, list 200, exact health 200; server stopped with Ctrl-C |
| Automated real HTTP | CRUD, negative responses, canonical replay, concurrent create/PATCH, cursor continuation, fixture denials, Host/Origin guard and official SDK MCP init/list/ping passed |
| Default-entrypoint regression | Instrument collection/item methods return 404 despite identity headers; existing 22 health/MCP tests pass |
| OpenAPI validation | Official document schema, embedded schemas, local references, operation IDs/security, representative real HTTP bodies/media/headers passed; invalid-document/response fixtures detected |
| Read-only implementation review | Corrected reader unsupported-method precedence; no remaining actionable defect reported |
| Diff checks | git diff --check passed; package/lock/Wrangler/security settings and diagnostic implementation modules unchanged; index empty |

Test inventory: service/domain 26, repository 4, in-process HTTP 14, network HTTP 7,
contract 12, default-entrypoint isolation 7, original Worker diagnostics 22.
Loopback tests initially hit sandbox `listen EPERM`; rerun with approved loopback
permission passed. Tests close their servers, standalone harness was stopped, and
the temporary Docker test container was removed. No Compose service remains running.

## Changed areas

- Runtime: src/domain/instruments.ts; src/application/{instruments,authorization,errors}.ts;
  src/ports/instruments.ts; src/adapters/{memory,rest}/instruments.ts; src/app.ts;
  src/index.ts (diagnostic-only composition).
- Local tooling: scripts/dev-instruments.mjs; tests/helpers/instruments-http-server.mjs
  and its .d.mts exported API declaration. Node type packages were not installed;
  fixture JavaScript is checked through syntax/runtime tests, with typed test boundary.
- Tests: tests/instruments.{service,repository,http,network,contract,regression}.test.ts;
  tests/helpers/{instruments,openapi}.ts.
- Contract: aidd_docs/api/openapi.json, official schema snapshot/license/validation notes.
- Container integration: .dockerignore, Dockerfile, compose.yaml (only selective
  contract JSON access, no credential or broad documentation mounts).
- Documentation: README, INSTALL, relevant memory, approved plan/contract/phase status
  and this evidence record. Approved financial product requirements remain unchanged.

## Limits and security boundaries

- Every record is synthetic. Catalog metadata proves no PEA eligibility, allocated
  ISIN, market coverage or future valuation currency support.
- Memory/replay outcomes vanish at restart, are not shared across isolates and supply
  no D1/SQL, durable uniqueness, ledger atomicity or backup/restore evidence.
- Fixture principals are not authentication: any local process can act as the
  configured role. Never tunnel/proxy/publish the harness or use real data. No real
  OAuth owner/issuer/audience checks or persistent abuse controls are implemented.
- OAuth selection, D1 and private-data gates remain open. No private financial REST
  or MCP endpoint may be publicly exposed before approved auth/security/release gates.
- Read [OpenAPI schema notes](../../../api/schemas/README.md): a narrow static-equivalent
  Ajv dynamic-anchor workaround is used for official document validation; media-range
  is an annotation. Actual component/response schemas compile independently. Semantic
  checksum/policy/concurrency requirements are tested in application workflows.
- Validation/launcher tools currently resolve locked transitive dependencies; upgrades
  must retain them or explicitly approve replacements, not download packages silently.
- Tests exercise Node HTTP, not financial routes in workerd. Dry-run bundling is not
  deployed CPU, OAuth interoperability, quotation, financial correctness or recovery evidence.
