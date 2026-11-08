---
objective: "Validate a single-owner OAuth authorization boundary for shared REST/MCP services using synthetic data, without changing the connected diagnostic Worker."
status: pending
---

# Plan: OAuth authentication and authorization

Source: owner's OAuth evaluation/resume request, baseline 7668ad9,
[technical evaluation](evaluation.md), [authorization matrix](authorization.md),
[threat model](threat-model.md), [cost assessment](costs.md),
[acceptance strategy](acceptance.md) and the approved architecture in
[INSTALL.md](../../../INSTALL.md).

Planning only. Auth0 is the proposed first PoC candidate, not an approved production
selection. The completed documentation research does not establish a working OAuth
connection. All phases require implementation approval; phase 3 additionally needs
specific remote-setting/resource/deployment approval. No dependency installation,
cloud changes, endpoint change, real data or Git writes are authorized now.

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Freeze policy and diagnostic regression safety net | [phase-1.md](phase-1.md) | none |
| 2 | Implement isolated local verification and protected composition | [phase-2.md](phase-2.md) | 1 |
| 3 | Verify real provider and hosted-client interoperability | [phase-3.md](phase-3.md) | 1, 2 |
| 4 | Validate recovery, costs and release readiness without cutover | [phase-4.md](phase-4.md) | 1, 2, 3 |

## External sources

| URL | What it settled |
| --- | --- |
| https://developers.openai.com/plugins/build/auth | Discovery, resource binding, client registration, PKCE and linking hints |
| https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization | Current protocol authorization requirements; installed SDK compatibility remains a gate |
| https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp | Hosted connector network and client registration choices |
| https://auth0.com/docs/get-started/apis/api-access-policies-for-applications | Explicit per-application grants instead of broad delegated access |
| https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens | Resource-server token validation responsibility |
| https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/resource-servers.md | Same-Worker provider composition is possible |
| https://github.com/cloudflare/workers-oauth-provider/blob/main/src/ema/jti.ts | Default KV replay protection is best effort |
| https://auth0.com/pricing | Dated feature/price comparison, subject to actual tenant verification |

Further source links and their uncertainties are preserved in evaluation.md and costs.md.

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| Architecture | One Worker codebase, shared services and unchanged repository port. Auth0 externally hosts identity; Worker verifies resource-specific access | 1, 2 |
| Runtime | Installed SDK 1.32.2/Hono 4.13.16 and Web-standard authInfo inspected. Audited verifier/workerd compatibility and newer auth metadata remain unverified | 2, 3 |
| Authorization | Existing instrument read/admin service checks reusable. Current OpenAPI external scopes are portfolio:read/admin; new audience/client boundary is required | 1, 2 |
| Regression | High security impact: MCP currently has no verifier and REST uses injected principals. Preserve default health/ping, SQL/CAS/idempotency and denial-before-repository tests | 1, 2, 4 |
| Persistence | No OAuth change to instrument migrations. Stable internal owner subject must preserve durable replay scope. Immediate access revocation would need a separate state design | 1, 4 |
| Infrastructure | No KV required for Auth0 JWT verification alone. Actual client PoC needs an explicitly approved separate HTTPS test instance and tenant configuration | 3 |
| Contract | Add reviewed discovery/challenges and applicable 429/503 errors; retain financial DTOs and capability vocabulary | 2 |
| Security/recovery | Short bearer lifetime is proposed, not immediate revocation. Assurance, recovery, quota and abuse mechanisms need observed evidence | 1, 3, 4 |
| Documentation | Only these planning artifacts change now; implementation later updates evidence, OpenAPI and relevant architecture/testing memory after approval | 1, 2, 3, 4 |

## Rules

| Rule | Why it applies |
| --- | --- |
| Planning only in this turn | No OAuth code, dependency, database or remote operation |
| Preserve connected/default Worker | src/index.ts/root wrangler.jsonc and current MCP URL remain unchanged |
| Deny by default at adapter and service | Scope/tool annotations/hidden URLs are not authorization |
| Separate owner and machine policy | MCP reads cannot become administration or ingestion |
| Synthetic-only PoC | OAuth success does not satisfy real-data correctness/recovery/privacy gates |
| Explicit resource/cost/deployment approval | Plan approval does not authorize tenant settings or public hosting |
| No Git writes or credential access | No staging/commit/push, hooks, Wrangler token reads or extraction |

## Decisions

| Decision | Why |
| --- | --- |
| Proposed: Auth0 first, Provider retained as fallback | Lower identity/consent/recovery ownership; actual client, feature and cost gates still open |
| Proposed: three resource audiences and client ceilings | Read delegation cannot be reused on administrative REST or collector boundaries |
| Proposed: existing portfolio scopes mapped to domain capabilities | Avoid changing existing OpenAPI vocabulary or coupling domain services to OAuth |
| Proposed: five-minute access TTL plus at most 30-second tolerance | Bounds ordinary bearer exposure; owner must approve residual window or require authoritative revocation state |
| Proposed: protect whole PoC MCP transport | Avoid anonymous JSON-RPC dispatch exceptions; connected public ping remains on its existing unchanged deployment |
| Proposed: isolated test instance of same codebase | Hosted clients cannot be proved through loopback; no permanent second financial backend or cutover |
| Deferred: final provider/private-data release | Await phase 3/4 evidence and explicit owner decision; no automatic paid fallback |
