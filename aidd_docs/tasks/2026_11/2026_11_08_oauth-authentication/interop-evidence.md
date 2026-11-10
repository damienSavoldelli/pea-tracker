# Phase 3 — Auth0 interoperability preparation

Historical Auth0 preparation below. Owner switched priority to Access Managed OAuth
on 2026-11-09; the PoC Wrangler config now targets the separate Access entrypoint.
See [Access integration and deployment proposal](access-implementation.md) for current
configuration and evidence. No prior Auth0 result is a hosted Access success claim.

Status: local preparation implemented; hosted execution blocked pending exact setup
and separate owner approval. No actual Auth0 tenant or hosted client was accessed.
No OAuth connection, PKCE exchange, refresh or revocation success is claimed.

## Local integration

- `src/entrypoints/oauth-poc.ts` composes the existing protected app, JWT/JWKS
  verifier, InstrumentService and MemoryInstrumentRepository. A fixed, clearly
  synthetic instrument is seeded per isolate; restarts lose mutations. This PoC
  is not a persistence test or permanent second backend.
- `src/adapters/auth/auth0-poc.ts` validates explicit operator configuration:
  canonical HTTPS Auth0 tenant issuer, same-origin fixed JWKS, separate MCP/REST
  client IDs, exact synthetic owner subject and explicit signed client claim.
  Custom Auth0 domains need separate review; they are not silently inferred.
- Existing scope/audience/owner/signature/lifetime controls are unchanged. MCP has
  only list/get read capabilities. REST read/admin grants remain independent.
  No ingestion grants, authorization server, token route, callback handler, client
  secret, signing key, D1/KV or token persistence is added.
- The dedicated Wrangler config has workers.dev and previews disabled, no routes
  or remote bindings, loopback dev settings and empty configuration. Without a
  valid operator configuration the entrypoint returns sanitized 503. Neither the
  root entrypoint nor its deployment configuration is changed.
- `assessAuth0Discovery` checks an operator-obtained public OIDC document against
  the pinned issuer/JWKS/authorization/token endpoints and advertised code/S256
  support. Advertisements are not enforcement evidence. Registration, grants,
  resource handling and live token profile remain separately unverified.

## Approval package — proposed, not executed

| Item | Proposal / missing input | Status |
| --- | --- | --- |
| Worker | `pea-tracker-oauth-poc`, same codebase, dedicated entrypoint/config | Prepared only |
| HTTPS host | Exact distinct hostname supplied/approved by owner; never current connected MCP host | Missing |
| Auth0 isolation | Owner-selected test tenant or isolated API/apps; exact tenant domain required | Missing |
| Test identities | Synthetic owner + non-owner accounts; exact issuer/sub mapping in protected configuration only | Manual setup required |
| APIs | `https://<approved-host>/mcp` and `/api/v1`; collector not provisioned | Approval required |
| Applications | Separate ChatGPT read, Claude read and optional controlled read/admin clients | Approval required |
| Budget | Proposed €0 recurring, no paid activation/card or automatic fallback | Owner confirmation + entitlements required |
| Exposure controls | Approved platform/persistent abuse controls, bounded traffic and redacted monitoring | Unverified; blocks publication |
| Teardown | Revoke only test grants, remove disposable Worker/apps/identities after separate approval | Not authorized |

No executable remote command is run by this document or the tests. The closed
fixture config must not be turned public until these gates pass. No local
fixed-principal/token fixture may be tunneled. Do not ask for secrets in chat.

## Manual Auth0 verification before publication

1. Verify actual tenant Free entitlements and isolation in the approved dashboard.
   Register API identifiers exactly matching the approved audiences; use RS256,
   maximum 300-second access lifetime and the explicit `azp` or `client_id` profile.
   Confirm the actual access JWT has exactly one audience, required iat/exp/sub/scope
   and the configured client claim. An Auth0 userinfo co-audience will currently
   fail verification; stop for a reviewed profile decision rather than relaxing it.
2. Define MCP scopes `mcp:read` + `portfolio:read`; define separate REST scopes
   `portfolio:read` and `portfolio:admin`. Require per-application grants rather
   than allow-all. Deny MCP applications access to REST/admin, collector and
   unapproved APIs. Worker grant ceilings remain an independent check.
3. Verify the tenant's Resource Parameter Compatibility Profile so native OAuth
   `resource` resolves the intended audience. Never add an audience translation
   proxy or infer it from incoming tokens. The supported dashboard location is
   described in [Auth0's resource guidance](https://support.auth0.com/center/s/article/mcp-audience-error-with-auth0).
4. Prefer pre-registered clients; obtain exact registration/callback values from
   each current client UI. No guessed callback, wildcard or open third-party
   registration. Confirm S256 code flow, issuer callback protection, consent,
   client/redirect/code binding, refresh rotation/expiry/reuse and grant revocation.
   These are Auth0/client responsibilities, not implemented by our resource Worker.
   Configure the exact value actually issued in the signed client claim; do not
   assume a CIMD metadata URL and an Auth0 internal client ID are interchangeable.
5. Review actual public discovery `https://<tenant>/.well-known/openid-configuration`
   and its public keys against `assessAuth0Discovery`. No management token is needed
   for public metadata. Do not follow arbitrary metadata endpoints or record tokens,
   codes, cookies, client secrets, subjects or client IDs in public evidence.
6. Store the operator configuration only in the separately approved protected
   configuration mechanism. The `OAUTH_POC_CONFIG` JSON shape is issuer, origin
   (canonical HTTPS root ending `/`), syntheticOwnerSubject, mcpClientIds,
   restReadClientIds, restAdminClientIds and clientClaim. Empty REST arrays disable
   grants. This PoC requires no client secret in the Worker. Synthetic Auth0 account
   identifiers must still not enter public source/docs. No Wrangler secret command
   is authorized yet; it can create/deploy a remote version.
7. Confirm abuse protection, request budget, safe monitoring and kill switch before
   exposure. Observability is disabled in the closed template to avoid retaining
   URLs/headers before logging review. It is not a production-ready configuration.

Auth0 [per-application access policies](https://auth0.com/docs/get-started/apis/api-access-policies-for-applications)
support separate delegated and machine access; actual tenant entitlement/configuration
has not been observed. Existing cost research is reused, not reconfirmed by a tenant.

## Hosted execution sheet

Run only after exact remote settings, HTTPS publication and traffic bounds are approved.
Create a new connector entry; never edit the existing diagnostic connector.

| Client / cases | Procedure and required assertion | Observed |
| --- | --- | --- |
| ChatGPT A01/A12/A30 | Record client date/version, chosen registration, exact configured callbacks privately; connect approved `/mcp`, complete owner consent, list tools, read seeded instrument, reconnect and refresh | Not run |
| Claude hosted A01/A12/A30 | Separate connector and read-only client; same flow, record exact client edition and callback policy | Not run |
| Claude Code/local A30 | Record selected version and OAuth registration; interactive login/refresh, not merely supplied Bearer requests | Client not yet selected; not run |
| AS A09/A11/A16 | MCP client requests admin scope, REST resource, collector resource, wildcard/increased scopes; no usable forbidden token may be issued | Not run |
| PKCE A13/A14/A15 | Controlled client: S256 success; missing/plain/wrong verifier, wrong state/issuer/client/redirect/resource, expired/stolen code, sequential and simultaneous code reuse denied; concurrent exchange has exactly one success | Not run |
| JWT A05–A08 | Actual issuer-signed expired/wrong-owner/wrong-audience tokens denied by Worker; MCP token cannot write REST, even with broad permissions | Not run with real issuer |
| Refresh A18/A19 | Renewal, rotation, configured overlap/reuse/family revocation observed; revoked grant stops renewal, existing JWT follows approved expiry window | Not run |
| Isolation A27 | Default deployed health/ping and old connector remain intact; no configuration/deployment action targets them | Locally regressed; no remote action taken |
| Teardown | Only approved disposable assets removed/revoked; evidence and residual-window observation recorded | Not authorized/run |

Controlled AS probes must keep code/verifier/refresh/bearer material only in process
memory and approved client storage. Never use command-line bearer literals, verbose
HTTP traces, screenshots of secrets or exported browser sessions. Record only case
IDs, status, redacted outcome and client/build identifiers. Hosted UI success does
not prove hidden negative callback/code checks; controlled AS results do not prove
hosted client internals. Stop on unavailable/paid features; do not change provider.

## Validation

| Check | Observed result |
| --- | --- |
| Host `npm run check` | Strict TypeScript and 250 tests across 18 suites pass |
| Docker `npm run check` | Strict TypeScript and 250 tests across 18 suites pass |
| Final PoC adjustment | All 17 PoC cases rerun successfully on host and Docker; TypeScript rechecked |
| PoC build | Installed Wrangler 4.158.0 dry-run passes; 1554.71 KiB / gzip 275.89 KiB, only empty configuration variable |
| Diagnostic dev/production builds | Both dry-runs pass, unchanged 1495.04 KiB / gzip 259.97 KiB; no bindings |
| Existing contract/regressions | OpenAPI, D1 contracts/migrations/CAS/restart, MCP SDK/workerd and diagnostic tests pass |

The 17 new cases exercise operator configuration, opaque/CIMD client identifiers,
discovery validation, unavailable configuration and real loopback HTTP/official MCP
SDK reads with synthetic signatures. They prove no unauthorized mutation or token
endpoint in the new composition. Existing native workerd tests remain green; the
new PoC entrypoint itself has been bundled and exercised through Node/Hono, not
tested against a real Auth0 tenant in native workerd. Build size is not CPU evidence.

No actual tenant, token issuance, client linking, code exchange, refresh or revocation
has been tested. Hosted-client support for the pinned SDK's `_meta.securitySchemes`
hints remains unverified. The initial sandbox loopback/log-write restrictions were
resolved through normal tool escalation; no permissions/configuration were weakened.
No stage, commit, push, deployment, remote setup or credential access occurred.
