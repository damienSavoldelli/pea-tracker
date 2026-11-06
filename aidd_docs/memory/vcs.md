# VCS

## Setup

- GitHub repository: `damienSavoldelli/pea-tracker`; main branch: `main`.
- Public source, private financial data. No issue tracker integration, repository commit hooks or CI workflow is currently configured. Plugin SessionStart behavior is separate; see below.

## Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): imperative description`; use `!` and a `BREAKING CHANGE:` footer for breaking changes.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `revert`. Use a scope when it clarifies the affected area.
- Scopes: `aidd` for project context; `architecture` for the baseline; `api`, `mcp`, `auth`, `portfolio`, `decimal`, `collector`, `db`, `ops`, `ci` for their corresponding work when it exists.
- Synthetic example: `docs(aidd): clarify memory loading and approval rules`.
- No branch-naming standard is established. Create branches only when instructed.

## Approval boundaries

- Intentional staging, commits and pushes each require explicit user authorization covering that action. Permission to edit, validate or commit does not imply permission to push.
- Production or non-production deployments, cloud-resource creation, paid-service activation and release publication require explicit approval for the specific action; a commit, push, merge or architecture approval is insufficient.
- Inspect `git status --short`, `git diff` and `git diff --cached` before authorized Git writes. Report unexpected staged changes; do not stage, unstage or discard them without approval.

## AIDD SessionStart hook

- The inspected AIDD Context plugin registers SessionStart to run `hooks/update_memory.js` without tool arguments.
- In that automatic mode, if synchronization changes context blocks or the memory README index, the script invokes `git add` for the files it changed. It does not commit or push. Already-current files are not staged by this path.
- Invocation with named tools skips the script's staging branch, but still rewrites context files. This describes inspected behavior, not authorization to run it.
- This is plugin behavior, not a repository Git hook. Its installation does not prove that it runs in every host/session. Do not enable, modify or invoke hooks without approval.
- When reviewing unexpected index changes, consider SessionStart synchronization; report the changes and preserve the index until the owner authorizes a correction.
