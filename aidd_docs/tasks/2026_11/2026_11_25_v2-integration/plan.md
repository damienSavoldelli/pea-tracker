---
objective: "Integrate A–E on a separate V2.0 branch preserving V1.1.5 discovery/security and qualifying synthetic Linux execution without production writes."
status: pending
---

# Plan: Global V2.0 integration

Source: owner approved a branch inventory and integration plan after E closure.
Preparation only, performed from `feat/v2.0e-collector-optimization` at `b827a3c`.
No branch creation, merge, implementation, staging, commit, push or CI dispatch
is performed by this preparation. Do not touch the pea-tracker-main worktree.

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Assemble D/E over V1.1.5 and reconcile MCP discovery | [phase-1.md](./phase-1.md) | none |
| 2 | Validate integrated contracts and additive migrations locally | [phase-2.md](./phase-2.md) | 1 |
| 3 | Qualify Linux through isolated Actions and prepare integration acceptance | [phase-3.md](./phase-3.md) | 2 |

## External sources

| URL | What it settled |
| --- | --- |
| https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow | Official manual-workflow guidance requires availability on the default branch. Do not assume a new branch-only workflow can initially be dispatched manually. |
| https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax | Branch-filtered push trigger is available for an integration-only validation workflow without modifying main. |

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| runtime | No current runtime change. Future validation uses synthetic local D1 and Actions without provider/financial secrets or production writes. Cloud runtime and deployment remain unverified/out of scope. | 2, 3 |
| regression | High: V1.1.5 and B both register list_portfolios; installed MCP SDK rejects duplicates. C approval policy must coexist with the V1.1.5 discovery service. New composition requires targeted checks even though isolated checks passed. | 1, 2 |
| architecture | Preserve hexagonal/API-first services, one discovery tool, separate read/write/browser/ingestion permissions, one shared quotation stream. No provider activation or financial arithmetic change. | 1, 2 |
| documentation | Consolidate current V1.1.5 and D/E evidence, preserve dated history, document Linux result and remaining rollout gates. | 1, 3 |

Verified local and remote tips on 25 November, using read-only git ls-remote:

| Ref | Tip | Commits absent from main | State |
| --- | --- | --- | --- |
| main | cc0b54b | 0 | V1.1.5 hosted-discovery incident closed; tag v1.1.5 is 5b12e25 |
| feat/v2.0a-portfolio-registry | fcb122d | 3 | Local GO, registry/openings/migration 0008 |
| feat/v2.0b-portfolio-reads | 73bd5de | 6 | Local GO, inherits A; reads/REST/MCP |
| feat/v2.0c-portfolio-writes | ad12726 | 9 | Local GO, inherits B; real/simulated circuits/migration 0009 |
| feat/v2.0d-multi-provider | 763d9f9 | 18 | Bounded observation closure, inherits C |
| feat/v2.0e-collector-optimization | b827a3c | 21 | Bounded sample closure, inherits C and earlier D foundation |

All six local tips match GitHub. These are cumulative ancestry counts, not distinct
feature counts. All feature branches lack the four main commits after common base
`3410ebf`. A is ancestor of B, B of C, C of D and E; D is not ancestor of E.
D/E common base is `4536f55`, with 3 D-only and 6 E-only commits. E copied D's
20 finalized source/test/evidence files exactly; their commits still need ancestry
reconciliation. Core D/E differences are cadence/monitor/scheduler plus E experiments,
tests and documents, not a second provider implementation. Lockfiles/manifests have
no differences between main and E.

Read-only legacy three-tree preview against main/E detected conflict markers in:
`aidd_docs/memory/codebase-map.md`, `aidd_docs/memory/testing.md`,
`aidd_docs/roadmap.md`, the financial MCP contract, `src/application/financial-mcp.ts`
and `tests/financial-mcp.test.ts`. D/E preview detects three memory-file conflicts.
These previews are advisory, not a completed merge of the future integration tree.
MCP handler changes appear textually mergeable but introduce the semantic duplicate.

## Rules

| Rule | Why it applies |
| --- | --- |
| AGENTS.md, INSTALL.md and memory/vcs.md | Protect real PEA, exact decimals, historical contracts and explicit Git/cloud approval boundaries. |
| V1.1.5 discovery and C financial contracts | Keep owner-authorized UUID discovery, independent real approval, simulated confirmation and immutable receipt/hash compatibility. |
| D/E accepted limits | Yahoo principal, EODHD observation, TNO exclusion, no new supplier call; default 30 minutes and existing closing/freshness policy. |
| Owner Linux deferral | Validate on GitHub Actions at global integration, without Docker or production writes; do not reinterpret this as prior Linux success. |

## Decisions

| Decision | Why |
| --- | --- |
| Proposed integration/v2.0 from current main, then D, then E | Includes A/B/C by ancestry and retains V1.1.5. Two purposeful feature merges suffice; do not cherry-pick copied D files again or replay five redundant merges. |
| A single list_portfolios registration selected by composition | Legacy composition uses configured-owner discovery; V2 composition uses owned registry metadata. No duplicate tool and no reopening of the discovery incident. |
| Separate validation workflow on the integration branch | Existing collector jobs require main and include live paths; do not relax those protections or modify main to bootstrap validation. |
| Integration acceptance is separate from production readiness | No remote migration, main merge, tag/release, deployment, fallback or faster cadence activation is included. |
