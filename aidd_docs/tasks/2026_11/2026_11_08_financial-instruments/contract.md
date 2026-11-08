# Financial Instruments REST API — first-slice contract

Status: approved and implemented for synthetic local use, 2026-11-08. Owner refinement
authorizes real loopback HTTP tests; no public financial routes or real-data release.
Product source: [approved PRD](../2026_11_08-financial-backend-prd.md).
Architecture: [INSTALL.md](../../../INSTALL.md).
Machine-readable contract: [OpenAPI](../../../api/openapi.json).
Implementation plan: [plan.md](plan.md).

## Local D1 implementation addendum — 2026-11-08

The subsequently approved [D1 increment](../2026_11_08_d1-instruments/plan.md)
extends persistence only; operation schemas, statuses, auth policies and repository
signatures remain unchanged. The original memory-only choice below records the
first increment's boundary. Both Memory and native D1 now run the same repository
and real loopback HTTP acceptance suites. The default Worker still mounts neither.

D1 uses versioned local-only migrations, atomic row + original outcome creation,
immutable v1 replay snapshots and batched conditional UPDATE + SELECT. Zero-row
updates are SQL success; missing/stale/exhausted errors are classified from the
captured transaction read without dependent writes. Replay/version state survives
tested local process restarts. No outcome TTL, remote D1, OAuth, production CPU,
power-loss or backup recovery claim is added. See the D1 implementation record and
root README for initialization, persistence paths, limitations and evidence.

## Boundary and supported behavior

One synthetic instrument catalog, stock/ETF records, no owner/tenant dimension.
No holdings, PRU, prices, cash, ledger, performance, dividend or corporate-action
calculations. Instrument metadata does not assert PEA eligibility, actual listing,
quotation availability or supported future valuation currency. No collector or
financial MCP tools are added. Both REST and future MCP use the same services;
there is no internal HTTP client or repository logic in a transport handler.

| Method/path | Result | Policy |
| --- | --- | --- |
| `GET /api/v1/instruments` | 200 paginated catalog, including inactive records unless filtered | Instrument read capability |
| `POST /api/v1/instruments` | 201 created instrument, Location, ETag; idempotent replay returns original outcome | Separate administrative capability |
| `GET /api/v1/instruments/{id}` | 200 record and ETag; 404 missing | Instrument read capability |
| `PATCH /api/v1/instruments/{id}` | 200 updated name/active state and ETag; optimistic concurrency | Separate administrative capability |

No hard DELETE: deactivate using PATCH. Provider mapping or financial identity
revisions are deliberately deferred; PATCH rejects those fields rather than silently
rewriting history. The earlier broad API proposal is narrowed for this slice.

## Fields and validation

| Field | Create | Output / validation |
| --- | --- | --- |
| `id` | Forbidden | Server-generated UUID v4; canonical lowercase; stable opaque identity |
| `name` | Required | String 1–160 Unicode code points; no leading/trailing whitespace or control characters |
| `kind` | Required | `stock` or `etf`; no PEA-eligibility inference |
| `isin` | Optional, defaults null | Null or uppercase 12-character ISIN shape plus modulus-10 checksum; unique when non-null, including inactive records |
| `quote_currency` | Required | Exactly three uppercase ASCII letters; code syntax only, no registry/provider/FX validation in this slice |
| `price_unit` | Required | `currency_unit` or `hundredth_currency_unit`; metadata only, no conversion arithmetic |
| `exchange_mic` | Optional, defaults null | Null or four uppercase ASCII letters/digits; syntax only, no MIC registry lookup |
| `provider_symbol` | Optional, defaults null | Null or 1–64 ASCII characters from letters/digits and `. ^ = : _ -`; case-sensitive yfinance reference metadata, no remote lookup |
| `active` | Optional, defaults true | Strict JSON boolean; PATCH may change it |
| `version` | Forbidden | Positive safe JSON integer, begins at 1; increments once per successful PATCH, even if value is unchanged |
| `created_at`, `updated_at` | Forbidden | Server-generated UTC RFC 3339 timestamps; immutable creation time, update on successful PATCH |

All response fields are present, with explicit nulls where listed. Create and PATCH
reject unknown fields; PATCH accepts only name and/or active and must contain at
least one. Codes are rejected when incorrectly cased or padded; no silent coercion.
No numeric financial inputs are accepted. ISIN validation checks syntax/checksum,
not allocation/existence; special prefixes are not rejected by a country allowlist.
Records without an ISIN are identified solely by ID; do not treat ticker or name as
unique identity. Reusing a known non-null ISIN returns 409, regardless of ticker.

Only one quote reference per record initially; this is an instrument at the declared
quote reference, not a generalized multi-listing model. Requiring a second listing
for an existing ISIN triggers a later contract decision rather than duplicate identity.

## Queries, mutation headers and errors

- List: `limit` default 50, range 1–100; optional `active=true|false`; optional opaque
  cursor maximum 256 characters. Unknown/repeated parameters, invalid integers,
  malformed cursors and cursor/filter mismatches return 400.
- Sort by canonical ID ascending, cursor-based continuation. Cursor payload is a
  versioned base64url encoding of last ID and active filter, validated strictly.
  It is unsigned and not tamper-evident: a well-formed edited last ID can select a
  different continuation point. It is not a credential; callers treat it as opaque.
  Reject malformed/noncanonical payloads, not arbitrary valid edits. Pages are not a snapshot:
  concurrent creates/activation changes may alter later pages. No total-count scan.
- Response list: `{data: Instrument[], page: {next_cursor: string|null}}`.
- Create: required `Idempotency-Key`, 1–128 characters from letters/digits/`_`/`-`.
  Scope by verified subject, operation and key. Compare canonical validated input
  after applying defaults; same input returns original 201 body/ETag/Location,
  different input returns 409. Store outcome atomically with the record. Invalid
  input reserves no key. Same-process concurrent calls create at most one record.
- PATCH: required `If-Match` with a strong ETag such as `"1"`; missing header 428,
  malformed/wildcard/weak/multiple tags 400, stale version 412, missing record 404.
  Compare-and-swap is atomic. PATCH is not automatically replayed: a retry with the
  old tag returns 412; retrieve current state before deciding to resubmit.
- Body limit: 16 KiB on instrument mutation routes only; malformed JSON 400,
  schema/domain invalidity 422, unsupported media type 415, oversized body 413.
  JSON request bodies only; Accept permitting application/json or wildcards is
  supported, explicit incompatible Accept returns 406. Errors use problem+json.
- Service conflicts: duplicate ISIN or reused key with changed input 409. Known
  resource missing 404. Exhausted safe-integer version returns 409 rather than
  overflowing. Unsupported authenticated methods return 405 with Allow before
  operation capability selection; anonymous requests remain 401.
- Missing/invalid authentication 401 with Bearer challenge; insufficient capability
  403. Check authorization before resource access or duplicate/existence disclosure.
  The first slice tests these policies with synthetic verifiers only, not real tokens.
- Problem response: type, title, status, code, request_id; optional field_paths only.
  No raw input values, record payloads, tokens or repository exception details in errors/logs.
  Internal failures return sanitized 500. Do not claim persistent rate limiting is
  delivered; it remains required before protected remote exposure.
- Successful and error instrument responses use no-store, nosniff, no permissive
  CORS. These conventions apply to the new routes, not a rewrite of health/MCP errors.

## Shared services and safe composition

Implemented files and responsibilities:

- `src/domain/instruments.ts`: transport-independent types and invariant validation
  with the installed Zod version; ISIN checksum, canonical metadata, immutable fields.
- `src/ports/instruments.ts`: narrow repository interface: get, bounded list,
  atomic create with idempotency outcome, versioned update. No generic ORM/repository.
- `src/application/instruments.ts`: list/get/create/update capabilities, service-level
  authorization, injected repository, clock and ID generator. Do not depend on Hono,
  MCP or SQL. Return DTOs and typed application errors.
- `src/application/authorization.ts`: verified-principal capability checks; instrument
  read and admin are distinct permissions. A future trusted adapter maps owner REST
  read/MCP read/admin scopes to these permissions. MCP/collector contexts never gain
  write capability implicitly. This is policy enforcement, not token verification.
- `src/adapters/memory/instruments.ts`: request-independent per-app storage, copy-in/
  copy-out, deterministic bounded ordering, uniqueness, atomic replay and version checks.
- `src/adapters/rest/instruments.ts`: HTTP parsing, bounded bodies, authentication
  hook, request/output mapping and error serialization. Calls application services.
- `src/app.ts`: app factory, retaining diagnostic routes/middleware; mounts instruments
  only when both a service and a trusted authentication function are explicitly
  provided by server-side composition. Missing dependencies mean no instrument routes.
- `src/index.ts`: default diagnostic-only application from that factory. No default
  in-memory financial service, test principal, dev-auth flag or header-based bypass.

Instrument endpoints are exercised through Hono Request/Response and real HTTP.
The separate `scripts/dev-instruments.mjs` launcher bundles the test-only Node harness
and binds only 127.0.0.1 (port 8788 by default). Tests use ephemeral ports. Principal
is fixed at server startup (`reader` by default; `admin`, `collector`, `anonymous`
also available); user headers cannot select identity or grant capabilities. The
harness rejects foreign Host/Origin/cross-site requests, caps body size/connections,
sets request timeouts, and emits no request payload logs. It closes on Ctrl-C, removes
its own generated bundle directory and discards memory. It is outside the Worker
deployment source and must never be tunneled, proxied, published or used with real data.
Any local process can use the selected synthetic role; these fixtures are not OAuth.
`npm run dev` continues to run the diagnostic-only Worker.

The default entrypoint must return 404 for all proposed instrument operations and
leave `/mcp` discovery limited to ping, even after synthetic CRUD passes in tests.
Actual provider selection, token checks, owner/audience restrictions and abuse
controls remain prerequisites to mounting protected routes publicly. No public
financial REST or MCP endpoint is introduced by this slice.

## Persistence assessment and recommendation

| Criterion | In-memory repository | Local D1 |
| --- | --- | --- |
| Setup | Uses existing TypeScript/Vitest, no bindings/dependencies | Needs local bindings/configuration, migrations and Workers-runtime testing |
| REST/service contract evidence | Good fit for isolated catalog and policy behavior | Same contract plus actual SQL constraints/query behavior |
| Restart behavior | All records, cursors' underlying state and replay outcomes lost | Local persisted state can survive development restarts |
| Atomicity evidence | Only per-instance in-process implementation | Can verify SQL uniqueness, conditional updates and multi-write transactions |
| Cost/resources | No cloud resources | Can run locally; no remote provisioning is inherent, but setup still needs approval |
| Risk | Must never be presented as durable or shared across isolates | More configuration/test-tool compatibility work before catalog contract is settled |

Implemented choice: in-memory now, as a synthetic acceptance adapter, not
production persistence or a replacement for the approved D1 direction. Create the
repository interface and acceptance cases so local D1 can implement them in a later
dedicated increment. Do not add a fake remote database ID, D1 binding, migration,
Wrangler config, new dependency or database now. No module-global production Map.

Memory repository guarantees end at the app instance lifetime. It cannot establish
distributed uniqueness, durable idempotency, restore safety or ledger atomicity.
Before real data or durable catalog delivery, add the local D1 adapter, migration
tests and verified transactional persistence; remote D1 still requires separate approval.

Proposed later D1 layout: instruments table keyed by opaque ID; nullable unique ISIN;
TEXT metadata/timestamps, bounded integer version/active flag; index for active plus
ID pagination. Separate idempotency outcomes keyed by subject/operation/key with
canonical input and original response. Insert record and replay result atomically;
conditional update checks version. SQL never belongs in REST/MCP/services. Mapping
revision history is needed before editing quote identity in a later slice. No SQL
or D1 migration is authored in this planning task.

## Automated evidence required during implementation

| Layer | Required scenarios |
| --- | --- |
| Domain | Valid stock/ETF; optional null fields; ISIN shape/checksum; Unicode name bounds; code casing; invalid kinds/codes/units; unknown/server-owned fields; no financial fields accepted |
| Repository/service | Create/get/list/update/deactivate; non-null ISIN uniqueness including inactive; multiple null ISINs; separate app isolation; returned objects cannot mutate storage |
| Retries/concurrency | Same-key same-input and canonical defaults replay exact outcome; changed input conflict; failed validation reserves no key; concurrent duplicate create has one success outcome; concurrent PATCH with one tag has one winner |
| Pagination | Empty/final/multiple pages; stable ID order; active filter binding; malformed/noncanonical/oversized payloads, repeats and filter mismatches rejected; limit bounds; page results cannot exceed requested size |
| Policy | Missing/invalid principal, denied read/admin, collector denied, MCP read cannot write; denied operations perform no repository calls; no header-selected test identity |
| HTTP | All four operations; status/body/headers; 400/401/403/404/405/406/409/412/413/415/422/428/500 branches; safe errors/no-store; defaults/null serialization; immutable-field rejection |
| Contract | Exercise operation responses against shared schemas; compare schema structure to OpenAPI and validate explicit semantics with negative fixtures; require full OpenAPI validation when an approved compatible validator is available |
| Regression | Existing health exact metadata/methods and MCP SDK initialization/list/ping/error/body/origin tests pass; default app never mounts instruments |

Use installed Vitest/Zod and installed transitive Ajv/ajv-formats with an offline
official OAS schema snapshot. No dependency was installed or changed. Request/response
contract tests cannot prove Workers-runtime CPU, OAuth interoperability, D1 SQL or
recovery. The [schema validation notes](../../../api/schemas/README.md) describe
the narrow Ajv workaround, actual JSON Schema checks and format limitation.

## Review choices and sources

The owner approved the four-operation scope, restricted PATCH, metadata, memory
repository and isolated composition, then refined acceptance to require real loopback
HTTP. Implementation/tests are authorized for this slice only. New dependencies,
D1/cloud resources, deployment/plugin changes, real financial data, staging, commits
and pushes remain outside authorization.

Official sources checked 2026-11-08:

- [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html): JSON/YAML descriptions, paths, schemas, responses and security declarations. This draft deliberately uses JSON for dependency-free parsing and is not a latest-version claim.
- [ANNA identifiers](https://anna-web.org/identifiers/): ISIN length/structure and modulus-10 check digit; validation does not verify allocation or eligibility.
- [Cloudflare D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/): local-only D1 runtime/state is possible; not exercised or configured here.
- [Cloudflare Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/): Workers runtime integration exists; compatibility with the pinned Vitest 5.1.0 is not established and no package is added.
