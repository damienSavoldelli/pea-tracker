# Proposed authorization contract

Status: pending owner approval. Scope names preserve the existing OpenAPI vocabulary.
This contract describes future enforcement; it does not expose any route today.

## Resources and clients

Use exact configured HTTPS resource identifiers per environment. Illustrative
non-routable placeholders only:

| Resource | Proposed audience | Eligible client class |
| --- | --- | --- |
| MCP | `https://pea-auth-poc.example.invalid/mcp` | Approved ChatGPT/Claude read clients |
| REST | `https://pea-auth-poc.example.invalid/api/v1` | Separate owner read/admin clients |
| Collector | `https://pea-auth-poc.example.invalid/api/v1/quotations/ingest` | Dedicated approved machine client only |

The collector path is a proposed future boundary, not an implemented quotation API.
Each client has an explicit resource/grant ceiling at the authorization server AND
the Worker. MCP clients receive no REST/collector grant, even when the same person
also owns the admin client. DCR/CIMD registration is not authorization to obtain data.
Prefer pre-registering approved clients; enable bounded DCR only if a verified client
requires it. Unapproved registrations never gain admin or ingestion scopes.

Configure Auth0 per-app API policies/grants rather than its permissive user-delegated
defaults. Confirm this works for pre-registered third-party clients in the actual
tenant. Do not enable general client access to the administrative API to make MCP
linking succeed. If automated registration needs a grant-approval workflow, keep it
pending/read-only and test that workflow explicitly.

## Access matrix

All rows except diagnostics/discovery require a validated token and the indicated
owner or machine identity. Scope strings are exact, case-sensitive space-delimited
values. No substring, wildcard, role-header or tool-annotation authorization.

| Surface | Audience | Required delegated scopes | Server-side capability and ceiling | Denied |
| --- | --- | --- | --- | --- |
| GET/HEAD `/api/v1/health` | None | None | Existing public metadata only | No private data, auth state or dependency secrets |
| Existing deployed `/mcp` diagnostic mode | None | None | Existing ping only, unchanged | No financial tools mounted |
| Public resource discovery | None | None | Minimal issuer/resource/read-scope metadata | No owner identifiers or credentials |
| Protected MCP financial reads | MCP | `mcp:read` AND `portfolio:read` | Map only to instruments:read initially; every tool calls a read service | Every mutation, ingestion, admin grant and unapproved tool |
| REST instrument GET/list | REST | `portfolio:read` | instruments:read | Admin-only token does not implicitly gain read |
| REST instrument POST/PATCH | REST | `portfolio:admin` | instruments:admin plus existing validation/idempotency/If-Match | MCP, read-only, collector and unapproved admin clients |
| Future quotation ingestion | Collector | `quotes:ingest` | Dedicated ingestion capability; instrument allowlist, bounded payload/time window | Portfolio reads, holdings, PRU, ledger, instrument administration |

Future financial capabilities need explicit mappings; portfolio:read is not blanket
permission for every newly added service. Keep the domain Permission type limited to
implemented capabilities. Exercise collector policy with a test sentinel; do not
implement a financial ingestion API or collector job in this milestone.

## Verification and Principal construction

1. Accept one bounded Authorization Bearer token over HTTPS. Reject ambiguous headers,
   token query parameters, cookies-as-API-credentials and client-selected identities.
2. Use an approved audited JWT verifier with Web Crypto support. Pin trusted issuer,
   HTTPS JWKS URI and allowed asymmetric algorithm/profile; never discover JWKS from
   an unverified token's issuer, jku or x5u. Reject unsigned/algorithm-confusion tokens.
3. Validate signature, exact issuer, expected resource audience, expiry and not-before
   with a proposed maximum 30-second clock tolerance. Reject ID tokens, foreign APIs,
   userinfo-only tokens and unsupported profiles. Do not use OAuth login alone as API
   authorization. Test aud string/array handling: require the exact target identifier,
   reject additional PEA resource audiences; explicitly validate any provider-standard
   co-audience rather than using prefix/host matching.
4. Check the signed client identifier specified by the selected Auth0 token profile
   (verify azp/client_id semantics during PoC) against resource-specific configuration.
   Derive human access from exact approved `(issuer, sub)`, never email/domain alone.
   Reject subject mismatch even for a verified email or successfully authenticated user.
   Machines use a separate issuer/client/subject policy and never pass the owner rule.
5. Compute capabilities from delegated `scope` intersected with owner/machine policy,
   approved client ceiling and resource policy. Never copy the optional Auth0
   `permissions` array wholesale. Admin permissions cannot emerge from MCP mappings,
   even if a token unexpectedly contains an admin scope or broad permissions array.
6. Construct an immutable request-local Principal with a stable internal owner ID,
   e.g. `owner:synthetic-owner-id` in tests, within the existing 128-character bound.
   Keep issuer/client/authentication details in trusted adapter context; business
   services receive capabilities, not tokens or Hono/MCP objects. No cross-request
   global Principal or shared mutable MCP authorization context.
7. Enforce at routing and service entry points. Verify/authenticate before financial
   repository access. No internal REST call, upstream token passthrough or OBO flow.

Map external identity to an internal owner ID once; keep it stable across refresh,
signing-key rotation and separately approved identity recovery. Durable idempotency
is already scoped by subject/operation/key. Do not reset that scope by using an access
token, client ID or newly changed external subject. Keep synthetic and later real
environments separate; do not silently migrate their receipts.

## Discovery and MCP modes

For the protected PoC publish RFC 9728 metadata at
`/.well-known/oauth-protected-resource/mcp`, with resource exactly equal to the MCP
audience and authorization_servers containing the exact trusted AS issuer. A root
alias may point to the same metadata if required by a tested client. Advertise only
minimal MCP read scopes, never administrative/collector grants.

Missing/invalid credentials receive 401 with a Bearer `resource_metadata` challenge;
insufficient delegated permissions receive 403 with an appropriate insufficient_scope
challenge. No financial response accompanies either. Maintain discovery through the
router without passing it to the MCP transport. Advertised AS endpoints come from
validated configuration/metadata, with S256 and actual accepted client-auth methods.
Require resource binding in authorization and token requests, exact redirect matching,
PKCE and issuer-response validation. Clients own state/verifier handling; the AS owns
code binding/consumption. Test these responsibilities rather than implementing a
second authorization server inside the Auth0 resource server.

Protect the entire PoC `/mcp` transport before protocol handling, including initialize,
tools/list, notifications and tool calls. This avoids parsing JSON-RPC to select an
anonymous security exception. Tool metadata declares OAuth read requirements and
callbacks recheck trusted context; `_meta` authentication hints support the tested
OpenAI flow without exposing tokens. Ping can exist behind that protected PoC mode.
The existing connected diagnostic Worker retains its anonymous ping behavior and URL.
A future financial `/mcp` cutover is a separate approval; this plan does not change it.

## Token lifetime, refresh and revocation decision

**Proposed PoC policy:** access tokens live at most five minutes, with at most
30 seconds of verifier clock tolerance. Prove the issued iat/exp lifetime matches
configuration and reject unsupported longer-lifetime profiles. Request refresh only
where needed, using provider rotation, finite absolute/idle expiration and family
reuse detection. Exact refresh lifetimes/retry overlap need an approved client test.
The Worker never stores or logs client refresh tokens.

Ordinary bearer access tokens are reusable. A stolen valid token may work until
expiry under offline JWT verification; disconnecting a connector, logout, or revoking
a refresh token does not make that access token immediately invalid. The proposed
residual window is up to 330 seconds after issuance, not a promise of instant logout.
The owner must explicitly accept this before private-data release. Tests of a
revoked refresh token must fail renewal; existing access-token tests follow the
approved residual-window policy instead of expecting impossible offline revocation.

If immediate rejection of already-issued access tokens is required, stop and plan
an authoritative per-request revocation/owner-epoch check, fail closed on state
failure, and test persistence/concurrency. This would add a storage/resource and
cost decision, potentially D1/strongly consistent coordination. An isolate cache or
eventually consistent KV entry does not establish immediate global revocation.
Do not provision such a store or claim immediate guarantees in this increment.

Emergency procedures disable issuance/refresh and private composition, revoke
grants, rotate affected credentials, and account for surviving access-token lifetime
and configuration propagation. A deployment/configuration kill switch is useful
but is not an independently proven instantaneous revocation mechanism.

## Errors, origins and availability

- Invalid/missing/wrong-resource token: 401. Valid token denied by scope/client/owner
  policy: 403. Use uniform errors that do not reveal which owner account exists.
- Verifier dependency unavailable without a usable trusted cached key: proposed 503,
  fail closed and no repository access. Bound JWKS size/redirects/fetch timeout,
  unknown-kid refreshes and cache age; never fetch for every random kid without limits.
  Valid known cached keys may continue only within the approved cache/rotation policy.
- Platform/persistent abuse limits: proposed bounded 429. Do not rely on an in-memory
  per-isolate counter; exact protection mechanism/cost must be verified before exposure.
- Preserve Origin/body limits, no-store/nosniff, safe request IDs and no permissive
  CORS. An absent Origin is not authentication. If an actual browser client needs an
  origin, approve an exact allowlist; do not loosen checks to make a test pass.
- New 429/503 responses and auth headers require reviewed OpenAPI/error updates;
  existing financial DTOs, ETags, pagination and repository signatures stay intact.
