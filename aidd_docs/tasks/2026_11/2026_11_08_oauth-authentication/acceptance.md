# OAuth acceptance criteria and test strategy

Status: tests to implement after approval. None is claimed as executed by this
planning exercise. Existing host/Docker 171-test evidence is the pre-OAuth baseline.

## Test layers and honest evidence boundaries

| Layer | Setup | What it establishes | What it cannot establish |
| --- | --- | --- | --- |
| Unit/policy | Ephemeral synthetic signing keys, signed tokens, controlled clock, local JWKS fixture, sentinel repository | Cryptographic validation, capability mapping, cache/error behavior and no unauthorized repository call | Real AS behavior, hosted client login, distributed revocation |
| Real local HTTP/workerd | Explicit loopback-only protected composition; same Hono/SDK, synthetic repository and verifier | Discovery/challenges/REST/MCP routing and request-local context with native Worker compatibility | ChatGPT/Claude cloud reachability or real Auth0 code issuance |
| Hosted synthetic PoC | Separately approved HTTPS instance of same codebase plus Auth0 test configuration | Actual provider/client OAuth, PKCE/resource/issuer/refresh and negative flows | Real-data readiness, backups, production load or account recovery until separately rehearsed |
| Release regression | Original default app plus all old/new suites, Docker and dry-run builds | Diagnostics, instrument contract, D1 concurrency/restart and synthetic isolation preserved | A deployment or private-data release authorization |

Local token fixtures use ephemeral test-only keys generated in process. No production
keys, copied browser tokens, credentials, portfolio data or Wrangler authentication
files belong in tests. Redacted test outcomes and metadata may be recorded; bearer
headers, codes, verifier secrets, cookies and client secrets must never be artifacts.

## Required cases

| ID | Trigger/action | Expected observation | Evidence layer |
| --- | --- | --- | --- |
| A01 | Owner read token, correct MCP audience/client/scopes | Protected initialize/list/read tool succeeds; exact shared service DTO | Local HTTP + hosted client |
| A02 | Approved REST read vs separate admin token | GET allowed only with read; POST/PATCH only with admin; existing ETag/idempotency rules | Unit + HTTP |
| A03 | Missing, malformed, oversized, duplicate or non-Bearer credentials | Bounded denial; no repository call or expensive unbounded fetch | Unit + HTTP |
| A04 | Invalid signature, alg:none, HS/RS confusion, untrusted jku/issuer | 401; never follow token-controlled key/issuer URLs | Unit + HTTP |
| A05 | Expired/early token, missing required claims, overlong configured lifetime | 401 under explicit clock/lifetime policy | Unit + real issuer tokens |
| A06 | Wrong audience, ID token, userinfo-only token, token from other environment | 401 before data access; exact aud string/array policy enforced | Unit + hosted negatives |
| A07 | Valid non-owner, same verified email with different subject, unknown client | 403 with uniform error; exact issuer/sub/client policy | Unit + hosted synthetic identities |
| A08 | MCP token POST/PATCH to REST, including broad permissions array/admin scope | Wrong audience denied; no instruments:admin Principal or writes | Unit + HTTP + hosted grants |
| A09 | MCP client requests admin scope or REST/collector resource at AS | Issuance rejected or forbidden grant omitted; no usable admin token; Worker independently denies | Hosted AS |
| A10 | Read token same-resource mutation; collector token read/admin/MCP requests | 403 when audience valid but scope insufficient; otherwise 401; sentinel never reached | Unit + HTTP |
| A11 | Duplicate/unknown/wildcard scope strings; refresh requests increased scopes | No substring elevation; no scope increase beyond original/client/resource ceiling | Unit + hosted AS |
| A12 | Resource metadata and 401 challenge discovery | Exact resource/issuer/read scopes; path-specific metadata; no administrative advertising or private identifiers | HTTP + both hosted clients |
| A13 | PKCE discovery, S256 authorization and token exchange | Client uses advertised S256 and correct resource; plain/missing/wrong verifier denied | Local client harness + hosted AS |
| A14 | Stolen/expired/reused code, changed client/redirect/resource, concurrent redemption | Bound code rejected in wrong context; exactly one successful exchange for concurrent same code | Hosted AS with controlled synthetic flow |
| A15 | Callback state/issuer mismatch or advertised issuer omitted | Relevant OAuth client rejects callback; no successful link/token acceptance | Controlled client tests + actual-client evidence where observable |
| A16 | Unapproved CIMD/DCR metadata/private host/redirect abuse | No privileged grant; metadata trust policy bounded; no arbitrary SSRF; configured registration rate limits | AS configuration review + hosted negative tests |
| A17 | Same valid bearer reused before expiry | Works within its exact granted read boundary under proposed bearer policy; never interpreted as code replay protection | HTTP |
| A18 | Refresh rotation, old-token reuse, simultaneous refresh, family revocation | Chosen rotation/overlap behavior documented; reuse/family and revoked renewal fail as configured | Hosted AS + actual clients |
| A19 | Revoked refresh grant while access JWT still unexpired | No new token; old JWT follows explicitly approved residual window; rejects by exp+tolerance | Controlled clock + hosted AS |
| A20 | Owner requires immediate access revocation | Block release until authoritative state path, persistence/concurrency and outage-denial tests exist | Separate gated design; not claimed by offline JWT |
| A21 | JWKS rotation, unknown kid, cache expiry, timeout and outage | New trusted key handled safely; bounded refresh; invalid tokens denied, unavailable validation 503, no SQL | Unit + workerd + hosted synthetic rotation where supported |
| A22 | Parallel allowed/denied requests and reused MCP client connections | No identity/capability leakage or session-derived authorization bypass; every call verified | HTTP/SDK |
| A23 | Origin spoofing, direct API calls, hidden route guesses, forged X-Role headers | Existing guards plus token checks; headers/tool annotations never grant permissions | HTTP + default-app regression |
| A24 | Logs/errors/CI output under auth failure | No Authorization/codes/refresh/cookies/secrets or financial payload; contract-valid safe errors | Unit + artifact review |
| A25 | Flood random kid/tokens/registration; exhausted protection quotas | Bounded CPU/network/state; persistent/platform limit or fail-closed behavior; never fixture fallback | Controlled local load + approved hosted bounds |
| A26 | Refresh/key rotation/restart; later owner recovery mapping | Same stable internal owner ID; existing same-key create replays; no receipt scope reset | Unit + local D1 contract/restart regression |
| A27 | Existing connected/default Worker | Health body/statuses and public ping-only discovery unchanged; financial routes 404 | Original suites + no remote modification |
| A28 | Collector policy proof | Dedicated synthetic machine accepted only by test ingestion sentinel; no financial ingestion implementation | Policy + isolated HTTP fixture |
| A29 | Owner/collector/tenant incident recovery rehearsal | Old credential/grant denied per policy, controlled relinking, private routes disabled safely during incident | Approved hosted synthetic exercise |
| A30 | ChatGPT and chosen Claude account connect, reconnect and refresh | Redacted actual-client evidence incl. versions/config, tool result, failures; no local-only success substituted | Hosted PoC only |

Where a hosted client does not expose its internal negative callback checks, use a
controlled standards client to test the AS and record actual-host behavior separately.
Do not claim that a locally simulated client establishes ChatGPT's internal checks.

## Infrastructure/approval boundary for the hosted PoC

Actual cloud-hosted clients need a reachable HTTPS endpoint. Do not tunnel the
existing fixed-principal local harness. Proposed setup is a disposable instance of
the same Worker codebase at a different hostname, with a genuine verifier, synthetic
Memory data and a separate explicit PoC entrypoint/config. This is test isolation,
not a second financial product or permanent third deployment environment.

Before phase 3, request concrete approval for the exact test Worker/hostname and
deployment, Auth0 test tenant or isolated applications/APIs, resource compatibility
settings, synthetic identities, approved clients/callbacks and scoped grants, any
Action/connection setting, cost ceiling and teardown. Record resource names only
after approval; no IDs/secrets in the public documentation. Recheck dashboard/client
callback values through their approved interfaces. Existing connected endpoint and
its deployment stay untouched. No remote financial D1 is needed for this synthetic
test; any future revocation store would be a separately approved resource.

## Completion gates

- Owner approves provider, grant/client/audience policy, identity assurance/recovery,
  access-token residual window or stronger revocation requirement, and cost envelope.
- All applicable A01–A30 cases pass with honest layer-specific evidence; external
  blocked cases remain marked unverified and prevent claiming OAuth compatibility.
- All original 171 tests plus new auth cases, strict TypeScript, offline OpenAPI,
  real loopback HTTP, Docker and diagnostic dev/production dry-run bundles pass.
  No arbitrary new test-count target substitutes for behavior coverage.
- Native workerd verification on pinned SDK/Hono passes; CPU/latency and usage limits
  measured cold/warm before release. No auto-upgrade or paid fallback.
- No real data, cloud changes, deployment, staging or push is authorized by plan
  approval alone. Real-data release requires INSTALL's additional gates.
