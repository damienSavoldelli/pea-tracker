# Opening state and positions — local synthetic contract

Authority: [owner decisions / implementation plan](plan.md),
[approved PRD](../2026_11_08-financial-backend-prd.md),
[OpenAPI](../../../api/openapi.json). One singleton portfolio; no new tenancy model.

## Declared state

Every full revision contains a UTC `effective_at` (reference time for every line),
separate server `recorded_at`, revision number/ID, provenance and up to 100 distinct
instrument positions. A line contains stable `instrument_id`, positive exact
`quantity` (12 decimal places), nonnegative `declared_pru` (12), currency code and
provenance `{source, reference}`. Maximum 30 significant digits; values are JSON
strings / SQL TEXT and canonicalized without rounding. Negative/short positions
are explicitly unsupported. A zero quantity is represented by omitting the line.

PRU is the broker's declaration, not a computed historical cost. No fee, total-cost,
unrealized-gain or return calculation is performed. Position currency is explicit;
it is not inferred from the instrument's quotation currency. FX is not implemented.
Optional known cash is expressed as `{currency: "EUR", amount: <decimal string>}`
(nonnegative, EUR 2-place input limit). Required `cash: null` means unknown;
it never becomes a fictitious zero. Other cash currencies/negative balances are
rejected as unsupported in this slice, not assigned an accounting treatment.

The first revision has `correction_reason: null`; later ones require a bounded
reason. Each correction is a full replacement set (omitted positions disappear
from the current view) preserving the original effective timestamp. Prior sets
remain readable. Future reference timestamps are rejected. Provenance/reference
text is bounded and rejects control characters. Actor identity is retained in
the durable, operation-specific outcome linked to each revision; no owner identity
is exposed in portfolio DTOs. All examples and tests remain synthetic.

## REST

| Operation | Behavior | Server capability |
| --- | --- | --- |
| `POST /api/v1/portfolio/opening-state` | Append initial/corrected complete revision; 201 plus ETag and revision Location | `portfolio:admin` |
| `GET /api/v1/portfolio/opening-state` | Read latest revision; 404 before initialization | `portfolio:read` |
| `GET /api/v1/portfolio/opening-state/revisions/{revision}` | Read immutable historical revision | `portfolio:read` |
| `GET /api/v1/portfolio/positions` | Bounded current opening-position projection, without invented trades | `portfolio:read` |

POST requires `Idempotency-Key` and strong `If-Match`: `"0"` for creation, current
revision for correction. Same subject/operation/key/canonical request replays the
original result even after correction; changed input returns 409. Expected revision
is part of the canonical request. Concurrency conflicts return 412 without partial
writes or consumed keys. A changed reference date returns 409. Instrument references
must exist; inactive historical catalog references remain readable. Request ceiling
is 128 KiB. Error/JSON/media/origin/no-store conventions reuse the instrument adapter.

Positions use default limit 50, maximum 100 and a canonical cursor bound to an
immutable revision and offset. Corrections cannot mix two snapshots in one traversal.
Ordering is binary instrument UUID order. No arbitrary historical `as_of` query or
ledger projection is promised. Historical performance is explicitly unavailable
with `opening_state_only`. Empty initialized state differs from missing state.

## Shared services, persistence and MCP

`PortfolioService` is shared directly by REST and read-only MCP `get_positions`
and `get_opening_state`; no internal HTTP, SQL in adapters outside repositories or
duplicated calculations. All services authorize before storage. Only explicit
injection mounts the routes/tools; existing JWT/Access grants are not widened.
MCP has no create/correct tool. Existing health/ping and deployed compositions stay
unchanged. The InstrumentRepository port and instrument tables remain compatible.

`0003_opening_portfolio.sql` adds immutable revisions, instrument-FK position lines
with decimal TEXT, and durable original outcomes. A native D1 batch atomically
inserts all three. SQL triggers reject stale/nonsequential revisions and changed
reference dates. Dependent writes are guarded against replay; zero inserted rows
cannot append orphan lines/outcomes. Receipt/FK failures roll back the entire
batch. UPDATE/DELETE is rejected for all opening tables. No receipt TTL or automatic
deletion exists; eventual real-data deletion/recovery needs a separate reviewed plan.
Memory implements the same application repository contract for isolated tests.

## Explicit local HTTP setup

Apply only the existing ID-free fixture's migrations before starting. This setup
must never be deployed, tunneled or used with real data:

```sh
node node_modules/wrangler/bin/wrangler.js d1 migrations apply pea-tracker-instruments-local --config tests/fixtures/wrangler.d1-local.jsonc --local --persist-to .wrangler/instruments-d1-local
node scripts/dev-instruments-d1.mjs --principal admin --port 8788 --portfolio true
```

The inherited fixture binds only `127.0.0.1`, checks Host/Origin, uses a fixed
startup synthetic principal and closes workerd through the existing launcher.
Use `--principal reader` for separate read-only checks; no HTTP header selects a
principal. Only the local fixture grants portfolio permissions. Stop with Ctrl-C;
the owned developer state survives restart. Tests use disposable separate paths.

Acceptance tests compare Memory/native D1, real loopback REST and official MCP SDK,
full revisions, pagination, idempotency, competing writes, SQL/FK rollback,
immutability, schema upgrades and real process-restart recovery. These establish
local behavior, not remote durability, backups or real-data readiness.
