---
status: blocked
---

# Instruction: Prove actual provider and hosted-client interoperability

Local preparation authorized by the owner: dedicated fail-closed composition,
operator configuration/discovery checks and synthetic tests are implemented.
Remote configuration, hosting and actual client tests remain gated. See
[interop-evidence.md](interop-evidence.md) for the approval package and execution sheet.
Local checks pass; blocked on owner-selected tenant/host, manual setup and specific
remote-operation approval. No remote action or hosted result has been observed.
Do not mark this phase done until actual hosted acceptance criteria pass.

## Architecture projection

```txt
✅ src/entrypoints/oauth-poc.ts
✅ tests/fixtures/wrangler.oauth-poc.jsonc
✅ aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/interop-evidence.md
✏️ aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/costs.md
✏️ aidd_docs/backlog/spikes/oauth-provider-selection.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Approve exact PoC host/tenant/resources/settings and synthetic accounts | Separate HTTPS instance, read grants and callbacks; existing connector unchanged | Owner |
| Happy path | Connect ChatGPT and selected Claude clients using real OAuth | Discovery, PKCE/resource/issuer handling, read result, refresh/reconnect evidenced | Client |
| Edge case | Request admin resource/scope as MCP client | AS denies forbidden grants; Worker independently denies reuse | Client |
| Edge case | Replay code, change verifier/client/redirect, revoke refresh | Code binding/single use and configured refresh behavior demonstrated | Controlled client |
| Edge case | Required feature unavailable or paid | Stop for provider/cost review; no compatibility proxy or weaker auth | Owner |
| Teardown | Remove approved disposable instance/grants/test identities | Revocation/lifetime observed; no change to diagnostic deployment | Operator |

## Tasks to do

### `1)` Obtain specific remote-operation approval and confirm entitlements

1. After local gates pass, prepare reviewable exact test Worker/hostname/config,
   tenant or isolated applications, synthetic owner/non-owner identities, API
   audiences, approved client/callback values, Actions/connections, budget ceiling
   and teardown. Obtain separate approval before each remote scope is exercised.
2. Verify Free-plan eligibility, owner assurance/recovery, resource compatibility
   profile and approved client registration. Prefer manual CIMD/predefined clients;
   test dynamic registration only if needed and entitled. No Enterprise-only
   private_key_jwt or dynamic CIMD Early Access assumed as a dependency.
3. Configure per-app scopes/resource grants and exact owner policy. Approved
   third-party connection settings must not grant every client administrative API
   access. Secrets go only to approved secret stores, never documentation or source.
4. Before public PoC exposure, verify an approved persistent/platform abuse-control
   mechanism, bounded test traffic budget and quota/failure behavior. If the needed
   control is unavailable or requires another resource/cost, stop for approval.
   Phase 4 measures and rechecks these controls; it is not their first enablement.

### `2)` Run the hosted synthetic interoperability and attack cases

1. Deploy only the separately approved synthetic PoC instance of the same codebase;
   its `/mcp` is protected and uses genuine verification with synthetic Memory data.
   Root Worker, existing development MCP URL and connected ChatGPT plugin stay intact.
   No remote financial D1, real portfolio data or permanent second backend.
2. Demonstrate actual ChatGPT linking/read/reconnect/refresh. Test Claude hosted
   connector and the selected local/Code client separately; API token-supply testing
   is not evidence of interactive OAuth. Record client versions and chosen registration.
3. Exercise A09, A11–A16, A18–A19 and A30: native resource/audience handling, S256,
   issuer callbacks, redirect/client binding, exact single-use code with concurrent
   exchanges, scope ceilings, refresh reuse/family revocation. Use controlled clients
   for negatives a hosted UI cannot expose; label the distinction explicitly.
4. Test signed wrong-owner/audience/expiry and delegated MCP-to-admin denials with
   actual issuer tokens. Redact evidence; never export token/code values to chat,
   logs, fixtures or public CI. Verify error/challenge behavior on the real router.

### `3)` Record outcomes and dispose only approved test resources

1. Capture redacted metadata, status/result assertions, registration/refresh policy,
   entitlements/costs and unresolved cases in interop-evidence.md. A failed test
   blocks its claim; do not infer interoperability from standards documentation.
2. Reassess the provider-selection spike. If Auth0 fails a gate, stop for review of
   fallback scope; Provider still needs identity/consent and atomic lifecycle proof.
3. With teardown approval, revoke test grants/credentials and remove the disposable
   instance, confirming the old connected diagnostic endpoint was not altered.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Written approval covers exact remote actions/cost; entitlements confirmed without credential extraction or paid activation |
| 2 | Actual ChatGPT and chosen Claude results, code/PKCE/resource/refresh negatives and read/admin isolation have redacted evidence; no unsupported success claim |
| 3 | Evidence lists failures/unknowns honestly; approved test resources cleaned up; existing MCP/Worker unchanged and provider selection still awaits owner decision |
