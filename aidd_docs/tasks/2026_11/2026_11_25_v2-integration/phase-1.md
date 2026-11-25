---
status: pending
---

# Instruction: Assemble branches and reconcile V1.1.5 discovery

## Architecture projection

```txt
.
├── src/adapters/mcp/
│   ├── handler.ts ✏️
│   ├── financial-tools.ts ✏️
│   └── portfolio-reads.ts ✏️
├── src/application/financial-mcp.ts ✏️
├── tests/
│   ├── financial-mcp.test.ts ✏️
│   └── v2-integration.test.ts ✅
└── aidd_docs/
    ├── memory/
    │   ├── architecture.md ✏️
    │   ├── codebase-map.md ✏️
    │   └── testing.md ✏️
    ├── roadmap.md ✏️
    └── tasks/2026_11/2026_11_21_financial-mcp/contract.md ✏️
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Recheck clean worktree and pinned refs before authorized assembly | Correct integration base and protected main/worktree unchanged | cli |
| Happy path | Initialize combined financial/registry MCP composition | Exactly one list_portfolios registration and successful official SDK discovery | api |
| Edge case | Use legacy composition without registry service | V1.1.5 configured-owner discovery/query/envelope preserved | api |
| Edge case | Wrong owner, missing permission, opening ID or archived portfolio | No cross-owner disclosure or authority inferred from client UUID/annotations | api |
| Teardown | Dispose synthetic fixtures/transports | No real portfolio/remote state touched | system |

## Tasks to do

### 1) Assemble only after owner authorization

1. Current task creates only plan documents. Later approval must cover the new
   integration branch, D/E merges and any commits; do not modify existing main
   or pea-tracker-main. Abort preparation for changed refs/unowned dirty files.
2. Create proposed integration/v2.0 from main cc0b54b (or review a newer main tip
   first), merge D 763d9f9, resolve and perform task 2's discovery fix/SDK regression
   immediately on that composition before proceeding to E. Once D plus V1.1.5
   initializes correctly, merge E b827a3c and recheck the same integrated SDK path.
   A/B/C are included through D; no separate replay or force/reset operation.
3. Preserve both V1.1.5 discovery code and C's FinancialPolicy/versioned approval
   types in financial-mcp.ts. Keep the newer V1.1.5 authorization/descriptive
   guidance; combine all tests instead of picking a whole branch's version.
4. Consolidate current memory/roadmap/contract evidence, preserving dated records.
   For the E merge, retain D's final docs plus E closure/cadence; identical copied
   D source files must remain identical. Reinspect actual conflicts rather than
   treating the read-only preview as exhaustive.

### 2) Resolve the semantic MCP collision

1. Before the fix, add an SDK regression case for both services present, detecting
   the installed SDK error `Tool list_portfolios is already registered`.
2. Make composition choose discovery ownership: registry-backed service when
   present; configured-owner FinancialMcpService fallback for legacy composition.
   Prefer an explicit small registration option/default preserving V1.1.5 over
   runtime duplicate-name catching, swallowing errors or renaming a public tool.
3. Preserve list query limit/after, data[].id/kind/status, page.next_after and
   read_only semantics. Review the richer V2 metadata envelope explicitly; never
   infer financial write permission from read_only or an opening-state identifier.
4. Preserve real/simulated versioned financial intents, V1 hash bytes/receipts,
   exact owner/permission checks and independent browser audience. No passkey,
   authentication-policy change, financial formula change or broker action.
5. In tests assert unique names and required capabilities for each composition;
   reconcile the legacy 19 versus V2 26 tool-count assertions using the actual
   authorized capability set, not an unexplained new magic count.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Integration includes pinned main/A/B/C/D/E ancestry, no main/worktree alteration, no copied implementation fork or unresolved conflict marker. |
| 2 | SDK initializes both legacy and V2 compositions with exactly one discovery tool; old discovery/financial and current V2 authorization contracts pass targeted checks. |
