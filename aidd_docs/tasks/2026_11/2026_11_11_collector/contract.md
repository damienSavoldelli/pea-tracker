# Collector contract — local implementation, hosted activation gated

2026-11-11 update: the generic OAuth Client Credentials placeholder below is
superseded for the production collector by [dedicated Cloudflare Access Service
Auth](../2026_11_11_remote-ingestion/contract.md). The legacy JWT composition remains
tested compatibility code; production Python now selects the Access credential pair,
with no bearer/OAuth fallback. Hosted activation is still gated.

Authority: [owner-approved plan](plan.md), [ingestion](../2026_11_11_quotations/contract.md),
[public repository/local usage](../../../../collector/README.md).

## Scope and boundaries

Python/yfinance/GitHub Actions is the definitive V1 choice. Backend domain,
repository ports, D1 migrations, financial arithmetic and read-only MCP remain in
TypeScript. The collector has no D1 access or portfolio read/admin permission.
The repository is already public; no visibility change is part of this work.

`collector/pea_collector` separates strict mapping/normalization, isolated provider,
HTTP transport/machine token acquisition, durable local journal and CLI. Locked
CPython 3.14 runtime/test dependencies are in `collector/uv.lock`.

The provider mapping is a strict bounded private instrument-to-symbol catalog,
not inferred from owner positions. Only synthetic mapping is tracked. Currency,
unit, exchange/time zone and source quote type must match. No price is invented,
rounded, adjusted or financially converted. The backend remains the financial
authority and repeats validation, subject/provider/instrument checks and atomicity.

Successful payloads match the existing quotation-batch contract. The source's
regularMarketTime is retained independently of actual fetched_at. The session date
uses source time zone after exact metadata verification, rather than a guessed
market calendar. Delay is unknown/null. Provenance discloses upstream float and
derived session-date boundaries; there is no recovered exchange precision claim.
Provider failures produce existing sanitized failure enums/null quote fields.

## Authorization and backend adaptation

`src/collector-app.ts` is an explicitly injected composition over the existing
TokenVerifier collector policy and QuotationService. The only adapter extension
is optional `ingestionOnly`; its default preserves existing quotation routes.
In collector composition quotation reads, instruments and portfolio routes are
not mounted. No deployed entrypoint imports it. No existing JWT/Access verifier,
OAuth scope mapping, Worker config, D1 contract or migration changes.

Production Client Credentials must come from an approved separately configured
machine issuer/client compatible with the existing RS256/JWKS verifier. Require
distinct collector audience, short token life <=300 seconds, exact machine subject
and client, scope quotes:ingest only, stable internal idempotency subject and server
allowlists. The interactive Access Managed OAuth PoC is **not** such an issuer/client
configuration, and this work does not claim that it provides Client Credentials.
Synthetic signed tokens prove the local integration only; remote machine setup
and private backend exposure still require approval.

## Retry, recovery and monitoring

- Bounded sequential collection: <=20 symbols, <=2 attempts each, hard child-process
  deadline, private disposable provider cache, no raw provider error/log output.
- Fixed cycle key and original canonical payload are journaled privately before
  POST. Network/selected server failures retry the same bytes/key <=3 attempts.
  Authentication, scope, conflict, invalid payload and rate-limit errors stop.
- Atomic backend ingestion preserves the previous usable quote after failures.
  New HTTP client does not bypass the existing durable idempotency service.
- Local process replay is durable; fresh GitHub runners lack the original journal.
  A rerun without it fails closed before fetching. No personal data is uploaded in
  artifacts/cache to provide cross-run recovery. This limitation remains explicit.
- Job concurrency/runtime guards, configurable 30/60/120-minute cadence and
  collection-window checks do not claim an exchange holiday/session calendar.
- Missing-cycle workflow inspects actual successful live steps, not skipped jobs
  or synthetic runs. Independent optional dead-man heartbeat addresses a workflow
  that never starts; its remote service/notifications must be approved/tested.

## Public workflow safety

Manual only; schedule entries remain comments. No pull_request/pull_request_target,
fork execution or arbitrary ref checkout with ingestion secrets. Exact repository
and main ref gates, four explicit live approval flags, reviewed protected Environment,
pinned action commits, contents:read and no persisted checkout credentials.
The monitor alone needs actions:read. Secrets are confined to the live execution
step; no source dependency install or untrusted contribution receives them.
No token, mapping, payload or provider cookie cache artifact is published.

## External evidence and unresolved gates

2026-11-11, installed yfinance 1.8.0: two explicit public sample requests through
the actual isolated adapter passed normalization of symbol, EUR currency, exchange
PAR, Europe/Paris time zone, quote type, positive decimal price and market timestamp:
AIR.PA (equity) and WPEA.PA (ETF). Outputs retained **only** sample categories and
success codes. No price, raw response, owner mapping or holdings were recorded.
This was a targeted qualification, not a scheduled/live ingestion cycle, a full
20-instrument acceptance, a verified ISIN/PEA-eligibility assessment or a SLA test.
The current command makes network access explicit with `qualify --live`; offline
is now the default and is separately tested without provider calls.

[yfinance](https://github.com/ranaroussi/yfinance) states that it is unofficial,
for research/education and that data rights depend on Yahoo's terms; library code
licensing does not grant market-data use/redistribution rights. The
[Yahoo terms](https://legal.yahoo.com/ie/fr/yahoo/terms/otos/index.html) returned
HTTP 999 and [exchange/delay page](https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html)
HTTP 429 through the documentation retrieval tool. Applicable terms, full catalog
coverage, exact delay semantics, provider limits and authorized usage remain
**unverified**; success of the two technical calls does not remove this gate.

[GitHub scheduling](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
can be delayed/dropped and disabled after inactivity; it is not a freshness SLA.
[Workers Free](https://developers.cloudflare.com/workers/platform/limits/)
ingestion CPU/subrequest budgets still need approved remote measurements. No paid
plan activation, D1 provisioning, deployed change, real portfolio data or remote
GitHub configuration is implied by completing the local synthetic implementation.
