---
status: pending
---

# Instruction: Freeze authorization policy and protect the diagnostic baseline

## Architecture projection

```txt
✅ tests/auth.policy.test.ts
✅ tests/helpers/auth-fixtures.ts
✏️ tests/instruments.regression.test.ts
✏️ tests/worker.test.ts
✏️ aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/authorization.md
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Approve policy and inspect baseline 7668ad9 | Explicit provider, scope/client/audience and lifetime proposals recorded | Owner |
| Happy path | Exercise existing read/admin service checks | Allowed principal reaches only granted operation | System |
| Edge case | Present MCP/read/collector identity to admin service | Denied before repository mutation | System |
| Edge case | Send forged identity headers to default app | Health/ping unchanged, instruments 404 | API |
| Edge case | Require immediate revocation or unavailable Free security feature | Stop for design/cost decision; no weaker fallback | Owner |

## Tasks to do

### `1)` Approve the bounded policy before choosing dependencies

1. Review authorization.md, costs.md and threat-model.md. Approve the Auth0-first
   PoC recommendation, existing portfolio scopes, separate MCP/REST/collector
   audiences, exact owner/client allowlists and read-only MCP ceiling.
2. Set owner assurance and recovery requirements. Passkeys or another approved
   strong method must be verified against actual plan features, not assumed.
3. Explicitly accept the proposed access-token residual window or stop for an
   authoritative revocation-state design. Do not treat refresh revocation as access
   JWT revocation. Final tenant/provider selection remains conditional.
4. Approve an audited Workers-compatible verifier dependency/version before any
   installation. If the pinned SDK cannot meet required auth contracts, document
   a bounded compatibility change for separate review rather than auto-upgrading.

### `2)` Build the security safety net with synthetic fixtures

1. Keep the existing 171 tests and add reusable owner/read/admin/machine/unknown
   client fixtures with ephemeral test keys and controlled time. No real credentials.
2. Lock service permission denials, explicit scope-to-capability mapping, immutable
   request-local principal identity and stable internal owner ID requirements.
3. Freeze default health body/statuses and SDK initialize/list/ping behavior. Confirm
   all default financial requests remain 404 despite forged Authorization/X-Role.
4. Record acceptance IDs A02, A07–A11, A23, A26–A28 as coverage targets. No JWT or
   hosted-client test is claimed from a principal-only fixture.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Approval decisions and unresolved entitlements/revocation requirements explicit; no remote settings/dependencies changed merely by documenting them |
| 2 | Original diagnostics and instrument tests remain intact; denied service calls perform no repository access/mutation; synthetic fixture data only |
