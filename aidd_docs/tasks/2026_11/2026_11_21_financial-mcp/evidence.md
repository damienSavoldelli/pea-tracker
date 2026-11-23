# Local evidence — 21 November 2026

**53 distinct targeted tests passed; TypeScript typecheck passed.** No full suite,
broker call, remote D1 operation, secret/configuration/OAuth change, deployment,
commit or push. All financial fixtures and signing keys are synthetic.

Commands used:

```sh
node node_modules/vitest/vitest.mjs run tests/financial-mcp.test.ts tests/transactions.test.ts --exclude '**/.wrangler/**'
node node_modules/vitest/vitest.mjs run tests/portfolio-journal-read.test.ts -t 'exposes additive read-only REST/MCP' --exclude '**/.wrangler/**'
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

- 21 new targeted cases: immutable preparation and separate approval, five financial
  operation types, fee-aware counterposting, no implicit admin promotion, owner and
  portfolio isolation, missing capability/storage, altered input/digest/Boolean,
  exact expiry, nonce rotation, escaping, CSRF, signed browser vs MCP audiences,
  disabled writes, concurrent consumption and durable original receipts.
- End-to-end case uses the **installed official MCP SDK** with Fetch/Hono transport
  and the actual optional `createAccessFinancialWorker` composition. Synthetic
  signed assertions use local JWKS, while storage uses **native local D1/workerd**.
  It exercises MCP preparation → browser GET/form POST → MCP confirmation → existing
  D1 journal → replay and projected read. No hosted ChatGPT/browser or remote Access
  policy is counted as operational proof.
- The same native D1 case covers buy/sell/dividend/deposit/withdrawal/reversal,
  immutable SQL intent, exactly one successful approval/consumption CAS and record
  reconstruction through a new adapter instance. Financial events remain unchanged
  on missing/invalid authorization or unapproved confirmation.
- 31 existing journal/domain/isolated administrative REST cases passed because the
  authorization/preview extraction touches that service.
- One existing historical/projected REST/OpenAPI/MCP compatibility case passed;
  19 unrelated cases in that file were explicitly skipped. Previous financial
  suites were not rerun wholesale.

The optional entrypoint is not referenced by deployed Wrangler configurations.
The existing read/ingestion entrypoints and authentication settings are unchanged.

## Remaining operational acceptance

Configure the browser-only path audience, choose/review the real immutable anchor
and stable portfolio identity, authorize pending migrations/deployment, then prove
the page can only be approved with owner browser authentication. Verify that the
existing connector discovers the new tools after refresh and that a scheduled
task cannot approve an operation. Only then perform an expressly authorized real
journal operation and verify its immutable receipt and projected reads.

Approval consumption precedes journal append. A consumed intent with no receipt
fails closed and needs journal reconciliation/new preparation, not automatic
rearming. This boundary was exercised explicitly, including interrupted-response
resolution and a conflicting journal version. It is not an atomic distributed
transaction claim.

## Local confirmation-navigation fix — 23 November 2026

- Root cause reproduced: the route rejected every nonempty URL query before
  authentication, including ChatGPT's `utm_source=chatgpt.com` navigation tag.
- GET navigation now ignores only `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_term`, `utm_content` and `utm_id`. Other parameter names and all POST
  queries remain rejected. Tracking values are neither rendered nor passed to
  financial services; the form retains its query-free action.
- Access configuration, signed owner/audience checks, CSRF, expiry, exact intent,
  single consumption and journal/idempotency logic are unchanged. Responsive HTML
  uses a viewport and a per-response CSP style nonce, without scripts, external
  assets or `unsafe-inline`.
- Eight added synthetic cases cover tracked/untracked navigation, denied query
  inputs, foreign origins, signed browser identity, expiry, CSRF and explicit
  approval. The existing official-SDK/native-local-D1 journey now opens a tracked
  confirmation URL before approving and replaying the original operation.
- Validation: 28 cases passed in the final file run; its native-D1 integration
  exceeded the existing five-second test deadline, then passed alone with a
  fifteen-second CLI deadline. This establishes 29 distinct passing cases, not
  a new full-suite result. TypeScript and `git diff --check` passed.

Commands: `node node_modules/vitest/vitest.mjs run tests/financial-mcp.test.ts
--exclude '**/.wrangler/**'`; filtered integration rerun with `-t 'official MCP SDK'
--testTimeout 15000`; `node node_modules/typescript/bin/tsc --noEmit`.
No deployment, remote operation, secret/authentication configuration change or
real financial write. Finalization reused these unchanged code/test results.
Synthetic HTML and its CSP were rendered in isolated headless Chrome at 1280px
and 390px: screenshots inspected, no horizontal overflow, mobile rows stacked,
48px approval button and nonce-authorized styling applied. This rendering check
used no real identity, portfolio or approval; opening from ChatGPT and the hosted
Access journey remain unverified for this fix. Release evidence above is historical.
