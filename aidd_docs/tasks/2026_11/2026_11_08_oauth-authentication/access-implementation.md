# Access Managed OAuth PoC — local integration

Owner decision, 2026-11-09: Zero Trust Free is active and Managed OAuth Beta is
available in the dashboard (owner-reported). Auth0 testing is suspended. Local
Access implementation is authorized. The owner subsequently approved and completed
only the initial closed deployment; activation with Access variables remains gated.

## Delivered boundary

- `AccessAuthenticator` validates RS256 signatures through the existing bounded
  JWKS provider, with pinned team issuer and `/cdn-cgi/access/certs`, exact single
  application AUD tag, required app-token type, subject, issued-at, expiry and
  not-before when present. Clock tolerance is 30 seconds. Unknown keys/signatures
  fail 401; unavailable trusted keys fail 503; valid non-owner subjects fail 403.
- Only `Cf-Access-Jwt-Assertion` is accepted. Bearer tokens, email/role headers and
  request-selected key URLs never grant identity. Pin the Access subject of the
  approved synthetic owner, not an email substring/domain or an unverified header.
- The resulting frozen Principal has only `instruments:read`. This is an explicitly
  owner-approved server capability for this read-only PoC, not proof of delegated
  OAuth scopes or client identity. No azp/scope is invented. MCP tool OAuth hints
  use an empty scope list on this composition; the old JWT composition retains its
  existing scopes and checks. Access handles edge discovery, DCR, callbacks and
  opaque token exchange. The Worker does not mount competing discovery metadata.
- `src/entrypoints/access-poc.ts` seeds one clearly synthetic instrument in Memory
  and mounts only protected MCP and diagnostic health. No REST instrument/admin,
  ingestion, token issuance or authorization-server route. A token from this Access
  application never grants REST/collector permissions. Memory resets per isolate.
- The dedicated `pea-tracker-oauth-poc` Wrangler template selects the Access
  entrypoint and prepares workers.dev exposure, previews disabled, no D1/KV/remote
  binding and no embedded account identifiers or credentials. Missing configuration
  fails 503; missing/invalid assertion cannot fall back to public diagnostic MCP.
- The root Worker entrypoint/configuration, repository ports, D1 adapter/migrations
  and shared financial services are unchanged. No dependency added or installed.
  The Auth0 code/tests remain available as a separate, inactive composition.

## Operator configuration (not populated or uploaded)

Provide these three Worker secrets together in a private, ignored JSON file named
`.env.access-poc.json` at the repository root. This private file was prepared
separately and remains ignored with permissions 0600. The versioned
[example](../../../../.env.access-poc.example.json) contains placeholders only;
copy it only when the private file does not already exist, then replace the values
locally and apply `chmod 600 .env.access-poc.json`.
Use JSON rather than dotenv to avoid variable interpolation. Never commit the file,
copy its values into public evidence or send credentials/tokens in chat.

| Variable | Required value |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | Exact issuer `https://<team>.cloudflareaccess.com`, without trailing slash |
| `ACCESS_AUD` | Exact 64-character lowercase hexadecimal AUD tag of the dedicated Access application; not the old Auth0 audience URL |
| `ACCESS_OWNER_SUB` | Exact signed Access subject of the authorized synthetic owner in that team |

The MCP URL remains `https://pea-tracker-oauth-poc.damien-savoldelli.workers.dev/mcp`.
It is a resource URL, distinct from the Access JWT AUD tag. Grant only the approved
synthetic account in Access; configure exact client callback allowlists and disable
unneeded localhost/loopback registrations. Use short OAuth access lifetime (proposed
5 minutes) and bounded grant lifetime. Observe actual assertion/session expiry and
refresh/revocation behavior; offline verification is not immediate revocation.

Before functional publication, approve/configure an Access application covering this PoC
hostname in the same account, owner-only login, Managed OAuth, callback allowlists,
traffic/abuse bounds and safe logs. Check every alternate hostname/preview remains
protected or disabled. Keep existing DEV/production Access and connector settings
unchanged. An Access bypass must never be used to make the connector work.
The current template disables observability pending redaction review; enable only
approved safe monitoring, without headers/tokens/identity or financial payload logs.

## Deployment sequence — initial closed deployment completed, activation pending

Initial setup found only the DEV Worker selectable in Access. The first closed
deployment has since created the PoC Worker. Provisioning has two separately
approved steps; never select or modify the DEV Worker to bypass this dependency.

### 1. Create the unavailable PoC Worker, without Access variables

```sh
npx wrangler deploy --config tests/fixtures/wrangler.oauth-poc.jsonc
```

This first deployment creates only `pea-tracker-oauth-poc` in the approved account.
Its workers.dev address is reachable but every Worker route returns sanitized,
non-cacheable 503 because configuration is absent. No MCP tools, health response
or synthetic financial record is served. Do not upload any Access variables yet.
The first deployment needs explicit approval even though the app is unavailable.
Ensure the selected account matches the dashboard's Zero Trust organization.

### 2. Create/configure Access, then activate the protected PoC

After the first Worker exists, refresh Access controls > Applications > Create
self-hosted application > Workers and select only `pea-tracker-oauth-poc`. These
remote configuration steps also require approval:

1. Protect the PoC Worker (all associated hostnames) with a policy allowing only
   the synthetic owner account; leave DEV and account-wide defaults unchanged.
2. Enable Managed OAuth Beta, configure exact ChatGPT/Claude callbacks, short
   access lifetime and bounded grant lifetime; do not broadly allow localhost,
   loopback or wildcard redirects just to make a client connect.
3. Obtain the team issuer and new Access application AUD tag from its settings.
   Obtain the synthetic owner's stable Access subject from the approved private
   Access user/identity interface; if unavailable, arrange a controlled identity
   verification step rather than disabling the subject check or exporting a token.
4. Put the three values in the ignored private JSON file described above. Review
   exposure/abuse/logging controls and confirm the Access application is active
   before requesting the second deployment. No real identities or data are used.

Installed Wrangler help confirms `--secrets-file` uploads secrets with the same
Worker version. This avoids a separate `secret put` operation/deployment.

```sh
npx wrangler deploy --config tests/fixtures/wrangler.oauth-poc.jsonc --secrets-file .env.access-poc.json
```

Target: only `pea-tracker-oauth-poc`, workers.dev enabled after approved deployment;
no default DEV Worker or database operation. Approve the exact Cloudflare account,
Access configuration, variable provisioning and publication before running it.
No client-supplied assertion, fixed principal or test token endpoint is shipped.

After activation, unauthenticated remote MCP requests should receive the Access
OAuth challenge; owner login and read-only tool calls should succeed. Non-owner,
wrong/expired/forged assertion and REST mutation checks must remain denied. Record
real ChatGPT/Claude linking and refresh separately from the local synthetic tests.

## Validation and outstanding evidence

Tests cover missing/malformed/oversized assertions, wrong signatures/issuer/audience,
extra audiences, expired/future/missing claims, non-owner, forged email headers,
unsafe/unknown keys, bounded JWKS outage, fixed least-privilege Principal, real HTTP
and official MCP SDK reads/denials, native workerd crypto and absent REST routes.
All keys and assertions are generated synthetic fixtures; native test token helpers
are bundled only by the loopback test harness, never by the deployment entrypoint.

| Final local check | Result |
| --- | --- |
| Host `npm run check` | Strict TypeScript; 284 tests pass across 19 suites |
| Docker `npm run check` | Strict TypeScript; 284 tests pass across 19 suites |
| Access-specific suite | 34 cases, including real loopback HTTP, official MCP SDK and native workerd |
| REST/OpenAPI and D1 regressions | Existing contract/migration/atomicity/restart suites pass |
| PoC Worker dry-run | Pass; 1548.05 KiB / gzip 274.16 KiB; no bindings without operator secrets |
| Diagnostic dev and production dry-runs | Both pass; 1495.22 KiB / gzip 260.00 KiB; no bindings |

Bootstrap preparation follow-up: expanded the missing-configuration test across
GET/POST for MCP, instruments, health and AS discovery; all return non-cacheable
503 without serving synthetic data. Rechecked 43 Access/default-Worker cases,
strict TypeScript and the PoC dry-run successfully. No application code changed in
this follow-up; preceding full host/Docker evidence remains applicable to unaffected
behavior. The bootstrap deployment was subsequently authorized and executed on
2026-11-09; observed GET `/`, GET/POST `/mcp`, GET `/api/v1/health`, GET instruments
and GET AS discovery all returned 503 `poc_unavailable` with `Cache-Control: no-store`.
The DEV deployment version was unchanged before/after. Owner subsequently reported
the dedicated owner-only Access application and Managed OAuth enabled. No activation
deployment or hosted client OAuth success is claimed. No private configuration
values, account IDs or tokens are recorded here.

Hosted Access, ChatGPT, Claude, PKCE, refresh and revocation remain untested: local injected assertions
simulate the edge-to-Worker boundary only. No claim of completed phase 3 is made.

Sources reused: [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
and [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
