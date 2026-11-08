# Authentication and authorization threat model

Status: proposed controls and tests, not implemented mitigations. Scope: owner identity,
delegated MCP/REST access, machine ingestion policy and provider lifecycle. Financial
calculation correctness and backup restoration retain their separate release gates.

## Assets, actors and trust boundaries

Assets: future private financial data; owner/admin capabilities; access/refresh tokens;
authorization codes; collector credentials; signing keys; tenant/cloud administration;
stable owner identity and durable idempotency scope. Current test records remain synthetic.

Actors: owner; approved read clients; separate admin client; dedicated collector;
untrusted internet client; malicious registered OAuth client; stolen-token holder;
compromised local process, collector workflow, model session or provider account.

Boundaries: browser/client to hosted AS; client to public discovery; client to Worker
verifier; verified context to adapter capabilities; adapter to shared services; service
to D1; CI collector to its one ingestion boundary. OAuth tenant and Cloudflare account
administration are independent high-trust controls. An AI tool request is untrusted
input even when its transport has a valid owner token.

## Threat register

| Threat | Proposed control | Required evidence / residual risk |
| --- | --- | --- |
| Another valid user signs in | Exact issuer/sub owner allowlist in Worker; optionally deny non-owner in post-login Action; disable open signup where supported | Verified-email impostor denied; no email-only lookup, automatic account linking or first-login ownership claim |
| MCP client obtains admin authority | Separate resource audiences and per-app grants; Worker client/scope ceilings; service checks; no write tools | MCP request for admin scope/audience fails; broad permissions claim cannot elevate; REST writes denied |
| Token substitution/confused deputy | Trusted issuer/JWKS and exact audience; reject ID/userinfo/foreign tokens; no passthrough/internal HTTP | Signed token for another resource denied before SQL; shared services do not bypass capabilities |
| Signature/key confusion | Audited verifier, asymmetric algorithm allowlist, bounded trusted key source | alg:none, wrong key, HS/RS confusion, untrusted jku/issuer, unknown kid fail safely |
| Code interception or replay | S256 PKCE, exact client/redirect/resource binding, short code lifetime, single consumption | Wrong verifier, missing/plain challenge, reused/expired code, concurrent redemption; one exchange wins |
| Callback mix-up/login CSRF | AS issuer identification where advertised, validated discovery; client state/verifier; explicit consent | Wrong/missing advertised issuer response, state mismatch and changed redirect rejected in relevant client/AS flow |
| Malicious DCR/CIMD client or metadata SSRF | Prefer approved pre-registration; read ceiling; bounded registration; trusted public HTTPS metadata policy and redirect checks | Unknown client denied; localhost/private-IP/redirect-chain metadata not fetched blindly; app name is not trusted identity |
| Stolen bearer token | HTTPS, short TTL, redaction, client isolation, no query tokens; optional future sender constraint only if clients support it | Bearer reuse before expiry is expected; residual window needs approval; do not claim replay-proof access tokens |
| Refresh theft/family reuse | Provider rotation, finite lifetimes, family reuse detection, revoke grants on incident | Old-token reuse/overlap and failed refresh after revocation tested; access JWT still follows residual policy |
| Non-atomic lifecycle state | Prefer hosted AS for PoC; Provider fallback must prove atomic consumption and global revocation semantics | Local KV success cannot establish distributed safety; JTI source documents best-effort races |
| Cross-request user leakage | Immutable request-local auth context; stateless server/transport per request retained | Parallel allowed/denied clients cannot inherit one another's Principal or tools/results |
| Collector compromise | Dedicated machine subject/client/audience, quotes:ingest only, bounded instruments/time/batch, rotated secret | Collector denied all financial reads/admin/MCP; no Cloudflare/D1 credential in job; untrusted PRs cannot obtain secrets |
| Prompt injection/exfiltration via read tools | Explicit bounded read capabilities; no write/secret/export tools; return only requested authorized data | OAuth does not prevent disclosure to an approved AI host; owner must accept host/data policy before real data |
| CSRF/cross-origin calls | Bearer-only API, existing Origin checks, no permissive CORS, hosted login protections | Foreign Origin denied; absent Origin still requires token; no API ambient-cookie fallback |
| Resource exhaustion/JWKS storm | Token/body bounds, negative-kid cooldown, bounded cache/fetch, persistent/platform rate control | Random tokens/registration floods cannot trigger unbounded fetches; quotas exhausted fail closed; protection availability/cost unverified |
| Provider outage or key rotation | Pinned issuer, bounded JWKS cache, rotation handling and conservative expiry | Known/unknown key outage tests; no fail-open auth or acceptance of a token just because JWKS failed |
| Owner lockout/account takeover | Phishing-resistant owner sign-in where entitled, protected tenant/cloud admin, recovery rehearsal | Passkey/MFA/recovery availability must be checked; recovery is controlled identity relinking, not email-only auto-ownership |
| Secret/log/artifact leakage | Redact headers/codes/tokens/cookies; no financial dumps; secrets in approved secret stores | Log/error/CI artifact inspection; no real credentials or financial data in source, docs or tests |

Controls follow the [MCP security guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices).
The application-specific policy and acceptance tests here are our proposed response;
they are not evidence that provider defaults enforce them.

## Incident and recovery runbooks to rehearse with synthetic accounts

1. **Stolen access/refresh token:** stop affected client's issuance and renewal,
   revoke its grant/family, disable private entrypoints if needed, rotate compromised
   client secrets, and measure residual JWT lifetime/propagation. Re-enable only
   after negative tests; revoke at AS and application layer according to approved policy.
2. **Collector secret leak:** disable that machine grant, rotate the isolated secret
   in approved GitHub/tenant secret stores, inspect synthetic ingestion audit IDs,
   and prove old credentials fail. Never rotate by sharing Cloudflare account tokens.
3. **Owner authentication lost:** use independently protected recovery factors/admin
   access; require out-of-band owner verification before relinking a new issuer/sub
   to the stable internal owner ID. Revoke old grants and check idempotency continuity.
   Keep recovery codes outside the repository and do not record their values here.
4. **Signing-key or tenant compromise:** halt private access, rotate/provider-revoke
   affected keys/grants, evict unsafe cached trust, review issuer/client policy and
   require fresh login. An attacker-controlled issuer/tenant is outside normal
   signature validation's protection; recovery needs independent administration.
5. **Provider outage/quota exhaustion:** retain public health shape without leaking
   dependencies, fail private requests closed, and restore only after issuer/JWKS/
   grant checks. No downgrade to synthetic principal, anonymous financial routes or
   long-lived ingestion master token.

No runbook may require disabling signature/audience checks, globally opening CORS,
extracting Wrangler credentials or making an unapproved deployment. Operational
actions require their own authorization. OAuth success does not complete encrypted
backup, financial correctness, CPU, privacy or restore gates.
