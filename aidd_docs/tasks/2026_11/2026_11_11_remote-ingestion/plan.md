---
status: implemented
objective: "Prepare Cloudflare Access machine-only quotation ingestion and Python service credentials without remote changes."
---

# Machine-only remote ingestion — local implementation

Authority: owner request following `35b7b00`, [PRD](../2026_11_08-financial-backend-prd.md),
[collector](../2026_11_11_collector/contract.md), [GUIDELINES](../../../GUIDELINES.md).
The repository is already public; collection and hosted changes remain disabled.

## Mechanism reused / bounded compatibility adaptation

- Use Cloudflare Access **Service Tokens + Service Auth**, not the interactive
  Managed OAuth MCP owner identity and not a new OAuth server/issuer.
- Python sends CF-Access-Client-Id and CF-Access-Client-Secret on every request,
  over approved HTTPS, without Authorization bearer/cookie reuse or redirects.
- Access issues the signed Cf-Access-Jwt-Assertion. Worker verifies its RS256
  signature, fixed issuer/JWKS, dedicated application AUD and time claims.
- Machine assertions require sub empty and an exact allowlisted signed common_name
  (the Service Token Client ID). Raw client headers are never identity evidence.
- Reuse a common Access JWT verification helper for owner and machine policies.
  Preserve existing owner-only MCP behavior and deployed entrypoints/configuration.
- Machine policy yields one fixed stable internal collector principal with only
  quotes:ingest, irrespective of claimed scopes/roles. Existing QuotationService
  adds independent subject/provider/instrument grants, default deny.
- Separate opt-in Hono composition mounts only quotation-batch ingestion; no MCP,
  health, positions, quotations reads or administrative routes.
- Enabled flag and at most two pinned client IDs support kill switch/rotation.
  Machine assertion lifetime is bounded to 300 seconds; hosted assertion lifetime
  must be confirmed before activation, with no silent relaxation on mismatch.

Verified official shape and transport:
[application token](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/),
[service token operations](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
No real service assertion/credential, hostname or ingestion AUD has been collected.

## Delivery / ownership

1. Main agent: TypeScript shared JWT verification, machine policy, closed composition,
   synthetic unit/HTTP/Python↔Hono/native D1 integration tests and OpenAPI adaptation.
2. Python agent: collector HTTP credentials/CLI, Python tests, collector README and
   inactive quotation workflow secret names. No backend/AIDD/rule changes.
3. Documentation agent: only [configuration runbook](contract.md), covering separate
   Access app/policy, protected GitHub Environment, rotation/revocation and gates.

Direct delegation suffices; no Orchestrator, overlapping file edits, framework or
dependency installation is needed. Main agent owns integration and final checks.

## Acceptance

- Missing/forged/expired/future/wrong-issuer/AUD/type/service assertions are denied.
  Owner/MCP/legacy OAuth bearer/client headers alone never grant Access ingestion.
- Only exact signed machine IDs map to ingestion; scopes/admin claims cannot widen
  permissions. Disabled/revoked application grants and unmapped provider/instruments
  fail before writes. Rotation preserves the stable idempotency subject.
- Python uses only the two service credential headers for Access; immutable batch
  replay and no-secret logging/redirect protections remain intact.
- Actual loopback tests bridge Python to an explicit **test-only** simulated Access
  edge and signed assertions, plus native local D1. This is not hosted Access proof.
- Full Python/TypeScript/OpenAPI/regressions, appropriate dry-run and diff/security
  checks pass; all Python documentation stays English.
- Remote setup, credential verification, strict Service Auth settings, independent
  audience/hostname, 300-second assertion lifetime and revocation latency remain
  explicit owner-approved hosted gates. No remote API call/configuration is made.

## Evidence

2026-11-11, local synthetic implementation complete:

- 107 Python tests pass, including Access header isolation, missing/mixed credentials,
  redirects, safe output and immutable retries. English docstrings are preserved.
- 483 TypeScript tests / 32 suites pass: shared Access cryptography and unchanged
  owner MCP behavior, service claims/short lifetime/rotation/kill switch, eight new
  Python→test-edge→Hono integration cases across Memory/native local D1, existing
  ingestion grants, OpenAPI, migrations, rollback and diagnostics regressions.
- Strict TypeScript passes. OpenAPI adds the paired Access header scheme only to
  batch ingestion; DTOs and existing response contracts remain unchanged.
- DEV dry-run: 1513.35 KiB / gzip 262.82. Access PoC dry-run: 1564.72 KiB / gzip
  277.18. Both have no bindings/private configuration loaded and no upload.
- Both delegated tasks completed; main agent integrated/reviewed their changes.
  Diff whitespace, local documentation links and candidate secret/state checks pass.

No real credential/assertion, remote application/AUD, machine policy, GitHub Secret,
workflow activation, D1 provisioning, commit, push or deployment was performed.
The existing default Worker and connected MCP entrypoints/configs are unchanged.

Remaining hosted prerequisites are explicit in [contract.md](contract.md): choose
and approve the isolated ingestion destination/app/AUD; configure exact Service Auth
credentials and server grants; confirm actual assertion lifetime <=300 seconds and
edge revocation/rotation behavior; protect/configure GitHub Secrets and approve
hosted synthetic acceptance. Yahoo coverage/rights and monitoring gates remain.
Local test-edge simulation is not evidence of hosted Cloudflare interoperability.
