---
status: done
---

# Instruction: Implement isolated local token verification and protected routing

## Architecture projection

```txt
✅ src/adapters/auth/token-verifier.ts
✅ src/adapters/auth/resource-policy.ts
✅ src/adapters/auth/metadata.ts
✅ tests/auth.verifier.test.ts
✅ tests/auth.http.test.ts
✅ tests/auth.mcp.test.ts
✅ tests/helpers/oauth-http-fixture.mjs
✅ tests/helpers/oauth-http-fixture.d.mts
✅ tests/fixtures/wrangler.oauth-local.jsonc
✏️ src/application/authorization.ts
✏️ src/application/errors.ts
✏️ src/app.ts
✏️ src/adapters/rest/instruments.ts
✏️ src/adapters/mcp/handler.ts
✏️ aidd_docs/api/openapi.json
✏️ tests/instruments.contract.test.ts
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Start explicit loopback verifier/JWKS fixtures in workerd | Synthetic protected composition; default Worker unmodified | System |
| Happy path | Use valid signed owner token for correct resource/client | Shared service returns existing DTO; MCP exposes reads only | API |
| Edge case | Invalid/expired/wrong-resource token or broad permissions claim | 401/403 as appropriate; no capability escalation or SQL | API |
| Edge case | Unknown key/outage/random-kid flood | Bounded fetching and fail-closed 503, no identity fallback | System |
| Edge case | Parallel allowed and denied MCP calls | No cross-request authorization leakage | API |
| Teardown | Close HTTP/JWKS/workerd and owned fixture state | No listener or temporary identity state remains | System |

## Tasks to do

### `1)` Implement verification and explicit resource policy

1. After dependency approval, verify signature/algorithm, pinned issuer/key source,
   audience, exp/nbf/iat lifetime and bounded clock tolerance. Reject ID/foreign
   tokens, ambiguous headers, untrusted metadata and unsupported token profiles.
2. Bound JWT/JWKS sizes, cache age, fetch timeout/redirects, unknown-kid refresh and
   negative lookup rate. Distinguish invalid credential 401 from unavailable trusted
   verification 503. Do not build a custom cryptographic verifier.
3. Map exact issuer/sub to stable internal owner ID; validate the configured signed
   client identifier/profile. Intersect delegated scopes with route/client/owner
   ceilings. Preserve existing instruments:read/admin service capabilities; never
   turn Auth0's broad permissions array into delegated authority.
4. Model collector policy with a synthetic sentinel only, no ingestion business API.
   No OAUTH_KV or remote D1 needed for the proposed offline verification design.

### `2)` Compose Hono REST and MCP without enabling the default app

1. Extend explicit createApp dependencies for protected test composition. Inject the
   verifier through the existing REST authenticate hook; preserve service checks,
   Origin/body controls, ETags, version CAS, pagination and idempotency.
2. Add request-local verified context to MCP's Web-standard transport/tool handlers.
   Protect the entire financial-mode transport, not selected JSON-RPC method names.
   Use only existing read services, never internal HTTP. For synthetic OAuth proof,
   a bounded instrument list/get test tool is enough; do not add valuation features.
3. Publish path-specific RFC 9728 metadata and bounded Bearer challenges, minimal
   read scopes and supported OAuth tool hints. Verify pinned SDK authInfo/security
   metadata behavior; do not switch to Node Express transport middleware.
4. Add applicable 429/503 errors and auth documentation in OpenAPI; keep DTOs,
   operation capabilities and external portfolio scope vocabulary. No changes to
   src/index.ts or root wrangler.jsonc; unconfigured app remains diagnostic-only.

### `3)` Prove the local boundary through HTTP and native runtime tests

1. Use an explicit 127.0.0.1 setup with synthetic keys/JWKS, controlled clock,
   fixed trusted issuer and server-side configuration. Never publish the existing
   fixed-principal instrument harness or enable request-selected principals.
2. Cover applicable A01–A13, A17, A19, A21–A28 locally, including direct REST attempts
   by MCP tokens, broad permissions claims, scope escalation, concurrent identities,
   safe errors/logging and no repository calls on denial.
3. Run TypeScript, original/new suites, OpenAPI, real HTTP and native workerd tests.
   Label simulated AS behavior as local evidence only; actual authorization code,
   refresh and hosted-client behavior remains phase 3.

## Test acceptance criteria

Local evidence: 233 tests across 17 suites and strict TypeScript pass on host and
Docker, including all original instrument/D1/MCP/diagnostic cases. Sixty auth cases
cover policy/JWT/JWKS, signed-token HTTP, official MCP SDK and actual native workerd;
two added default-route regressions prove metadata remains unmounted. OpenAPI
discovery/503 responses validate. Both diagnostic Worker dry-run environments pass
without bindings. See [local-implementation.md](local-implementation.md) for limits.

| Task | Acceptance criteria |
| --- | --- |
| 1 | Real signature/claims verified with bounded trusted keys; every prohibited resource/client/scope combination denied; no raw token logging |
| 2 | REST/MCP share services and permission checks; diagnostic default unchanged; metadata/challenges and HTTP contracts validated on pinned SDK |
| 3 | Local HTTP/workerd positives and negatives pass with complete teardown; existing D1 concurrency/restart tests still pass; no hosted OAuth success claimed |
