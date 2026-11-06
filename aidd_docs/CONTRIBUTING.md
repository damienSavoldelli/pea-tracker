# Contributing to this project's AI context

How to maintain PEA Tracker's existing AIDD context. For authoring AIDD artifacts, see the framework guide: <https://github.com/ai-driven-dev/framework/blob/main/CONTRIBUTING.md>.

## Changing project memory

Add or edit a file under `aidd_docs/memory/`. See [`memory/README.md`](memory/README.md) for what belongs there and how it loads.

- Keep one concern per root memory file; internal notes belong in `memory/internal/`, external references in `memory/external/`.
- Record durable approved decisions, conventions and gotchas. Link to [INSTALL.md](INSTALL.md) for architecture details; keep feature requirements in the PRD/specifications and temporary work in task documents.
- Distinguish proposed, implemented and verified behavior. Never store actual portfolio data or secrets; use clearly identified synthetic examples.
- Preserve `aidd_project_memory` and `files` marker pairs and their generated indexes. If bank membership changes, request approval before running synchronization; the automatic SessionStart hook can stage changed files. See [vcs.md](memory/vcs.md).

## Adding AI content (skills, rules, agents, commands, hooks)

- Use the generator skills (`aidd-context:04-skill-generate` through `08-hook-generate`, and `10-learn` for memory or rules). They scaffold the right shape and write to the right place for each tool you use.
- Open a pull request for anything that changes how the AI behaves on this project. The team reviews it like any code change.
- Do not enable, modify or run hooks without approval. Do not introduce another memory framework or alter Codex sandbox settings as part of context maintenance.

## Adding recipes

Create or edit project recipes under `aidd_docs/recipes/`. Use the cook skill when available so new recipes follow the shared contract and do not overwrite bundled framework recipes.

## House conventions

- Use descriptive lowercase kebab-case filenames for new memory/task documents; preserve established names such as `INSTALL.md` and `GUIDELINES.md`.
- Put shared assistant behavior in root `AGENTS.md`; `CLAUDE.md` imports it and retains its AIDD-managed memory imports. Avoid duplicating shared policy in Claude-specific prose.
- Check local Markdown links, AIDD reference sets, marker pairs and whitespace after changes. Review working-tree and index state; follow [Conventional Commits and approval requirements](memory/vcs.md) without staging, committing or pushing unless authorized.
