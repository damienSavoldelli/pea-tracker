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
