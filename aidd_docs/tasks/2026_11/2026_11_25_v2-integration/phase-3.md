---
status: pending
---

# Instruction: Qualify Linux in Actions and prepare acceptance

## Architecture projection

```txt
.
├── .github/workflows/
│   └── v2-integration-validation.yml ✅
├── README.md ✏️
└── aidd_docs/
    ├── INSTALL.md ✏️
    ├── roadmap.md ✏️
    └── memory/
        ├── architecture.md ✏️
        ├── codebase-map.md ✏️
        └── testing.md ✏️
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Approve integration-branch push and locked ephemeral CI setup | Specific revision tested with bounded standard-runner jobs | system |
| Happy path | Run Python/native-callback and affected TS/native-D1 cases on Linux | Genuine Linux/Python 3.14 results attached to integrated commit | cli |
| Edge case | Native wait ignores SIGTERM or request budget exhausted | Kill/reap/cache cleanup and pre-request cap work on Linux | system |
| Edge case | Workflow runs from another branch or lacks operational credentials | Branch validation cannot dispatch ingestion or deploy | system |
| Teardown | Dispose synthetic fixtures and runner | No private capture/cache/artifact or remote financial write | system |

## Tasks to do

### 1) Add a separate validation-only workflow

1. Do not change quotation-collector.yml or quotation-monitor.yml: their existing
   main-only operational gates remain. A new integration-only workflow uses push
   filtered to the approved integration branch; do not rely on first-time manual
   dispatch of a workflow absent from main. No main change to bootstrap CI.
2. Use Ubuntu 24.04, Node 22 satisfying package engines, Python 3.14 and existing
   lockfiles. Pin action revisions against official sources at implementation;
   reuse inspected checkout/setup-python pins and uv 0.10.4 where appropriate.
   No package/lockfile update or new dependency; locked ephemeral installation
   and branch push need explicit implementation/CI authorization.
3. Permissions contents:read, checkout persist-credentials:false, no collector-live
   environment, secrets inheritance, deployment, production D1/Access binding or
   provider token. No live mode, campaign execution, production API or workflow
   dispatch command in the job. Synthetic network limited to required fixtures/
   native loopback; dependency retrieval is a separately identified setup step.
4. Bound two standard-runner jobs to at most 20 minutes each. Forty job-minutes is
   a timeout ceiling, not a measured bill or unconditional free allowance; verify
   account allowance before execution. No paid runner/service or automatic retry.
5. Run E1/E2/new harness and cadence seams under Linux: this rerun is justified by
   the previously untested platform, not repetition of the acquired Mac campaign.
   Validate POSIX kill/reap, ffi/lib callback support, hard global cap and no-resume.
   Also run phase 2's affected integrated TS/native-D1 checks and typecheck.
6. Keep raw output synthetic; no private journal/mapping/cookies/cache upload.
   Collect only safe test counts, runtime versions and exact tested commit.

### 2) Consolidate integration evidence for owner review

1. Update README/INSTALL/roadmap/memory with retained V1.1.5 and D/E state, actual
   local/Linux results and still-open production gates. Do not rewrite the dated
   live sample or claim the inconclusive pair proved equivalence.
2. Record all A–E branch ancestry, integration commit and safe CI evidence; review
   source/staged scope and secrets via local Git skill before authorized commits/
   push. No automatic branch cleanup or history rewriting.
3. Present integration GO or concrete blocking failures. No main merge, tag/release,
   remote migration, deployment, faster cadence or shared-session/fallback activation
   follows from passing tests. Prepare their separate later approval gates only.
4. Explicit remaining rollout work: real populated-anchor/adoption and recovery
   evidence, remote Access protection of v2 routes, runtime/queue/billed D1/storage
   headroom, immutable retention and controlled operational rollback. No real PEA
   write is required to validate this integration phase.

## Test acceptance criteria

| Task | Acceptance criteria |
| --- | --- |
| 1 | Actual Linux results pass against the integrated revision within bounded jobs; workflow has no operational secret/binding/dispatch path and existing production automation is unchanged. |
| 2 | Reviewable integrated branch with synchronized evidence; no unresolved composition/migration issue, no claim that local/Linux qualification deploys or validates production. |
