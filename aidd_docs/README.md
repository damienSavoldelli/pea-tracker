# Project AI Docs

Structured context the AI assistant reads to work on this project, so it does not rediscover the codebase each session. AIDD generates this folder and keeps it in sync.

## What lives here

- `memory/`: the project memory bank, explicitly read as relevant in Codex and imported through `CLAUDE.md` in Claude Code. See [`memory/README.md`](memory/README.md).
- `recipes/`: project-specific how-to recipes created or updated by the cook skill.
- `GUIDELINES.md`: how this team operates the AI on this project.
- `CONTRIBUTING.md`: how to add or change project context.
- `tasks/`: specs, plans, and run summaries, created as work happens.

The project memory block inside each AI context file (`CLAUDE.md`, `AGENTS.md`, and the rest) is generated and kept in sync, never edited by hand. To change the index, add or remove files under `memory/`; Codex must still explicitly read relevant targets. Preserve the generated markers and obtain approval before running synchronization: the automatic SessionStart hook may stage changed context/index files. See [`memory/README.md`](memory/README.md) for loading behavior and [`memory/vcs.md`](memory/vcs.md) for hook and Git approval boundaries.

## The framework

AIDD ships skills, agents, rules, and generators as a plugin marketplace. For the full catalog, the install guide, and the end-to-end workflow, see the framework docs: <https://github.com/ai-driven-dev/framework>.
