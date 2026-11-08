# Financial backend — design proposal

Status: technical design proposal, initially 2026-11-06, reconciled 2026-11-08.
The [financial backend PRD](../2026_11_08-financial-backend-prd.md) is now the approved
product baseline. Technical resources/roadmap remain proposed where not refined by
the [Financial Instruments slice](../2026_11_08_financial-instruments/plan.md) and its
[OpenAPI contract](../../../api/openapi.json). The owner subsequently authorized and
implemented that synthetic instrument-only slice with real loopback HTTP fixtures;
this broader roadmap does not authorize the remaining financial features or release.

Authority: [INSTALL.md](../../../INSTALL.md), the owner's next-phase request and
[AGENTS.md](../../../../AGENTS.md). All examples are synthetic. No private financial
values, credentials, tokens or actual instrument watchlists belong in these documents.

## Evidence and scope

- Initial inspection: `git status --short`, `git diff`, `git diff --cached` and
  `git diff --check` were empty. There were no uncommitted or staged changes to
  reconcile. AGENTS.md already contains the Cloudflare credential/security rules;
  preserve it without edits. No hooks, staging, commits or pushes are authorized.
- Implemented: REST health, stateless official-SDK MCP ping, optional local Docker.
  The earlier connected ping returned `ok` / `pea-tracker` / `0.1.0` at
  `2026-11-06T22:25:54.342Z`. No new remote operation is part of this proposal.
- Not implemented: portfolio services, persistence, financial calculations, collector,
  authentication or CI. Proposed endpoints/tools below do not exist yet.
- One owner, one PEA, initially about 20 stock/ETF instruments. Use one singleton
  `/portfolio`; no owner/tenant/account-management API or multi-portfolio framework.
- Progressive financial scope after the initial instrument-only slice: explicitly dated opening state, purchases,
  sales, fees, deposits/withdrawals, positions/cash, quotations and valuation.
  Historical returns follow after methodology and sufficient history are approved.
  CSV convenience, benchmarks, advanced corporate actions and FX conversion can wait;
  unsupported cases must be disclosed and block misleading results.

## Service boundaries

REST `/api/v1` and MCP `/mcp` map requests to the same application capabilities.
Shared read services own position, valuation, allocation, freshness and history
semantics; command services own authorized instrument/ledger/ingestion operations.
Domain calculations have no transport or SQL dependency. Repositories own D1 queries.
Adapters own transport validation, serialization and error mapping; entry points also
enforce verified principal, ownership and operation policies.

Use stable DTOs with decimal strings, timestamps, provenance and coverage. MCP tools
may compose bounded read capabilities directly, without HTTP calls into REST.
A future independent MCP deployment could replace direct capability access with an
HTTP API client. It must obtain a token for that API audience; never forward an MCP
token indiscriminately. Build this client only if extraction becomes necessary.

## Proposed REST resources

All paths below have prefix `/api/v1`. Names and fields await contract review.
R = owner-authorized `portfolio:read`; A = separately authorized administrative
client with `portfolio:admin`; I = instrument-restricted `quotes:ingest` collector.
An admin grant does not imply read or ingestion grants; grant only needed scopes.

| Resource and methods | Capability / proposed representation | Policy | Delivery |
| --- | --- | --- | --- |
| `GET /health` | Existing public diagnostic, unchanged | Public | Existing |
| `GET /instruments`, `GET /instruments/{id}` | Stable ID, ISIN where known, name, type, provider symbol, exchange/calendar, currency, price unit, active state | R | First slice |
| `POST /instruments`, `PATCH /instruments/{id}` | Register/update metadata; identity conflicts rejected, historical mappings versioned | A | First slice |
| `GET /portfolio` | Single portfolio metadata, reporting currency, opening date, supported coverage | R | First slice |
| `GET /portfolio/opening-state`, `POST /portfolio/opening-state` | Dated initial quantities, authoritative cost basis and cash with provenance; creates opening ledger events and returns their IDs; later corrections use the transaction correction capability | R / A | First slice, after opening rules |
| `GET /transactions`, `GET /transactions/{id}` | Effective/recorded times, typed event, instrument if applicable, quantity, posted cash, currency, fees, provenance, correction links | R | First slice |
| `POST /transactions` | Append validated purchase, sale or cash event; related cash/ledger effects atomic | A | First slice, after accounting rules |
| `POST /transactions/{id}/corrections` | Append reversal/replacement referencing original; never silent financial PATCH/DELETE | A | First slice |
| `GET /portfolio/positions` | Derived quantity, cost basis, PRU and calculation/coverage metadata per instrument; no independent mutable position store | R | First slice |
| `GET /portfolio/cash` | Derived balances by supported currency, reconciled to recorded movements | R | First slice |
| `GET /quotations` | Filter by instrument and bounded interval; explicit latest/history mode, market/fetch times, source, currency/unit and adjustment policy | R | First slice |
| `GET /quotation-status` | Per-instrument successful quote age, expected session, last attempt, failure and freshness reason | R | First slice |
| `POST /quotation-batches` | Bounded idempotent observations and collection outcomes for allowlisted instruments; returns accepted/rejected status | I | Collection slice |
| `GET /portfolio/valuation` | Positions plus cash, valuation inputs/time, missing coverage, unrounded calculation provenance and declared output rounding | R | Valuation slice |
| `GET /portfolio/allocation` | Weights with explicit denominator, cash inclusion, missing values and classification | R | Valuation slice |
| `GET /portfolio/performance` | Bounded period, approved methodology/version, cash-flow treatment, completeness and unavailable reasons | R | History slice |
| `GET /portfolio/snapshots` | Bounded valuation history, input/calc revision and coverage; no fabricated past observations | R | History slice |

Do not embed holdings into public health or discovery metadata. The collector learns
its non-portfolio instrument configuration through a separately scoped allowlist,
not by reading the owner's positions. Operational ingestion responses contain only
the collector's own bounded submission results, never portfolio state.

Owner export and deletion remain mandatory before real data. Design separately
authorized administration operations in the release milestone, including backup
expiry and deletion replay; they are not MCP tools. Do not implement a generic
bulk export/delete API in the first synthetic slice.

### Contract conventions proposed for review

- Opaque stable IDs; ISIN is metadata with format/checksum validation, not a database
  primary key. Provider ticker alone is not an instrument identity. Currency/unit
  support must be explicit; never assume every stock/ETF is EUR quoted.
- Decimal strings only for financial quantities, prices, cash, ratios and percentages.
  Requests reject unknown fields, invalid signs/scale and ambiguous locale notation.
  Counts/page limits may be JSON integers. Money pairs amount with currency; quotes
  also carry price unit. Do not coerce missing/null amounts to zero.
- Timestamps are RFC 3339 UTC. Distinguish effective_at, recorded_at,
  market_timestamp, fetched_at and valuation as_of. Exchange calendar/time zone
  determines session/freshness. Exact trade/settlement interpretation is open.
- Lists use an opaque cursor, stable ordering with ID tie-breaker, default limit 50,
  maximum 100; time-series queries require bounded dates (proposed max 366 days)
  and pagination. These numbers are proposals to validate against CPU/query budgets.
  The first slice does not promise arbitrary historical as_of queries.
- POST commands require an Idempotency-Key: replay of the same principal/operation
  and payload returns the original outcome; a different payload returns 409.
  Financial/ingestion uniqueness must outlive any transport retry-cache TTL.
  Final key retention and transaction external-reference rules await specification.
- Administrative metadata PATCH requires an expected version/If-Match; stale writes
  return 412. Posted ledger events use appended corrections rather than overwrite.
- Proposed ingestion behavior: validate the whole bounded batch, commit atomically,
  reject an invalid batch without partial writes; valid fetch-failure outcomes can
  be recorded without replacing the last usable quote or advancing its timestamp.
  Batch size/bytes and quote identity/revision rules must be fixed before coding.
- Consistent errors use `application/problem+json`: type, title, status, safe code,
  request_id and field paths without echoing financial payloads or credentials.
  Document 400 malformed request, 401 missing/invalid authentication, 403 denied
  operation, 404 missing resource, 409 conflict, 412 stale version, 413 oversized
  body, 422 invalid financial input, 429 throttled and sanitized 5xx responses.
- An incomplete valuation returns explicit partial/unavailable coverage and reasons;
  never a complete-looking total. A stale last usable quote stays labeled stale.
  Financial responses use no-store and are not exposed through permissive CORS.
- Preserve existing health response and MCP ping exactly. `/api/v1` is the API
  major version; document additive evolution and reserve breaking changes for v2.

## Proposed OpenAPI contract structure

Use OpenAPI 3.1.1 as a conservative proposal, subject to validator/tool compatibility
review; it is not a claim to use the latest release. The first-slice proposal now uses
`aidd_docs/api/openapi.json` for dependency-free JSON parsing. Split with local `$ref` files
only when size warrants it. No generator, Swagger runtime UI or dependency is required
by this proposal. A published contract must distinguish available and planned features.

```yaml
# Illustrative structure only; not a complete deployable financial contract.
openapi: 3.1.1
info:
  title: PEA Tracker API
  version: 0.1.0
servers:
  - url: /api/v1
paths:
  /health:
    get:
      operationId: getHealth
      security: []
      responses:
        '200':
          description: Existing public diagnostic
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Health'
components:
  schemas:
    Health:
      type: object
      additionalProperties: false
      required: [status, service, version]
      properties:
        status: {const: ok}
        service: {const: pea-tracker}
        version: {const: 0.1.0}
    Decimal:
      type: string
      pattern: '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'
      description: Plain decimal; per-field scale, sign and precision rules also apply.
```

Before implementation, add each approved path's stable operationId, request/response
schemas, parameters, examples, error responses and security requirements. Components:
Instrument, Portfolio, OpeningState, typed TransactionInput/Transaction,
CorrectionInput, Position, CashBalance, Quotation, QuotationBatch/Result,
Freshness, Valuation, Allocation, Performance, Snapshot, Coverage, Money,
CalculationMetadata, PageInfo and Problem. Use oneOf with discriminators for event
types; declare units, nullable meaning, output scales and required provenance.
Decimal patterns alone cannot enforce the complete arithmetic contract.

Security schemes will describe the chosen OAuth flows/discovery and collector
credential after evaluation. Do not invent issuer URLs or placeholder secrets. Every
private operation must explicitly require its policy; an OpenAPI bearer scheme alone
does not enforce scopes, owner or audience. If bearer rather than OAuth schemas are
used, retain required-scope documentation and executable policy tests separately.
`/mcp` remains a separate protocol endpoint, not a REST resource described as CRUD.

## Future MCP capability map

All financial tools below are proposals, bounded and read-only. They are added only
after the corresponding REST/service contracts and authorization tests are approved.
Tools call shared services directly, never the REST handler or D1.

| MCP tool | Shared capability | Corresponding REST read |
| --- | --- | --- |
| `ping` | Existing public diagnostics | Existing `/api/v1/health` (same metadata; ping also has timestamp) |
| `list_instruments` | Instrument catalog | `GET /api/v1/instruments` |
| `get_positions` | Portfolio positions | `GET /api/v1/portfolio/positions` |
| `get_cash` | Cash balance | `GET /api/v1/portfolio/cash` |
| `list_transactions` | Bounded ledger history | `GET /api/v1/transactions` |
| `get_quotations` | Latest/bounded quotation history | `GET /api/v1/quotations` |
| `get_quotation_status` | Market-aware freshness | `GET /api/v1/quotation-status` |
| `get_portfolio_valuation` | Valuation and unrealized result | `GET /api/v1/portfolio/valuation` |
| `get_allocation` | Allocation | `GET /api/v1/portfolio/allocation` |
| `get_performance` | Methodology-aware historical return | `GET /api/v1/portfolio/performance` |
| `get_snapshots` | Valuation history | `GET /api/v1/portfolio/snapshots` |

The table maps capabilities, not automatic one-tool-per-route generation. Start with
positions, valuation and freshness; expand only for an identified user need. Tool
output preserves decimal strings, coverage, timestamps and warnings in structured
content. Read-only annotations supplement enforced permission checks; even a token
with an admin scope cannot turn an MCP tool into a mutation operation.

## Financial correctness and decision register

Mandatory baseline, independent of accounting decisions:

- Decimal TEXT/JSON strings; arbitrary-precision arithmetic; no JS Number, Python
  float or SQLite REAL/SUM/CAST for financial calculations. At most 30 input
  significant digits; quantity/price/PRU scale <=12, FX <=18 if enabled, posted
  EUR cash scale <=2. Reject excess precision rather than silently round inputs.
- At least 80 intermediate significant digits; half-even rounding by default,
  explicit final scales, sum unrounded values before rounding totals. Broker-posted
  settled cash is authoritative. Preserve zero versus null and canonicalize -0.
- Reconcile opening state plus ledger against positions/cash; idempotent retries
  never duplicate trades or quotes; failed multi-record commands leave no partial
  balance change. Corrections preserve original provenance and recomputation version.
- Preserve source precision, currency/unit and price adjustment provenance. Failed
  retrieval is not a zero price. Incomplete history never becomes an invented return.
- Require synthetic rounding-tie, fractional, negative-correction, repeating-division,
  overflow/scale, serialization and restore fixtures; Python/TypeScript parity once
  collector conversion exists. Compare REST/MCP results for identical service inputs.

Each open decision needs owner approval, an example/invariant set and a corresponding
specification before its dependent behavior is implemented. No recommended option
below is an accounting default.

| ID | Decision requiring product approval | Proposed scope / consequence | Blocks |
| --- | --- | --- | --- |
| F1 | Weighted-average cost basis is preferred; fee inclusion, PRU changes on sales and detailed conventions still need approval | Distinguish cost basis/PRU, unrealized gains and total portfolio performance; preference is not a fee policy | Ledger/positions/unrealized result, not instrument catalog |
| F2 | Trade effective time vs settlement, event ordering, posted gross/net cash and fee/tax treatment | Record both relevant dates where needed; define cash and cost effects without double-counting fees | Transaction schema and cash |
| F3 | Opening state date, authoritative quantity/cost/cash, incomplete history, later correction | Dated opening state with provenance; returns start only where coverage permits | First position slice |
| F4 | Dividends/distributions, accumulation funds, raw vs adjusted prices | Prevent adjusted-price returns plus cash dividends from double-counting; unsupported events must surface | Returns and quotation policy |
| F5 | Splits, mergers, transfers, rights, fractional shares; overselling/negative cash | Define supported events and invariants; reject unsupported commands and mark affected reporting incomplete | Ledger validation and continued accuracy |
| F6 | Unrealized result basis, fees, denominator and zero-cost cases | Declare amount and percentage formulas and unavailable cases | Valuation/performance outputs |
| F7 | Historical performance: TWR vs MWR, cash-flow timing, annualization and date convention | Deliver one approved metric first; optional benchmarks deferred | Historical return contract |
| F8 | Initial currency coverage and FX, quote unit conversion | Prefer an explicitly approved limited currency set; never aggregate unlike currencies without supported conversion | Instrument acceptance and total valuation |
| F9 | Freshness boundaries, close/holiday/illiquid handling and valuation price selection | Existing targets: warning above 45 min, stale above 60 during expected coverage; define equality boundaries and last-close policy | Freshness/valuation acceptance |
| F10 | Allocation denominator, cash, taxonomy; snapshot cut-off and historical revisions | Instrument weights first; optional sector/asset classification later | Allocation and history |

## Authentication and authorization proposal

No provider is selected. Both candidates must satisfy the same requirements using
synthetic data and the actual MCP client before private access is enabled.

| Principal/channel | Required policy | Denied |
| --- | --- | --- |
| Public diagnostics | Existing health/ping; public discovery only | Financial state, holdings/watchlists, credentials |
| Owner REST read | Verified owner identity, intended API audience, `portfolio:read` | Mutation/ingestion without separate grant |
| MCP financial client | Verified owner, intended MCP resource audience, `mcp:read`, read-only operation policy | Administration, writes, ingestion, credential export |
| REST administrator | Dedicated admin client/grant, verified owner, intended audience, `portfolio:admin` | Inheriting admin rights from an MCP/read token |
| Collector | Dedicated rotated narrow credential or short-lived machine token, `quotes:ingest`, instrument/time/batch restrictions | Portfolio, positions, PRU, cash, ledger, admin reads/writes |
| Recovery automation | Isolated narrow backup/recovery authority | Reuse of routine collector/MCP credentials |

MCP access maps to authorized portfolio read capabilities; it need not receive a
REST API audience token inside the same Worker. At each service entry point, enforce
capability policy using a verified principal, not a caller-supplied scope or boolean.
Pin explicit owner identity by trusted issuer/subject or equivalent provider identity;
a matching email or possession of any valid provider token is insufficient.

Require protected-resource and authorization-server discovery, authorization-code
flow with PKCE S256, exact redirect validation, consent, issuer/audience/signature or
introspection validation, expiry, least privilege, refresh/revocation and tested key
rotation/outages. Determine the actual client's registration support (preregistration,
client metadata documents or DCR); do not assume DCR is always necessary. Never
accept tokens intended for another resource or treat an ID token as an API token.
Test wrong owner/client/scope/audience, expired/revoked tokens, consent denial and
collector/admin cross-access. Define maximum revocation propagation before selection.

| Consideration | Workers OAuth Provider | Auth0 |
| --- | --- | --- |
| Identity/lifecycle | Project owns upstream sign-in, owner restriction, consent and recovery integration | Hosted identity reduces identity lifecycle code; application still enforces owner and grants |
| Runtime/state | KV-backed authorization state; validate supported combined-role integration with the single application Worker | External tenant and verification/discovery integration; verify issuer/JWKS cache and outage paths |
| MCP integration | Framework targets remote MCP/HTTP API authorization; verify pinned API and actual client flows | Verify actual client registration, resource audience/scopes, consent and refresh integration; PKCE alone is insufficient |
| Privilege separation | Application must enforce scope/owner policy even if metadata advertises required scopes | Separate applications/grants for read/admin; never give third-party MCP registration default admin access |
| Maintenance | More auth/consent/state/recovery code and KV operations to maintain | Less hosted identity code, additional vendor configuration and lock-in |
| Full cost | Workers/KV plus upstream identity, maintenance and recovery; measure free-tier headroom | Verify interactive, M2M/collector, environments, registration, refresh, security features and quotas; MAU pricing alone is insufficient |

The current Provider documentation supports a one-Worker combined-role form as well
as a recommended split-role example. Validate that the chosen version can protect
both REST and MCP with distinct policies without changing the confirmed application
topology; do not create extra Workers by copying its example. Auth0 DCR is disabled
by default and, when enabled, opens client registration; third-party API grants need
careful restrictions. Neither documentation inspection nor a public ping establishes
interoperability or a zero-cost secure configuration.

Decision evidence: equivalent synthetic login/consent/refresh/revoke and denial tests,
owner account recovery, secret rotation, maintenance responsibilities, environment
isolation, CPU p50/p95/p99/max and warm p95, all required quotas/costs. Retain the
baseline warm-read p95 <1 s and CPU p99 <=8 ms engineering targets for evaluation;
recheck platform limits and require separately approved remote profiling. Select only
after owner review; unresolved cost/security constraints block selection, not safeguards.

Security also requires bounded schemas/body/query limits, parameterized SQL,
persistent/platform abuse controls, fail-closed authorization, safe errors/logs, private
audit trail and isolated CI/collection/deployment/recovery privileges. No credential
file reads, token extraction, custom authorization headers from local Wrangler state
or broader-permission workarounds. Use Wrangler's official authentication and explicit
environment selection for any later authorized operation.

## Milestones and dependencies proposed for review

This is a roadmap, not a phase-by-phase execution plan. Every implementation increment
needs a bounded approved plan; remote resources/deployment and dependency installation
need their own explicit authorization. All implementation uses synthetic data until
the complete real-data gate passes, including in development.

Before M2 selects and validates authentication, administrative/service behavior may
be exercised only with synthetic principals in isolated local tests. Do not expose
financial routes or tools through the existing public Worker/plugin or add a public
authentication bypass for early milestones. M2 gates all protected remote exposure.

| Milestone | Outcome / exit evidence | Dependencies |
| --- | --- | --- |
| M0 — Product and contracts | PRD approved with 2026-11-08 refinements; review the instrument-only contract/plan now, then settle accounting decisions per dependent slice | No advanced financial decision blocks instrument metadata |
| M1 — Financial Instruments REST API | Implemented synthetic catalog operations, shared services/port, memory adapter, metadata validation and real loopback HTTP tests; default health/ping unchanged; no public financial routes | First-slice approval received with local HTTP refinement; no D1/new dependencies/remote resources |
| M2 — Authentication comparison | Equivalent synthetic candidate prototypes and actual-client auth evidence; owner selects provider and grants, confirms cost/recovery/topology | M0 policies; provider-specific bounded approval; resource/deployment authorization if needed; can inform M1/M3 without serially blocking pure domain work |
| M3 — Opening state and ledger | Local synthetic D1 schema/repositories, transactions/corrections/idempotency/rollback, derived quantities/cash/PRU; deterministic reconciliation fixtures | M1; approved financial rules; local tooling authorization; remote D1 remains separately gated |
| M4 — Quotes and valuation | Unit/currency/freshness handling, valuation/unrealized result, allocation and coverage; then minimal MCP financial reads produce the same results as REST | M3; F4/F6/F8–F10; approved synthetic quote fixtures; selected auth for any protected remote exposure |
| M5 — Automated collection | Python provider adapter, decimal conversion parity, narrow authenticated idempotent ingestion, session schedule, failure/gap handling | M2 + M4; approved Python dependencies/workflows/credentials and provider terms; synthetic pipeline first |
| M6 — History and performance | Versioned snapshots and one approved return methodology with bounded queries, gaps and corrections; optional MCP history reads | M3 + M4; F4/F7/F10 and adequate history; M5 for automated observations |
| M7 — Private-data readiness/release | Authorization/security/CPU evidence, quotas/EU/privacy assessment, encrypted independent backup and restore/deletion replay, alerts, export/deletion, owner consent and explicit production approval | M2–M5 and all applicable INSTALL gates; M6 if historical performance is released |

M1 is implemented for synthetic local use. Follow-on persistence and OAuth evaluation
require separately bounded authorization. Do not start financial calculations while
their decisions remain open. The milestone list does not authorize those activities.

## Official references checked for this proposal

Reviewed 2026-11-06; recheck provider releases, client compatibility, pricing and
platform limits at implementation. No provider runtime or auth account was configured.

- [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html): REST description and component structure.
- [MCP authorization, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization): resource discovery, registration choices, PKCE and audience binding; target the actual negotiated client version.
- [Workers OAuth Provider README](https://github.com/cloudflare/workers-oauth-provider/blob/main/README.md): KV, application-owned authorization, combined/split roles and scope enforcement.
- [Auth0 PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce): public-client authorization flow.
- [Auth0 dynamic registration](https://auth0.com/docs/get-started/applications/dynamic-client-registration): registration defaults and third-party API grants.
- [Auth0 pricing](https://auth0.com/pricing): free offering does not prove this workload's complete cost.
