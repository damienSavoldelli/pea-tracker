---
status: implemented
---

# V2.0-D — Explicit provider/instrument ingestion grants

## Authority and scope

Owner-approved targeted local change to ingestion-grant uniqueness and synthetic
tests. No commit, deployment, remote/configuration mutation, provider API, routing,
fallback or financial selection change. Preserve pre-existing D1/D2/D3 and study
edits; this is a separate slice, not part of their earlier commit proposal.

## Inspection and decision

`access-collector.ts` rejected a repeated instrument UUID across the entire grant
list, regardless of provider. `QuotationService.ingest` already requires the exact
authenticated subject/provider/instrument triple. D1 observation identity, immutable
storage and replay already include provider. No HTTP, financial or identity-model
change is required. Only the configuration validator's uniqueness key changes.

The tracked synthetic local configuration remains Yahoo-only. No private or remote
grants were read or changed. The shared signed service subject and the existing
service-client ID allowlist remain unchanged; this slice does not introduce separate
provider identities or credentials. All configured grants apply to that existing
collector subject, not to a client-supplied identity.

## Implementation phase — done

Use an unambiguous serialized `(provider, instrument_id)` key in the existing Set.
Accept distinct providers for one instrument; reject repeated exact pairs within
or across entries. Preserve strict shapes, provider/UUID validation, grant-count
and per-entry limits, deny-all empty grants, Access issuer/audience/service identity,
ingestion permission and per-observation checks. No broad cross-product grants.

## Validation

Executed locally on 21 November 2026:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/access-collector.worker.test.ts tests/quotations.contract.test.ts --testNamePattern 'provider|grant|missing, owner|exposes no MCP|partial or invalid configuration|disabled ingestion|authorizes collector' --exclude '**/.wrangler/**'
node node_modules/vitest/vitest.mjs run tests/access-collector.worker.test.ts --testNamePattern 'persists and replays only explicit provider grants' --exclude '**/.wrangler/**'
git diff --check
```

**29 selected tests passed**, 18 unrelated cases skipped, in 53.21 seconds. Ten
new cases cover Yahoo alone; two/three explicit providers on the same UUID;
same-pair duplicates within/across entries; unauthorized providers/instruments;
atomic mixed-batch refusal and refusal of provider/instrument cross products.
Existing cases cover deny-all empty/missing/invalid grants, identity/audience,
disabled ingestion, read/ingestion separation, exact units/timestamps and storage.

TypeScript initially flagged direct property access on an unknown JSON response;
the assertion was corrected without weakening application types. Typecheck passed;
the 3 affected provider persistence/replay cases were rerun on the final assertions
and passed in 7.87 seconds. These are a subset, not 3 additional distinct tests.
Whitespace/local documentation links checked. Only synthetic signed identities and
native local test D1 were used, with injected local JWKS responses; no external
network or provider API calls. No Python rerun or full suite. Index remains empty.

Production diff: only `src/entrypoints/access-collector.ts` changes uniqueness to
the serialized pair. `tests/access-collector.worker.test.ts` adds regression cases.
No authenticator, quotation service/repository, HTTP contract, actual grant
configuration, dependency or migration was changed. Tests persist both streams and
replay the original receipt without duplicates. Earlier D1/D2/D3 edits are preserved.

## Remaining gates

No secondary provider is activated or qualified. Actual configuration changes and
production verification require separate authorization. Supplier-specific client
identities/least privilege, if later required, need a distinct security decision;
the current shared collector identity is deliberately retained. Yahoo-only behavior
and ingestion/financial-read separation must remain unchanged.
