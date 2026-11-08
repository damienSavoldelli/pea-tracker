# Local OAuth security implementation — phases 1 and 2

Owner-authorized local implementation only. Phases 1/2 done; parent milestone remains
in progress because hosted interoperability/recovery phases 3/4 are pending. No
remote Auth0 configuration, cloud resource, deployment, real financial data or Git
write. Existing connected/default Worker still exposes only health and ping.

## Delivered

- Application `authorizeAccess` maps verified subject/client/delegated scopes to
  frozen service capabilities, with separate MCP, REST read/admin and collector
  policies. Stable internal owner identity preserves idempotency scope. Auth0's
  broad permissions array, role headers and tool annotations never grant authority.
- `TokenVerifier` uses existing pinned jose 6.2.15 for RS256 verification, exact issuer
  and single resource audience, exp/nbf/iat/lifetime, allowed header profile and
  explicit client claim. Subject/client/grant ceilings are checked after signature.
  No handwritten cryptographic verifier. No dependency installed or downloaded.
- Configurable trusted JWKS resolver supports cached keys and rotation, rejects
  token-selected key URLs and algorithm confusion, bounds token/key/body sizes,
  timeouts, cache lifetime and failed/unknown-key refresh attempts. Unavailable keys
  fail closed with sanitized 503; unknown keys/invalid tokens receive 401.
- `createProtectedApp(verifier, service)` explicitly injects the REST verifier and
  protects all MCP transport requests. Financial MCP registers only list/get read
  tools over the same InstrumentService, with schema-validated DTO output and
  request-local context; mutations are neither registered nor authorized.
- Separate MCP and REST RFC 9728 discovery documents and Bearer challenges avoid
  cross-resource linking. MCP metadata advertises only read scopes. OpenAPI retains
  existing DTOs/scopes and documents discovery plus authentication-unavailable 503.
- Guarded Node loopback HTTP reuses Host/Origin/cross-site/body/time limits. Native
  workerd uses the installed Miniflare 5 config/manifest API with ephemeral synthetic
  keys, no environment/credential loader, remote binding or persistence. Test-only
  token routes never enter the deployed source composition. Collector HTTP sentinel
  exists only inside a test; no quotation ingestion feature was implemented.
- src/index.ts, root wrangler.jsonc, repository port, D1 adapter and migrations are
  unchanged. Default financial/discovery routes remain 404; ping/health shape stays
  unchanged. No synthetic verifier/key/principal is installed in the default Worker.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run check` on host | Strict TypeScript; 233 passed across 17 suites |
| Docker `npm run check` | Strict TypeScript; 233 passed across 17 suites |
| JWT/policy tests | 40 verifier/JWKS + 8 policy cases |
| Real guarded HTTP | 6 cases: create/read/CAS/replay, denied writes, discovery, outage, collector sentinel |
| Official MCP SDK over HTTP | 4 cases: protected initialization/discovery/read/ping, write exclusion and isolation |
| Native workerd | 2 cases verifying real RS256/JWKS, HTTP denial and SDK workflows |
| Existing regressions | All prior 171 cases retained; 2 extra default-metadata absence checks |
| Offline OpenAPI | Contract suites and real HTTP response assertions pass, including discovery and 503 |
| Dev/production dry-run | Both pass without bindings; no deployment |

Keys are ephemeral process-generated synthetic keys, never production exports.
Tests use controlled time for JWTs. Servers/runtimes close after tests. Real OAuth
code/PKCE/refresh behavior is not simulated as successful provider evidence.

## Remaining integration and release gates

1. **Actual Auth0 profile:** configure approved issuer/JWKS, exact owner subject,
   stable internal owner ID, signed client claim and separate audience/client grants.
   Current local profile intentionally rejects multiple audiences; confirm the real
   Auth0 profile or review any narrowly allowed standard co-audience. No generic
   audience fallback or permissions-to-admin mapping is acceptable.
2. **Hosted OAuth:** resource compatibility, real metadata, client registration,
   callback issuer/state, S256/code single-use, refresh rotation/revocation and
   ChatGPT/Claude linking require phase-3 approval and a separate HTTPS synthetic
   instance. The SDK emits tool security hints under `_meta.securitySchemes`; actual
   hosted-client acceptance of the pinned SDK metadata remains unverified.
3. **Revocation:** five-minute maximum access lifetime plus 30-second tolerance is
   enforced locally. Bearers remain reusable until expiration. No immediate JWT
   revocation store, refresh-token handling or authorization server was implemented.
   Private-data release needs explicit acceptance or an authoritative state design.
4. **Operations:** owner assurance/recovery, tenant entitlements/costs, production
   CPU/latency, trusted JWKS rotation and persistent/platform abuse controls remain
   gates. Local unknown-key cooldown is not a distributed rate limiter. Error status
   429 is available in the error vocabulary, but no production rate-limit mechanism
   or 429-producing platform binding is configured.
5. **JWKS availability:** cached known keys are used only within the bounded cache
   lifetime; failed refreshes have a cooldown. Concurrent cold fetches receive 503
   rather than sharing workerd I/O across requests. This is fail-closed local behavior,
   not measured production high-load availability or global key-revocation evidence.

No phase-3/4 resource, existing endpoint cutover, real-data introduction, staging,
commit or push follows automatically from this local implementation.
