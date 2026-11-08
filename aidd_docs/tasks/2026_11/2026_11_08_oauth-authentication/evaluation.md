# OAuth technical evaluation

Research date: 2026-11-08. Status: recommendation for review, not provider selection.
Source: owner's OAuth milestone and resume instructions; baseline commit 7668ad9.
This document reuses the interrupted run's completed official-source research and
two independent provider investigations. No OAuth planning artifact had been saved.

**Recommend Auth0 for the first synthetic PoC.** It removes more identity, login and
recovery implementation work than Workers OAuth Provider. Keep one Worker codebase
with Hono, the MCP SDK and shared application services. Auth0 is an external identity/
authorization service, not a second PEA Tracker backend. Selection depends on the
gates below; neither client interoperability nor a zero-cost production setup is proven.

Companion documents: [authorization](authorization.md), [threat model](threat-model.md),
[costs](costs.md), [tests](acceptance.md), [implementation plan](plan.md).

## Evidence classification

- **Observed repository evidence:** files inspected locally; no runtime change made.
- **Documented:** official sources checked in the interrupted run on the research
  date. This establishes described behavior, not account-specific availability.
- **Proposed:** our architecture/policy choice; needs owner approval.
- **Unverified:** requires implementation, tenant access, live clients or measurement.
  No live OAuth flow was tested. The existing 171-test evidence concerns the prior
  financial/D1 implementation; those tests do not establish OAuth correctness.

## Comparison

| Criterion | Workers OAuth Provider | Auth0 |
| --- | --- | --- |
| Responsibility | Authorization framework operated by us; login, upstream identity, owner check and consent remain project work | Hosted authorization server and identity/login/recovery capabilities; application owner restrictions remain ours |
| One Worker | Supports same-Worker authorization/resource roles and Hono; separate Workers are optional | Worker remains resource server; identity hosted in an external tenant; no extra application Worker needed |
| Discovery and clients | Documents AS/resource metadata, pre-registration, CIMD and optional DCR | Native MCP support and resource compatibility profile; pre-registered CIMD; dynamic CIMD availability depends on tenant entitlement; DCR supported |
| Interactive flow | Authorization code; public-client S256 enforced; propose S256 for all interactive clients | Authorization code + PKCE; third-party public-client security controls; verify actual configuration for each client |
| Audience/token checks | Resource-bound tokens and provider token validation; application must enforce scope/owner policy | Worker validates signed access JWT against trusted issuer/JWKS, exact route audience and delegated scope |
| Refresh/revocation | Rotating refresh with documented predecessor retry behavior; KV propagation affects global guarantees | Rotation/reuse detection; revoking refresh/logout does not invalidate existing self-contained access JWTs |
| Replay correctness | KV lacks CAS; documented JTI protection is best effort; concurrent code consumption needs proof | Hosted AS owns code consumption; still require actual concurrent code/reuse tests; bearer tokens remain reusable |
| REST/admin/collector | Custom resource/scope/client policies and collector lifecycle integration | Separate API audiences and client grants; M2M collector; per-app issuance restrictions plus Worker policies |
| Infrastructure | OAUTH_KV plus upstream identity; stronger replay/state solution may add infrastructure | Tenant plus trusted JWKS configuration; no KV merely for JWT verification; immediate local revocation would add state |
| Maintenance | More security-sensitive code, KV semantics, consent pages, identity integration and upgrades | Tenant configuration, owner/client policies, JWKS lifecycle, vendor dependency and plan monitoring |
| Recurring cost | Potential $0 within Workers/KV plus upstream identity allowances; more owner-operated work | Potential $0 on Free if all required features qualify; paid features may invalidate €0 target |
| Recommendation | Fallback; first resolve identity and atomic replay/consistency gates | Preferred PoC candidate; conditional on entitlements, assurance, revocation and real client evidence |

Provider documentation now explicitly supports same-Worker composition; a separate
service is not mandatory. It also distinguishes advertised scopes from enforcement:
the handler must check the authenticated context. [Provider composition](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/resource-servers.md),
[authorization server](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md).
The inspected `main` package declares 1.2.4; this is not proof of a published npm
release. Pin and review an approved release if this route is selected. [Package source](https://github.com/cloudflare/workers-oauth-provider/blob/main/package.json).

Auth0's current MCP support includes a resource-parameter compatibility profile;
do not build an audience-translation proxy based on older guidance. October's
announcement distinguishes manual CIMD registration from dynamic CIMD Early Access.
Use approved pre-registration first; do not require Early Access as a hidden dependency.
[MCP GA announcement](https://auth0.com/blog/auth0-auth-for-mcp-servers-generally-available/),
[resource configuration](https://support.auth0.com/center/s/article/mcp-audience-error-with-auth0),
[CIMD configuration](https://auth0.com/docs/get-started/auth0-overview/create-applications/register-applications-with-cimd),
[CIMD availability update](https://auth0.com/blog/scaling-ai-agent-identity-cimd-application-profiles/).

## Important security differences

Auth0's optional `permissions` claim may contain all user permissions. Delegated
`scope` is a different boundary. Never turn all listed permissions into a Principal:
apply delegated scope, verified client ceiling, resource policy and owner policy.
Free-plan design must not depend on paid role management; explicit Worker policies
and provider client grants are sufficient concepts, subject to entitlement testing.
[RBAC/token behavior](https://auth0.com/docs/get-started/apis/enable-role-based-access-control-for-apis),
[application API access policies](https://auth0.com/docs/get-started/apis/api-access-policies-for-applications).

Provider's default replay-marker source explicitly warns that concurrent requests
can both succeed because KV has no compare-and-set. Authorization-code processing
also uses separate KV read/save operations; exactly-once concurrent consumption is
not established by inspection. KV consistency means broad claims of immediate global
revocation are unsafe. This is a selection gate, not a claim of a demonstrated exploit.
[Replay implementation](https://github.com/cloudflare/workers-oauth-provider/blob/main/src/ema/jti.ts),
[provider implementation](https://github.com/cloudflare/workers-oauth-provider/blob/main/src/oauth-provider.ts),
[KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

Auth0 JWT validation does not consult current revocation state by itself. Refresh
revocation and logout stop different parts of the lifecycle; existing access tokens
can remain valid until expiry. Our proposed short lifetime and the alternative
authoritative revocation gate are explicit in authorization.md.
[Access-token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens),
[logout and access tokens](https://support.auth0.com/center/s/article/Invalidate-the-API-token-after-user-logout),
[refresh rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation),
[refresh revocation](https://auth0.com/docs/secure/tokens/refresh-tokens/revoke-refresh-tokens).

## Connector compatibility

OpenAI documents protected-resource metadata, AS discovery, resource indicators,
S256 PKCE and CIMD/DCR/predefined clients. It also documents issuer identification
for callback protection and tool-level authentication hints. Pre-register the exact
client/redirect information shown by the actual connector management interface;
do not copy a guessed universal callback URL. Declare read-only OAuth tool policies
and return appropriate challenges; metadata alone never authorizes a tool.
[OpenAI authentication](https://developers.openai.com/plugins/build/auth).

Claude's hosted remote connectors offer published identity, automatic registration
or an explicitly configured client. Their network requests originate in Anthropic's
cloud, including the hosted connector experience in Desktop. Claude Code/local SDK
clients are a separate test target; the Claude Messages API connector expects an
already-obtained token rather than proving a browser login flow.
[Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[Claude API MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector).

The latest MCP authorization specification observed is 2026-07-28; it favors CIMD,
retains pre-registration and deprecates DCR for compatibility. It references an OAuth
2.1 draft: do not advertise certification against a finalized OAuth 2.1 RFC.
The installed SDK 1.32.2 reports latest protocol 2025-11-25 and supports older
negotiated versions. Current discovery/client requirements and installed SDK behavior
therefore require a compatibility gate, not an automatic SDK upgrade.
[Current authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

## Repository assessment and proposed changes

| Observed file/boundary | Reuse or necessary future change |
| --- | --- |
| `src/application/authorization.ts` | Reuse requirePrincipal/requirePermission and existing instrument capabilities; add verified-context mapping before constructing a Principal |
| `src/application/instruments.ts` | Reuse read/admin checks at every service entry; no OAuth or SQL enters business services |
| `src/adapters/rest/instruments.ts` | Inject real verifier through existing authenticate hook; retain auth-before-repository order, body/Origin limits, ETags and idempotency |
| `src/app.ts` | Add explicit protected composition and public discovery handler; default createApp() stays diagnostic-only |
| `src/adapters/mcp/handler.ts` | Preserve diagnostic mode; separate protected mode verifies token before protocol processing, passes request-local context to read handlers, adds discovery/tool auth hints |
| SDK Web-standard transport declaration | handleRequest supports authInfo; integration with pinned Hono/SDK and tool metadata remains untested |
| `src/index.ts` and `wrangler.jsonc` | Keep connected/default deployment unchanged in this milestone; a PoC entrypoint/config is separately approved and never uses fixture principals remotely |
| `src/application/errors.ts`, REST error titles and OpenAPI | Plan bounded auth-unavailable 503 and abuse-limit 429 responses where used, discovery/challenges and OAuth descriptions; preserve business DTOs and repository signatures |
| Existing OpenAPI `x-required-scopes` | Retain portfolio:read/portfolio:admin; map to instruments:read/instruments:admin rather than silently replacing the scope vocabulary |
| Memory/D1 repositories and SQL migrations | Unchanged by OAuth. Preserve stable internal subject identity for durable idempotency; do not key receipts by tokens, client IDs or raw issuer+subject concatenation |

Auth0 route does not require our Worker to host authorization/token endpoints or
store refresh tokens. No OBO/token exchange, MCP-to-REST HTTP, Node Express OAuth
middleware or new identity database is needed for this topology. An audited Workers-
compatible JWT verifier dependency is a future approval item, not an installation now.

## Unresolved gates and recommendation boundary

1. Owner approves candidate, scope/audience/client policy, identity assurance and
   revocation semantics; all remain proposals until then.
2. Confirm actual tenant Free entitlements: native resource handling, manual client
   registration, client grants, strong owner authentication and recovery. No tenant
   or subscription was inspected; advertised availability is not proof for this account.
3. Demonstrate ChatGPT and the chosen Claude clients on a separately approved HTTPS
   PoC; test discovery, resource/audience, PKCE, refresh and issuer callbacks.
4. Prove negative authorization and recovery cases, JWKS rotation/outage behavior,
   Workers CPU, quotas and abuse controls. Existing ping and local tokens prove none
   of these hosted-client properties.
5. If a gate fails, return to this comparison. Do not add an OAuth translation proxy,
   select paid features, weaken checks or switch providers without review.

Only new AIDD planning artifacts are written. INSTALL, memory, OpenAPI, application
code, connected MCP and cloud settings remain unchanged pending approval.
