---
status: implemented
---

# Minimal live catalogue and D1 quotation reads

Approved scope: owner's 2026-11-14 mission, following the existing collector,
quotation and remote-ingestion contracts. Local preparation is implemented;
remote activation and actual Yahoo ingestion are not part of this completion.

## Delivered

- `scripts/catalogue-preparation.ts` invokes the existing InstrumentService and
  D1InstrumentRepository with a capture-only binding. Submission deliberately
  stops before persistence. It renders the same parameterized batch for reviewed
  SQL import, without reimplementing inserts or repository business rules.
- `scripts/catalogue-prepare.mjs` validates the mapping with the existing Python
  parser and prepares private, exclusive-create files under `.wrangler/catalogue-live/`.
  The reviewed manifest fixes the UUID and idempotency key; mapping and one Yahoo
  instrument grant derive from that manifest. No database or provider is contacted.
- `src/entrypoints/access-read.ts` is a separate closed-by-default composition.
  It reuses AccessAuthenticator for exact-owner authentication and maps that owner
  to only `instruments:read` and `quotes:read`. Claimed scopes do not grant writes.
  Existing D1 repositories, REST adapters and MCP tools serve catalog/status/history.
- Explicit route selection leaves ingestion, instrument mutations, portfolio,
  diagnostics and token endpoints absent. Missing/invalid configuration or a disabled
  read flag returns generic 503; no diagnostic fallback is mounted.
- Local and remote-example Wrangler files select only this new entrypoint. The
  ignored private remote draft reuses the existing D1 binding, leaves the new Access
  AUD/owner unconfigured, and keeps workers.dev/previews/reads disabled. Existing
  DEV, PoC and ingestion compositions/configurations are unchanged.

## Candidate evidence and limitations

AIR.PA is a public candidate, not a declaration of owner holdings. The private
manifest records Airbus SE, ISIN NL0000235190, EUR, MIC XPAR and currency_unit.

- [Airbus share information](https://www.airbus.com/en/investors/share-price-and-information)
  identifies the ISIN and Paris ticker AIR.
- [Euronext Paris equities](https://live.euronext.com/en/markets/paris/equities/list)
  ties AIRBUS, the same ISIN, AIR, XPAR and EUR together. The MIC is not inferred
  from Yahoo's `.PA` suffix; Yahoo's `PAR` exchange code is a separate identifier.
- [Yahoo AIR.PA](https://fr.finance.yahoo.com/quote/AIR.PA/) identifies Airbus SE,
  Paris and EUR. The existing actual adapter qualification on 2026-11-11 passed
  EUR/currency_unit, PAR, Europe/Paris and EQUITY normalization. This session did
  not refresh the live adapter result or fetch a quotation. Yahoo direct retrieval
  was rate-limited during documentary verification; indexed public metadata is
  supporting evidence, not fresh provider acceptance.
- Existing normalization treats a reported EUR price as EUR currency units, with
  no factor or FX conversion. The first approved live cycle must reject metadata
  changes rather than silently correcting the mapping.
- Yahoo usage rights, precise delay semantics and PEA eligibility are not approved
  by this identity check. No price, quantity, PRU or personal position is prepared.

## Validation evidence

- 542 TypeScript tests across 35 suites passed, including native local D1,
  existing ingestion regressions, OpenAPI checks and real loopback MCP SDK reads.
- 146 synthetic/offline Python checks passed; TypeScript strict passed.
- New read Worker local dry-run passed; Wrangler-generated temporary binding types
  confirm the existing native `INSTRUMENTS_DB` type. No dependency was installed.
- Catalogue tests cover coherent identifiers/symbols/units/kinds, invalid ISIN,
  SQL escaping, native D1 creation/replay and literal SQL execution.
- Reader tests cover exact decimal/provenance/timestamps, REST contracts, SDK tools,
  absent mutation routes, missing permissions, forged/expired/wrong-audience/issuer
  assertions, wrong owner, configuration failure and environment cache isolation.
- Private catalogue files are ignored, directory 0700/files 0600. The tracked
  tests are synthetic; no remote identifier, owner identity or credentials are included.

## Boundaries still open

No hosted reader, new Access application, real instrument registration, Yahoo
ingestion, Actions environment/secrets or schedule is activated. The ingestion
Worker remains in its previously closed state; no remote verification or mutation
was performed in this slice. Read-only code still receives a normal D1 binding:
the route/service boundary is the application control, not a database read-only role.

Fresh-runner replay remains fail-closed without its original private journal.
Market-calendar freshness remains unknown; no real-time guarantee is introduced.
Source observations are not an atomic cross-instrument market snapshot. Existing
provider/security/recovery/private-data gates remain applicable, including rotation,
revocation, monitoring and independent backups before personal financial data.

See [runbook.md](runbook.md) for separately authorized operations.

## Follow-up — local portfolio reader integration

The owner requested continuing V1 business development after the successful hosted
Actions collection. Existing PortfolioService, ValuationService and native
D1PortfolioRepository are now composed by the same reader, without changing
financial calculations, repository contracts, migrations or JWT verification.

`ACCESS_PORTFOLIO_READ_ENABLED=true` explicitly opts into owner `portfolio:read`;
omission defaults to false and preserves the quotation-only surface. An invalid
value fails closed. Claim-provided scopes never select permissions. Existing
private deployment settings are not changed by this local implementation.

When opted in, only GET opening-state/current/revision, positions and valuation
routes are forwarded. Existing MCP tools get_opening_state, get_positions and
get_portfolio_valuation reuse those same services. Portfolio mutations and quote
ingestion remain absent even when JWT scope claims request administration.
An absent opening state returns its existing explicit 404; no holdings or cash
are fabricated. No administrative endpoint or bootstrap of personal data is added.

Local native D1/REST/OpenAPI/SDK coverage verifies exact valuation, canonical PRU,
explicit initialization errors, authentication and permission denial before D1,
missing write routes, and unchanged default tool exposure. Existing valuation
tests retain coverage of partial totals, unknown cash and financial edge cases.
Market-calendar freshness and non-atomic quotation snapshot limits remain unchanged.
Deployment and personal-data release gates remain separately approval-bound.

Follow-up verification: 65 targeted TypeScript tests across five suites passed
(reader, valuation domain/HTTP/contracts and portfolio HTTP), including REST
OpenAPI response validation and SDK calls over loopback/native local D1.
Strict TypeScript, reader dry-run bundling and diff whitespace checks passed.
No reader deployment, remote opening-state write or schedule activation occurred.

## Follow-up — automation activation preparation

The owner prioritized finishing automation on 2026-11-14. The existing collector
and missing-cycle schedules are now enabled in the local workflow definitions:
`17,47 6-18 * * 1-5` and `9 * * * 1-5` respectively (UTC). This preserves the
existing 30/60/120-minute cadence selection and broad weekday window; it does not
introduce a market calendar. No push or remote schedule activation was performed.

Repository/ref guards, four approval flags, main-only `collector-live`, pinned
actions, least-privilege tokens, timeouts and no-cancel concurrency are retained.
Fixed job summaries describe collection/monitor failures without quoting payloads,
credentials or upstream messages. Existing missing-cycle logic still counts only
successful actual live collection steps. Targeted offline validation passed 44
Python checks, including YAML schedules and all supported cadence intervals.

Remote activation requires a separately approved change to the environment's
required-reviewer rule: leaving it enabled would block every scheduled execution.
Main-only branch restriction and environment Secrets must remain in force. Native
GitHub failure notifications plus the hourly checker provide the proposed V1
monitoring; they are not independent of GitHub availability. The optional external
heartbeat has not been provisioned and no independent-outage detection is claimed.
This operating limitation needs owner acceptance before unattended activation.

The reviewed private 20-instrument mapping and Yahoo grant are ready locally.
Keep the repository live gate false until mapping, notification/environment
settings, Worker deployment and publication of schedules are explicitly approved
and complete. Existing deployed Workers remain unchanged and ingestion closed
during this preparation. The owner deferred credential rotation to finalization;
this work neither rotates credentials nor represents rotation as completed.

The owner subsequently authorized the commit, push, persistent 20-instrument
ingestion deployment and the described unattended-activation settings. GitHub CLI
authentication remains invalid; environment review rules, mapping Secret contents
and notification preferences cannot be independently confirmed through that CLI.
Publication/deployment alone must not be reported as proof that scheduled runs
have executed or that those dashboard settings have been applied.
