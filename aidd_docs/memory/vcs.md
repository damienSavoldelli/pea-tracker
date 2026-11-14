# VCS

## Setup

- GitHub repository: `damienSavoldelli/pea-tracker`; main branch: `main`.
- Public source, private financial data. The collector and cycle-monitor workflows exist under `.github/workflows/`, with manual dispatch and published weekday schedules. They guard jobs to `main`; local work on another branch does not change V1 automation. These are collection/monitoring workflows, not an automatic deployment pipeline. See the [collector guide](../../collector/README.md).
- No issue tracker integration or repository commit hook is recorded by the existing project context; this refresh did not inspect machine-local hook configuration. Plugin SessionStart behavior is separate; see below. Schedule publication does not prove scheduled execution; the pending V1 check is in the [runbook](../tasks/2026_11/2026_11_14_live-quotations-read/runbook.md).

## Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): imperative description`; use `!` and a `BREAKING CHANGE:` footer for breaking changes.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `revert`. Use a scope when it clarifies the affected area.
- Scopes: `aidd` for project context; `architecture` for the baseline; `api`, `mcp`, `auth`, `portfolio`, `decimal`, `collector`, `db`, `ops`, `ci` for their corresponding work when it exists.
- Synthetic example: `docs(aidd): clarify memory loading and approval rules`.
- No branch-naming standard is established. Create branches only when instructed.
- V1.1 documentary preparation uses the explicitly authorized local branch `feat/v1.1-financial-management`, created from the expected local V1 `main` base. This choice does not establish a general naming convention or authorize a future branch, commit, merge or push.

## Direct Git execution

- Use the installed `git-commit` skill for Conventional Commits and logical grouping; execute Git operations as direct, explicit Git CLI commands.
- Do not generate temporary Node.js or Python scripts to orchestrate Git. Do not wrap Git commands in `node -e`, heredocs, shell scripts or subprocess calls unless the owner explicitly requests it.
- Run each command separately and transparently, in this order; staging and committing still require explicit approval:

1. `git status`
2. `git diff --check`
3. `git diff`
4. `git add -- <explicitly approved files>`
5. `git diff --cached --check`
6. `git diff --cached`
7. `git commit -m "<conventional commit message>"`

- Keep security checks proportional to the change and separate from Git operations. Never hide staging or commits inside a validation script.
- Preserve sandbox restrictions and approval policy; request normal escalation when required, never work around it. No automatic push or deployment.

## Approval boundaries

- Intentional staging, commits and pushes each require explicit user authorization covering that action. Permission to edit, validate or commit does not imply permission to push.
- Production or non-production deployments, cloud-resource creation, paid-service activation and release publication require explicit approval for the specific action; a commit, push, merge or architecture approval is insufficient.
- Prior V1 publication/deployment approvals are historical and operation-specific, not standing permission for future remote commands. A local tracking ref is cached evidence, not a fresh remote check; do not fetch/pull/push merely to synchronize documentation. No V1 tag/release has been created according to the handover; final scheduled-cycle validation remains pending.
- Inspect `git status --short`, `git diff` and `git diff --cached` before authorized Git writes. Report unexpected staged changes; do not stage, unstage or discard them without approval.

## AIDD SessionStart hook

- The inspected AIDD Context plugin registers SessionStart to run `hooks/update_memory.js` without tool arguments.
- In that automatic mode, if synchronization changes context blocks or the memory README index, the script invokes `git add` for the files it changed. It does not commit or push. Already-current files are not staged by this path.
- Invocation with named tools skips the script's staging branch, but still rewrites context files. This describes inspected behavior, not authorization to run it.
- This is plugin behavior, not a repository Git hook. Its installation does not prove that it runs in every host/session. Do not enable, modify or invoke hooks without approval.
- When reviewing unexpected index changes, consider SessionStart synchronization; report the changes and preserve the index until the owner authorizes a correction.
