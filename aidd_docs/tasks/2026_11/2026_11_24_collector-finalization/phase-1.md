---
status: done
---

# Instruction: Preserve acquired evidence and prepare D articulation

## Architecture projection

```txt
.
├── aidd_docs/
│   ├── memory/
│   │   ├── architecture.md ✏️
│   │   └── testing.md ✏️
│   └── roadmap.md ✏️
└── collector/
    ├── experiments/
    │   ├── yahoo_cycle.py
    │   └── yfinance_offline.py
    └── pea_collector/
        ├── provider.py
        └── runner.py
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Compare E and finalized D refs read-only | Shared base and branch-specific additions identified | cli |
| Happy path | Reuse unchanged E1/E2 results | 19+14 acquired tests remain attributed to their original campaign | system |
| Edge case | D module absent from E | Integration marked pending, no import pretending it is available | system |
| Edge case | Qualification quota ledger on ephemeral runners | No claim of cross-run reservation authority | system |

## Tasks to do

### 1) Record the verified baseline

1. Completed in this preparation: clean D checked, switched to existing E; no
   checkout of main or modification of its worktree. Current evidence is in plan.md.
2. E1/E2 source and evidence read; results reused, no tests rerun.
3. Update memory/roadmap with scoped current findings, keeping earlier evidence.

### 2) Map contracts before any branch integration

1. D supplies `QuotationProvider`, exact normalization, `FeedPolicy`,
   `select_shadow`, `SnapshotTransport`, `QuotaStore` and reference qualification.
   E1/E2 supply process/session lifetime experiments using existing `collect()`.
2. Yahoo raw fields continue through existing `normalize()`; EODHD bytes use D's
   EODHD parser/normalizer, never Yahoo-shaped metadata with a changed provider name.
3. E owns lifecycle, timing, scheduling and executor metrics. Inject selection and
   budget ports; never rebuild D's router. No EODHD I/O during Yahoo qualification.
4. D `PrivateQuotaLedger` is a bounded 18-unit qualification campaign with local
   flock/atomic journal. Do not repurpose it for indefinite collection or separate
   Actions runners. A future shared authority must reuse existing trusted storage
   only when remote secondary execution is separately authorized.
5. Subsequent authorization implemented: restore D's six source modules, seven
   test files and seven evidence files from `763d9f9`, without index staging or
   branch/history merge. Existing E memory/roadmap edits preserved; source hashes
   verified identical. No application entrypoint imports observation execution.
6. After integration, add only seam cases: Yahoo output accepted by D selector;
   older secondary rejected; missing semantic admission rejected; no quota call
   when EODHD observation is based on already acquired bytes; duplicate portfolio
   requirements fetch once. Reuse D's 80+55 evidence without repeating its suites.

Local seam checkpoint: the new harness imports D's actual `FeedPolicy`,
`select_shadow` and `parse_provider_mappings`. Tests qualify duplicate-demand
union, conflicting identity refusal and old-source-time rejection through these
interfaces. Capturing Yahoo never imports an EODHD executor into the active CLI
or spends an EODHD quota. D remains the single implementation of those policies.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | New documents distinguish prepared, locally tested, observed remote metadata and unverified market behavior; no private values or credentials. |
| 2 | Contract map has one owner per responsibility; pending D dependency explicit, no source duplication or operational activation. |
