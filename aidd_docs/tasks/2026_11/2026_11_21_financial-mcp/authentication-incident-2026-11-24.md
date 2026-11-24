# MCP authentication incident — 24 November 2026

## Observed facts

- Owner MCP requests reach the financial Worker and return HTTP 401 before tool
  execution. This affects ping and reads as well as financial preparations.
- Safe internal diagnostics classify the rejected assertion as
  `audience_multiple_financial_channels`: the expected MCP AUD and browser AUD are
  both present, with no other AUD values. Tokens and identity data are not logged.
- `AccessJwtVerifier` requires exactly one audience. This explains the immediate
  rejection; it does not establish why the issuer now supplies both audiences.
- Reverting the deployed Worker to the published V1.1.0 version did not restore
  owner-reported MCP access. A diagnostic-only deployment subsequently captured the
  detailed audience classification.
- Dashboard screenshots show the read application's Worker-wide destination and
  the separate browser application's `/financial-confirmation/*` destination on
  that same hostname. This arrangement is already recorded in the V1.1 contract.
- The application audit screenshots show no update during the reported onset:
  read updates on 21 November; approval updates on 21 November and the cookie-path
  change performed during this investigation on 24 November. This is not a review
  of all policy/account/provider activity.
- Enforcing the approval cookie path and reconnecting ChatGPT did not remove the
  mixed-audience rejection. No further cookie changes are justified by that result.

The full browser-approved real financial write remains unvalidated in production.
No real operation was approved or recorded during the investigation.

## Prepared local remediation: separate ingress hostnames

This is a proposed isolation remediation, not a demonstrated fix for issuer behavior.
The original financial Worker, D1, financial engine, owner binding and strict
single-audience checks remain. Optional `FINANCIAL_CONFIRMATION_ORIGIN` selects a
separate HTTPS origin for generated approval links and GET/POST origin checks.
Omitting it preserves the historical composition. Proposal canonicalization,
digests, journal receipts, idempotence and financial calculations are unchanged.

`financial-approval-relay.ts` exposes only GET/POST on UUID confirmation paths.
It preserves the original URL, assertion, cookies, Origin and body through an HTTP
Service binding to the financial Worker. It does not expose MCP/REST, manufacture
identity, strip disallowed credentials, hold owner secrets, or bind D1. The backend
still verifies signatures, owner identity, browser-only audience, CSRF and expiry.
Missing assertions, other origins/routes/methods and service credentials fail closed.

## Activation gate and rollback

The owner explicitly authorized relay creation/deployment, moving the browser
Access destination, and deploying the financial confirmation origin on 24 November.
Relay version: `19da4504-8743-4312-bab9-44aabc24f067`.
Financial Worker version: `0f29a4a7-64cb-4b3e-b668-d657cc6a4444`.
Both deploy commands completed successfully. At this stage the Access destination
move and recovery validation were pending; later results are recorded below. No
migration, secret change or financial transaction was performed. No commit was created.

1. Deploy the relay with the approved separate origin and a Service binding to the
   existing financial Worker. The committed example disables public/preview URLs;
   production activation requires a separately reviewed configuration.
2. Move the existing browser Access application's hostname to the relay's hostname,
   preserving its AUD, owner-only policy and disabled Managed OAuth. Remove its old
   hostname destination; do not delete/recreate the application or change the read app.
3. Deploy the financial Worker with `FINANCIAL_CONFIRMATION_ORIGIN` set to that same
   origin. No migration, secret update or financial write is required.
4. Renew MCP authentication once and capture one ping. Success requires a valid
   MCP-only assertion. In a browser, an unknown synthetic UUID must authenticate
   and return a missing-proposal error, without preparing or approving an operation.
5. If the issuer still produces mixed audiences, stop: do not relax validation.
   Preserve request identifiers for Cloudflare investigation. Roll back the financial
   Worker to the retained pre-remediation version and move the existing browser
   application's destination back. The idle relay can remain fail-closed pending an
   explicit removal decision. This does not roll back or alter D1 data.

No root-cause claim about ChatGPT versus Cloudflare is established by these tests.
Old approval URLs are intentionally rejected on the MCP origin when isolation is
enabled; expired proposals must not be revived or rewritten.

### Subsequent owner-reported isolation result and read-only diagnostic

The owner saved the browser application's destination on the separate approval
hostname, reconnected, and reported another MCP ping HTTP 401. Its detailed
post-move rejection classification has not been captured here; do not assume the
earlier mixed-AUD code describes this later request.

The owner then explicitly authorized disabling financial writes, temporarily
removing the approval Access destination without deleting/recreating its application,
and testing one ping after renewed authentication. The financial Worker was deployed
as `7ed4aa14-d545-4e78-b692-dfd1abf8c9a1` with only
`FINANCIAL_WRITES_ENABLED=false`; read enable flags remain true. This removes write
permissions from MCP principals and denies browser approval. Audience, owner,
origins, bindings and financial data are unchanged. Local restore configuration is
retained; restoring writes requires an explicit decision, not an automatic retry.
At this stage destination removal and a renewed ping were pending; the next section
records their later outcome.

### Parked approval destination: result and local read-only recovery candidate

The owner showed the approval destination moved to a temporary hostname and reported
reconnecting and another failed ping. At 05:47:35 UTC, version
`7ed4aa14-d545-4e78-b692-dfd1abf8c9a1` again logged
`audience_multiple_financial_channels` followed by `audience_rejected`. Detaching
the active approval hostname did not remove the mixed assertion. The issuer/session
root cause remains unresolved; do not declare a confirmed configuration collision.

A further LOCAL, opt-in recovery candidate permits only the exact pair of configured
read/browser audiences, in either order, on the owner MCP read channel. It requires
`MCP_READ_ONLY_MIXED_AUDIENCE_ENABLED=true` and `FINANCIAL_WRITES_ENABLED=false`.
Enabling both recovery and financial writes fails configuration validation. With the
recovery flag absent/false, historical singleton-AUD validation remains unchanged.
Browser approval never enables this exception and remains disabled during recovery.
No client parameter, extra audience, duplicate audience, scope or bearer claim can
enable recovery or grant write/approval/admin permission. Signature, issuer, time,
expected read audience and exact owner validation remain mandatory.

This changes an authentication acceptance rule and therefore requires explicit
owner approval before deployment. It is a temporary restoration of reads, not a fix
for Cloudflare assertion issuance or production qualification of browser approval.

Targeted evidence: 13 recovery tests, including native local D1 and official SDK
ping/REST reads, read-only tool exposure and refusal of browser approval. Four
existing targeted financial tests (including both SDK/origin compositions) also
passed during the first run. Three new assertions initially failed because the test
passed an owner configuration into the stricter cryptographic constructor; only the
test input was corrected. No existing financial suite was rerun globally.

The owner explicitly authorized deploying this recovery acceptance rule. Deployment
completed as `805050ee-3965-49de-b1a2-b7f57c584d8f`, with
`FINANCIAL_WRITES_ENABLED=false` and `MCP_READ_ONLY_MIXED_AUDIENCE_ENABLED=true`
reported by Wrangler. No Access/secret/D1 change or financial operation accompanied
this deployment. At deployment completion, the owner ping was pending; its later
result is recorded below.
Rollback to `7ed4aa14-d545-4e78-b692-dfd1abf8c9a1` preserves the write-disabled state
while removing the read-only audience exception. No commit/push was performed.

### Owner-reported production recovery evidence

The owner supplied a successful ChatGPT MCP `ping({})` response at
`2026-11-24T05:55:35.873Z`: `status=ok`, `service=pea-tracker`, application
`version=0.1.0`. This follows deployment of recovery Worker
`805050ee-3965-49de-b1a2-b7f57c584d8f`. No reconnect or additional tool call was
requested for this comparison. This confirms operational MCP ping recovery for
that call, not financial read correctness, browser approval or write capability.
No financial data was consulted or modified by that ping. Financial writes and
browser approval remain disabled. The upstream reason for the mixed assertion is
still unresolved; do not describe temporary read-only recovery as a full incident fix.

The owner subsequently reported a successful direct ChatGPT MCP
`get_current_portfolio_valuation` at 06:56:54 Europe/Paris on 24 November, using
Yahoo `last_trade` / `unadjusted` and an explicitly selected portfolio. The reported
response covered all 20 expected positions, cash and performance without HTTP 401.
This is owner-reported production evidence of financial read recovery beyond ping,
not an independent reconciliation of the returned financial calculations or a
qualification of every read tool. No extra tool call was made to repeat it.
Private portfolio identifiers, amounts, quantities and per-position data are not
retained here. The owner distinguished MCP output from subsequent presentation,
historical comparisons and an indicative purchase simulation. No write occurred;
simulated presentation must not be treated as a journal entry. Writes and browser
approval remain disabled; the complete real write journey is still unvalidated.

## Git consolidation boundary

Branch `fix/v1.1-mcp-approval` was created from `22e3bba` (published `v1.1.3`)
without discarding, staging or committing the incident changes. Local `main` and
the published tags remain unchanged. The running recovery deployment is based on
V1.1.3 plus these local changes, not the earlier temporary V1.1.0 rollback.

The owner explicitly authorized a first local commit as a coherent checkpoint of the code already
deployed: safe diagnostics, explicit read-only audience recovery, separate approval
origin/relay, targeted tests and incident/RETEX evidence. The relay's inclusion does
not imply qualified browser approval or enabled financial writes. No partial staging
is needed to preserve this deployed checkpoint. Future approval qualification/fixes
must form later commits, so they cannot be confused with proven read recovery.
Approved message: `fix(auth): restore owner MCP reads in guarded read-only mode`.
This local commit authorizes no push, new tag, merge or additional deployment.

## Local evidence

### Browser identity qualification — local implementation complete

The owner approved the inline plan to qualify the browser identity without enabling
financial writes. The implementation stays on `fix/v1.1-mcp-approval`, after the
read-recovery checkpoint `fc280f6`. No new commit had been performed at that stage.
After explicit owner approval, the diagnostic deployments completed:
financial Worker `5004ace9-dce2-405b-8a1f-c0a932e87c41`, relay
`04c8f314-b275-44a3-8520-28bbab7cb207`. Wrangler reported diagnostic and recovery
flags true, financial writes false. Browser qualification was pending at deployment;
its later successful result is recorded below.
The retained pre-diagnostic rollback versions are recovery Worker
`805050ee-3965-49de-b1a2-b7f57c584d8f` and relay `19da4504-8743-4312-bab9-44aabc24f067`.

- New GET `/financial-confirmation/auth-check` is disabled by default. It requires
  `FINANCIAL_APPROVAL_DIAGNOSTICS_ENABLED=true`, reads enabled, writes disabled,
  the exact confirmation origin and no query parameters. Other methods are refused.
- It verifies a signed browser-only audience and the exact owner, returning only
  `{status:"ok",check:"browser_identity",financial_writes_enabled:false}`.
  Missing/forged/expired/wrong-issuer tokens, foreign owners and mixed/MCP audiences
  fail closed. Bearer and service credentials remain refused.
- Identity-only verification grants no financial permission. Existing approval
  still checks the write-enable flag first, then the same strict identity verifier.
  The diagnostic never invokes D1, financial services, proposal creation or approval;
  it issues no cookie or CSRF nonce. Outputs are no-store and contain no identity,
  token, audience values or financial data. The relay accepts only GET on this path.
- 40 targeted tests passed across diagnostic, relay and read-only recovery files;
  three existing owner/browser/official-SDK integration tests passed with 33 skipped.
  Diagnostic fixtures throw on any attempted D1 operation. TypeScript and both
  affected Wrangler dry-runs passed. No live authentication test was run in this phase.
- At that stage the next owner dashboard action was to restore the browser Access app's
  destination to the approval relay hostname and `/financial-confirmation/*`.
  Preserve its AUD, owner policy and disabled Managed OAuth. One protected browser
  GET will determine whether that channel has an independent browser-only assertion.
  Do not reactivate writes from a successful diagnostic alone.

### Browser result and normal MCP policy — local implementation complete

The owner showed the approval destination restored to the relay hostname and
supplied the live diagnostic response:
`{status:"ok",check:"browser_identity",financial_writes_enabled:false}`.
The deployed backend therefore accepted its strict browser-only audience and exact
owner identity on that request. No token/identity value, D1 access, proposal or
financial approval was involved. The complete real approval/write journey is not
validated by this GET, and the issuer's mixed-MCP assertion origin remains unexplained.

The following correction passed local validation. The owner explicitly authorized
its local commit and deployment; activation remains pending at this checkpoint:

- Opt-in `MCP_KNOWN_AUDIENCE_PAIR_ENABLED` permits the exact known pair on MCP while
  keeping browser admission singleton-only. It is independent of the existing
  read-only recovery guard; defaults and historical single-AUD behavior are preserved.
- Financial write permission still requires the write-enable flag and exact owner;
  MCP never receives approval/admin permission. Mixed assertions fail browser GET
  and POST, including with the MCP write permission enabled.
- The existing read-only recovery flag cannot coexist with writes. The authorized
  activation sets writes true, read-only recovery false, known-pair admission
  true and approval diagnostics false, without changing other variables or bindings.
  It does not itself authorize any real operation.
- 42 tests passed across known-pair policy, recovery and browser diagnostic files;
  five targeted existing owner/diagnostic/SDK tests passed, with 32 skipped. The SDK
  cases cover legacy origin, separate origin and mixed-MCP/separate-browser flows on
  native local D1: preparation, refusal before independent approval, signed browser
  approval, append, receipt/replay, historical reads and unchanged concurrency guards.
- TypeScript passed. Browser authentication qualification is owner-reported live
  evidence; write/receipt/replay evidence here is synthetic/local only.

### Authorized activation and minimal availability check

The owner explicitly authorized the correction's local commit and production
activation. Commit `caeb62724417238f87ae15fc98a93b8a42fc879d` was created on
`fix/v1.1-mcp-approval`; the tree was clean before deployment. Published `main`,
tags and V2 branches were not changed. No push or release was performed.

Worker `3cdf9216-04ee-462e-bbda-6d8697172ef0` was deployed successfully with:

- `FINANCIAL_WRITES_ENABLED=true`
- `MCP_KNOWN_AUDIENCE_PAIR_ENABLED=true`
- `MCP_READ_ONLY_MIXED_AUDIENCE_ENABLED=false`
- `FINANCIAL_APPROVAL_DIAGNOSTICS_ENABLED=false`

Only these four feature settings differ from the diagnostic configuration; other
variables, origins, audience values, D1 bindings and secrets were preserved. The
relay already deployed as `04c8f314-b275-44a3-8520-28bbab7cb207` needed no additional
deployment. No migration, D1 operation or Access/secret modification was performed.

Exactly one connector `ping({})` was called after activation and returned `status=ok`
at `2026-11-24T06:33:32.734Z`. The new Worker version was observed in the tail.
No portfolio read, proposal preparation, browser approval or financial confirmation
was called. Independent browser identity was qualified earlier; the first complete
real approval/write/receipt/replay journey remains unvalidated. Feature activation
does not itself approve any operation. The retained read-only recovery version
`805050ee-3965-49de-b1a2-b7f57c584d8f` remains the production fallback if required.

### Subsequent native-form POST incident — verified cause, local correction

The owner reported that real MCP preparation and the protected confirmation GET
succeeded, but submitting the native browser form returned `origin_forbidden`.
No financial approval or journal write is established by this failed submission.
Actual operation details, identifiers, prices, quantities and balances are omitted.

The private Worker tail for deployed version `3cdf9216-04ee-462e-bbda-6d8697172ef0`
showed the failing POST had `Origin: null`, `Sec-Fetch-Site: same-origin`, no query
and HTTP 403. The page's `Referrer-Policy: no-referrer` causes browsers to send a
null Origin on native form POST. The server's strict origin check then rejects it.
This is a separate verified browser-policy defect, not a new OAuth/AUD failure.
Earlier HTTP/SDK tests supplied Origin explicitly and did not exercise this browser
behavior; successful identity-only GETs could not prove native POST behavior.

The LOCAL correction changes only the confirmation page's response policy to
`strict-origin`: native form POST preserves its origin and Referer contains no
proposal path/query. Origin comparison, null/missing/foreign origin rejection,
Access/owner/audience checks, CSRF/cookies, CSP, UTM handling, expiry, one-use approval
and financial logic are unchanged. No null-origin exception or Referer-based
authorization was added. The read-only diagnostic retains its separate no-referrer
policy and remains disabled in normal operation.

Evidence: an isolated installed Chrome headless check on loopback reproduced the
old null Origin and verified the corrected real Origin plus origin-only Referer.
It uses a temporary unsigned-in profile, no financial service or database, and no
new dependency. It is optional when no browser binary exists; it actually ran and
passed locally. Eight targeted financial tests passed (29 skipped), including
null/missing/foreign Origin refusals, CSRF, expiry, UTM and the three native-D1/SDK
flows. TypeScript and diff whitespace checks passed. No global suite was run.

After explicit owner authorization, the correction was committed as
`71bc29920204d5246e0c9d71e1a7e4ac7ce41d89` on `fix/v1.1-mcp-approval` and deployed
as Worker `de09bec2-6596-415d-8ffb-c447c3f2b6e5`. The tree was clean before deployment.
The normal financial configuration was reused unchanged: writes/known-pair MCP
admission true, recovery/diagnostics false. No relay deployment, Access/secret
change, migration or financial operation was performed. One connector ping succeeded
at `2026-11-24T06:50:10.988Z`. No real proposal was prepared, approved or confirmed
by these deployment checks. The pre-header version
`3cdf9216-04ee-462e-bbda-6d8697172ef0` and write-disabled recovery
`805050ee-3965-49de-b1a2-b7f57c584d8f` are retained fallback references.

The first real native browser approval/write/receipt/replay journey remains pending.
Expired proposals must be prepared anew; old loaded pages retain their previous
document policy, so the owner must open the fresh form after deployment. No expired
operation is revived. A second documentation-only local commit was explicitly
authorized to record these deployment facts; no push, tag or release is authorized.

Sources consulted 24 November 2026:
- [MDN: Referrer-Policy effect on Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header)
- [Chrome Headless](https://developer.chrome.com/docs/automation-and-testing/headless)

### Earlier isolation test results

- 14 targeted tests passed across `financial-mcp.test.ts` and
  `financial-approval-relay.test.ts`; 32 unrelated tests skipped.
- Includes the native local D1 and official MCP SDK journey with both historical
  origin and separate-origin relay compositions: preparation, independent signed
  browser approval, journal append, receipt/replay and historical reads.
- Explicit refusals cover mixed-audience assertions on MCP and approval, MCP-only
  assertions on approval, forged assertions, old/wrong origins, bearer/service
  credentials and unrelated relay routes. UTM, CSRF and security response headers
  remain covered by the exercised journey/relay tests.
- TypeScript and diff whitespace check passed. No production freshness/financial
  or new Access routing validation is implied by local tests.
- Wrangler dry-run builds passed for the relay and financial candidate. The latter
  differs from the retained deployment configuration only by the optional confirmation
  origin variable; all existing variables, bindings and audience values are preserved.
- After adding malformed-origin handling, the 10 relay tests and typecheck passed
  again. This is a targeted verification of the added failure case, not a new suite.

Sources consulted 24 November 2026:
- [HTTP Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
- [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
- [Access cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)
