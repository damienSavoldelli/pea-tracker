# Machine ingestion — configuration and recovery runbook

Authority: [implementation plan](plan.md), [quotation contract](../2026_11_11_quotations/contract.md)
and [collector operations](../../../../collector/README.md). This document prepares
remote configuration; it does not authorize or claim its execution. The repository
is already public. Collection schedules remain disabled.

## Authentication and authorization contract

Use Cloudflare Access **Service Tokens + Service Auth** for GitHub Actions. The
collector sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` on every ingestion
request. It does not reuse the interactive ChatGPT owner token, cookie, OAuth
refresh token or an assumed Managed OAuth Client Credentials endpoint.

Access validates the service credentials and forwards `Cf-Access-Jwt-Assertion`.
The Worker checks RS256/signature, the fixed team issuer/JWKS, one dedicated
ingestion application audience, `type: app`, issuance/expiration/not-before bounds
and the exact signed service identity. Machine assertions have empty `sub` and
`common_name` equal to the Service Token Client ID. Raw client headers alone are
never trusted as identity. This format differs from the existing nonempty owner
subject and is verified through the shared Access JWT mechanism.

The machine adapter accepts at most two explicitly pinned client IDs, checks its
enabled flag, bounds assertion lifetime to 300 seconds and maps either accepted ID
to the stable internal principal `collector:github-actions`. Its only capability
is `quotes:ingest`, regardless of asserted scopes, roles or permissions. Existing
QuotationService checks additionally bind that subject to exact provider and
instrument allowlists. Missing grants deny ingestion.

An empty `COLLECTOR_INGESTION_GRANTS` array is a valid deny-all configuration for the
closed first deployment. It grants no provider/instrument pair; even an authenticated
machine principal with `quotes:ingest` is denied before any D1 lookup or write. Non-empty
grants retain the same strict provider, instrument-ID, count, and duplicate constraints.

The opt-in ingestion composition mounts only `/api/v1/quotation-batches`; quotation
reads, positions, administration, diagnostics and MCP are absent. Method, body,
idempotency and safe error rules remain those of the existing ingestion contract.
Default/deployed Worker entrypoints and the MCP Access application stay unchanged.

## Local Worker composition evidence

`src/entrypoints/access-collector.ts` now composes the existing Access Service Auth
adapter, `QuotationService`, and native D1 instrument/quotation repositories. Its
only application route is the protected batch-ingestion endpoint. Missing or
invalid bindings/configuration produce a generic `503` with `no-store`; there is
no permissive or in-memory fallback. Machine identity still maps only to the
fixed `quotes:ingest` principal and the configured provider/instrument grants.

`tests/fixtures/wrangler.access-collector-local.jsonc` is a **local-only** fixture:
it uses a distinct Worker name, `workers_dev: false`, `preview_urls: false`,
`remote: false`, synthetic Access values and synthetic instrument grants. It
reuses the existing migration directory and schema; no migration or alternate
financial store was added. The configuration intentionally has no remote D1 ID,
chosen hostname or production audience and is not a deployment manifest. Keep
private instrument grant lists in secret storage when they reveal portfolio
scope; the fixture's values are synthetic. Its compatibility date is pinned to
`2026-11-11` because that is the newest date supported by the installed Wrangler
4.158 local runtime; advance it after upgrading the Worker runtime toolchain.

The local Worker test runs the existing Python client through a synthetic Service
Auth edge and Hono into native local D1, then verifies durable quote outcomes,
idempotent replay, denied identities, absent out-of-scope routes and fail-closed
configuration. A Wrangler dry-run bundles the dedicated entrypoint. These checks
do not establish hosted Access behavior, remote D1 readiness or deployment. No
Worker, GitHub secret, schedule or remote resource was changed, and collection
remains inactive.

## Remote deployment template (not provisioned)

`tests/fixtures/wrangler.access-collector-remote.template.jsonc` proposes the
dedicated Worker and D1 name `pea-tracker-quotes-ingestion`, Access application
`PEA Tracker Quote Ingestion` with a Service Auth policy, and machine principal
`collector:github-actions` mapped only to `quotes:ingest`. The Worker has no
workers.dev or preview hostname. Bind a separately approved Access-protected
hostname before deployment; do not reuse either existing Worker hostname.

The template has replacement markers for the D1 ID, team issuer and dedicated
Access AUD. It is intentionally not deployable as checked in. After approved
resource creation, copy it to the ignored
`tests/fixtures/wrangler.access-collector-remote.private.jsonc`, replace the
markers from Cloudflare's returned values, and set the two required Worker secrets there. Keep
`ACCESS_INGESTION_ENABLED` false through the first closed deployment. The D1
binding uses the existing `migrations/` directory; apply all four migrations to
the new remote database explicitly before enabling the Worker. Do not deploy from
the template or permit Wrangler auto-provisioning.

Approved-operation sequence (examples only; not executed):

1. Approve the account, hostname and names. Create D1 explicitly, capture its
   returned ID privately, then prepare the ignored config:

   ```sh
   npx wrangler d1 create pea-tracker-quotes-ingestion
   ```
2. Apply and inspect migrations against that database:

   ```sh
   npx wrangler d1 migrations apply pea-tracker-quotes-ingestion --config <private-config> --remote
   npx wrangler d1 migrations list pea-tracker-quotes-ingestion --config <private-config> --remote
   ```

   Confirm migrations `0001`–`0004` before continuing.
3. Create the distinct Access application and Service Auth policy. Pin its
   dedicated service token Client ID in `ACCESS_SERVICE_CLIENT_IDS`; place the
   exact approved provider/instrument grants in `COLLECTOR_INGESTION_GRANTS`.
   Enter each secret via secure input, never command arguments:

   ```sh
   npx wrangler secret put ACCESS_SERVICE_CLIENT_IDS --config <private-config>
   npx wrangler secret put COLLECTOR_INGESTION_GRANTS --config <private-config>
   ```

4. Dry-run the completed config, then verify account, Worker, D1 ID, hostname,
   Access protection, audience, allowlists and disabled flag. Deploy only after
   separate explicit approval:

   ```sh
   npx wrangler deploy --dry-run --config <private-config>
   npx wrangler deploy --config <private-config>
   ```

5. Test anonymous/invalid identities, absent read/MCP/admin routes and one
   synthetic authorized batch plus replay. Enabling ingestion and adding protected
   `collector-live` GitHub secrets each require separate approval. The schedule
   stays disabled.

No account, remote ID, hostname, audience, service token, grant list, database or
deployment has been selected or created. These values require owner decisions.
The template enables observability; review retention before use and ensure logs
never contain assertions, credentials or quote payloads.

### D1 Free budget and review corrections

The REST contract still accepts 50 observations. `InstrumentRepository` gains an
additive `getMany` operation, implemented by both Memory and D1: at most 50 unique
IDs, missing records omitted, detached results and no ordering guarantee. Existing
method signatures and financial rules are unchanged. The service deduplicates
authorized instrument IDs before one bound D1 `SELECT ... IN (...)`; it does not
load instruments outside the caller's grants. Each observation is still validated
against its grant and instrument metadata before any write.

An accepted ingestion attempt or idempotent replay makes **two D1 binding calls**:
one grouped instrument read and one native atomic write/receipt/read batch. This
leaves 48 calls below the Free limit of 50 D1 calls per invocation. A `db.batch()`
counts as one call for this limit, although it contains three SQL statements; the
write transaction, conflict handling and immutable outcomes are unchanged. JWKS
HTTP retrieval remains separate from D1 and subject to the existing bounded cache
and timeout behavior. See [official D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

The dedicated Worker suite measures actual binding operations against native local
D1 for both 50 distinct instruments and 50 observations of one instrument, checks
the deduplicated bound IDs, replays each lot unchanged, and verifies 50 stored
observations. Shared Memory/D1 contract tests cover grouped lookup bounds, missing
IDs, duplicate IDs and snapshot isolation. Only the Python interoperability case
requires Python; security/configuration checks no longer skip with its absence.
Additional cases cover partial configuration, malformed client/grant JSON, invalid
issuer/AUD, empty grants, the exported handler's successful ingestion/replay and
JWKS cache reuse, plus isolation between environments with different security
settings. Local call-count evidence does not prove hosted CPU/latency limits or
actual Access policy behavior; hosted acceptance below remains mandatory.

Validation evidence (2026-11-12, synthetic/local only):

- Targeted Worker, quotation and Memory/D1 repository suites: 75 tests / 4 files.
- Full TypeScript suite: 507 tests / 33 files, including OpenAPI document/response
  validation, existing atomic rollback/restart and diagnostic/MCP regressions.
- With an empty grant list and machine authentication enabled, the local Worker
  returns `403 quotation_ingestion_not_allowed` before any D1 binding call; no
  quotation or idempotency outcome is written. Malformed and non-empty grant
  validation remains enforced.
- Strict TypeScript passes. Dedicated Wrangler 4.158 dry-run exits 0 and bundles
  1261.90 KiB / gzip 224.68 KiB; sandbox restrictions prevent Wrangler writing its
  external log file, without preventing bundling. A second dry-run with the ignored
  private secrets file also exits 0 without displaying its values or uploading.
- Full scoped diff, whitespace and synthetic-data checks completed; no migrations,
  deployed Worker configurations, OAuth policy, workflows or real secrets changed.

## Approval-gated setup order

1. Approve the future ingestion destination and environment. No real hostname,
   Access AUD, service credential or remote D1 binding has been selected here.
   An illustrative origin such as `https://ingestion.example.invalid` is not a
   deployment target. Do not repurpose the existing MCP application or its AUD.
2. After explicit authorization, prepare a separate self-hosted Access application
   for that approved ingestion destination, with its own AUD. Verify actual Workers
   association/hostname support in the account before publishing anything. Protect
   the destination before enabling ingestion; retain Worker-side authentication
   even when the edge policy is present.
3. Create a dedicated expiring service token only after approval. Record its Client
   ID and secret directly in approved secret storage, never in chat, tracked JSON,
   process arguments, workflow logs or artifacts. It needs no Cloudflare account
   API-token privileges or GitHub repository write access.
4. Configure a **Service Auth** policy accepting that exact service token. Do not
   use Allow, Bypass, Everyone, wildcard identity matching or a selector that admits
   every service token. Keep the owner's MCP policy separate.
5. Verify the organization's strict service-token authentication behavior. With
   strict mode enabled, service-credential requests use Service Auth rather than
   human Allow policies/cookies, return 401/403 on denial, and continue presenting
   the credential pair on subsequent requests. Do not silently change this
   organization-wide setting: review its effect on the existing MCP integration
   and obtain specific approval if a change is necessary.
6. Configure the backend's trusted team issuer, dedicated ingestion AUD, enabled
   flag and exact service-client allowlist; configure the stable collector's
   provider/instrument grants. Confirm the ingestion AUD differs from the MCP AUD.
   Stage the approved native D1 binding/composition separately; no deployment is
   authorized by this document.
7. Confirm an actual hosted service assertion fits the 300-second lifetime bound.
   Credential lifetime, Access application sessions and assertion lifetime are
   different settings. Do not assume that choosing an expiring service token sets
   JWT lifetime, and do not relax the verifier if the observed profile differs.
8. Configure the GitHub protected Environment and run the hosted acceptance checks
   below only after separate approval. Leave all activation flags and schedules
   off until the checks and remaining provider/recovery gates pass.

## GitHub configuration

Use a reviewed `collector-live` Environment restricted to `main`, with required
owner approval. Verify that protection exists: an environment name alone does not
establish reviewers or branch restrictions. Never make its ingestion secrets
available to pull requests, forks, unapproved branches or external contributions.

The live execution step uses `COLLECTOR_AUTH_MODE=cloudflare_access`. Store
`COLLECTOR_ACCESS_CLIENT_ID` and `COLLECTOR_ACCESS_CLIENT_SECRET` in Environment
**Actions Secrets**, alongside the existing private mapping/API origin and optional
approved heartbeat destination. Do not configure legacy OAuth token URL/client
credentials or an interactive bearer token as a fallback. Secret values must be
updated through approved dashboard/official secret-entry procedures, never command
arguments or a tracked environment file.

Retain the existing four explicit live gates, SHA-pinned actions, non-persistent
checkout credentials, bounded runtime/concurrency, `contents: read` and manual-only
workflow. The independent monitor's `actions: read` serves run-status checks only.
No dependency-install or synthetic-test step receives ingestion secrets. Do not
upload mappings, payload journals, cookies, headers or tokens as artifacts/cache.
Activate schedules only with explicit owner authorization after hosted validation.

## Rotation and revocation

- **Routine secret rotation:** rotate the Access service-token secret while keeping
  its Client ID. Use only an approved grace period, replace the protected GitHub
  secret, verify a permitted synthetic ingestion cycle, then confirm the previous
  secret no longer authenticates. The stable Worker principal and idempotency
  subject remain unchanged; never generate a different batch key to bypass a retry
  conflict.
- **Client-ID replacement:** if a new service token is necessary, temporarily pin
  the old/new IDs explicitly (maximum two), both mapping to the same internal
  collector principal. Update the GitHub pair, test the replacement, then remove
  the old ID and disable/delete the old token. Policy and Worker allowlist updates
  each require their own approved remote change.
- **Emergency containment:** disable collection gates, disable/delete the Access
  service token, and use the Worker enabled flag or remove the affected allowed ID
  through approved operations. Remove/replace the corresponding GitHub secrets;
  handle both secrets if a rotation grace period is active. Preserve private replay
  journals for recovery rather than publishing them or changing their keys.
- **Revocation boundary:** an offline JWT verifier does not query credential state
  on every request. Access stops new service authentications, but a previously
  signed assertion may remain cryptographically valid until its expiry plus the
  verifier's 30-second clock tolerance if it can reach the origin directly. The
  300-second lifetime bound limits that window; it does not prove immediate
  revocation. Worker kill/allowlist changes require propagation too. Application
  session revocation alone does not revoke a still-valid service credential.

## Hosted acceptance and evidence limits

Before activation, verify that valid service credentials can ingest one synthetic
batch and replay it unchanged, while missing/wrong/revoked/expired credentials,
interactive owner credentials, wrong AUD and unknown service IDs are denied. Check
401/403 behavior without login redirects; test provider/instrument exclusions and
confirm no writes on denial. Verify read/admin/MCP/diagnostic routes are absent and
non-POST batch methods are denied, including through any approved origin path.

Exercise secret rotation, previous-secret rejection, token disable/delete, the
Worker kill flag and replacement-ID removal. Verify GitHub Environment protection,
no secret/payload output, hosted assertion lifetime, edge credential revalidation,
revocation delay and monitoring before any real or scheduled collection. No test
should print or retain the complete assertion or secret.

Local tests use synthetic keys/credentials and an explicitly test-only simulated
Access edge before Hono, with Memory/native local D1. They prove tested cryptography,
policy mapping, transport and storage behavior; they do not prove the account's
actual Access policy, hosted edge behavior, credential lifecycle or remote CPU
budget. Those remain manual/approval-gated checks, as do Yahoo rights, full mapping
coverage, independent alerts and private-data release gates.

Official references: [Access application token shape](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
and [service credential setup/lifecycle](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
