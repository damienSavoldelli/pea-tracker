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

The opt-in ingestion composition mounts only `/api/v1/quotation-batches`; quotation
reads, positions, administration, diagnostics and MCP are absent. Method, body,
idempotency and safe error rules remain those of the existing ingestion contract.
Default/deployed Worker entrypoints and the MCP Access application stay unchanged.

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
