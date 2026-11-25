---
status: done
---

# Instruction: Validate integrated API and financial boundaries locally

## Architecture projection

```txt
.
└── tests/
    └── v2-integration.test.ts
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Build synthetic populated V1.1 state through existing local D1 fixtures | Independent owners/real/simulated anchors, proposals and receipts available | system |
| Happy path | Apply existing 0008 then 0009 locally and call combined REST/MCP | Legacy values/hashes/receipts preserved and V2 reads resolve owned portfolios | api |
| Edge case | Read another owner, confirm archived/stale/version-mismatched intent | Explicit denial without cross-portfolio mutation | api |
| Edge case | Mixed-audience MCP token presented to browser approval | Independent browser permission still required | api |
| Edge case | Existing quote is newer than secondary or semantics unqualified | D rejects regression; E never activates EODHD or duplicates collection by portfolio | system |
| Teardown | Close native local D1 and synthetic network fixtures | Ephemeral owned test state cleaned; no remote resource accessed | system |

## Tasks to do

The dedicated test file is created in phase 1; phase 2 extends it after that
dependency is satisfied. No file is created or modified by this plan preparation.

### 1) Run only seam and affected regression checks

1. Reuse A's 19+2, B's 35 and C's 55 dated evidence, their later V1.1.4 sync
   evidence, D 80+55 and E acquired checks. These overlap; never sum them as one
   new campaign. No supplier rerun, real PEA operation or fabricated real event.
2. Because combined composition changes, run targeted financial-mcp, registry,
   reads, financial-worker, registry/write-migration and affected V1.1.5 discovery
   cases, plus strict typecheck. Add only missing integrated scenarios in the
   dedicated test file; do not duplicate existing financial arithmetic tests.
3. Use the existing ID-free local Wrangler/D1 fixture only; no --remote, private
   config, credentials or remote bindings. Preserve 0008/0009 source migrations;
   verify populated upgrade and replay, not a destructive reset of source history.
4. Verify all V1.1 discovery guards: wrong opening UUID, foreign owner, no permission,
   strict query bounds, configured-portfolio legacy fallback. V2 includes active/
   archived owned listing, isolated real/simulated reads and no administration tool.
5. Verify independent real browser approval versus explicit simulated confirmation,
   expiration/concurrent consumption and archive guards using existing synthetic
   tests. A local pass is not hosted Access/security acceptance.

### 2) Preserve the collector boundary

1. Confirm shared provider/kind/adjustment observations are reused across portfolio
   needs; no new provider call, grant, catalogue change or fallback activation.
2. Reuse D's unchanged normalization/quota/selection evidence; test only altered
   D/E/combined seams. Qualification ledger remains a local campaign, not a
   distributed budget store for independent runners.
3. Preserve production default 30 and final-slot monitoring. No live qualification
   command in test scripts. The completed Yahoo 12-fetch/52-HTTP receipt remains
   private/ignored, untouched and non-replayable for new collection.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Combined local SDK/REST/auth/migration checks pass on synthetic data; prior immutable financial payloads and owner isolation survive; exact validation commands/results recorded. |
| 2 | No collector/valuation/provider activation; integrated source retains one selector/normalizer and unchanged operational default/freshness/closing semantics. |

## Execution evidence

See [integration evidence](./evidence.md) for merged revisions, exact commands,
local outcomes and retained production gates.
