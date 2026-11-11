# AI Operating Guidelines

Project-specific conventions for AI-assisted work on PEA Tracker.

## House rules

- Treat [INSTALL.md](INSTALL.md) as the approved baseline; distinguish design decisions from implemented or tested capabilities.
- Scope technical MCP connectivity work to synthetic data. Private-data production gates remain mandatory; do not invent accounting/performance rules before the PRD defines them.
- Preserve modular REST/MCP boundaries, exact decimal arithmetic, separate administrative authorization and the open OAuth evaluation.
- Explicitly read task-relevant context; links in Codex are not automatic imports. Preserve AIDD-managed markers and use the existing memory bank.
- Never put actual holdings, PRU values, transactions, credentials, tokens, account identifiers or private financial exports in documentation, memory, examples or logs. Label invented numeric examples as synthetic.
- Preserve Codex sandbox settings. Dependencies, cloud resources, hooks, paid services and deployments require explicit authorization; follow [VCS approval rules](memory/vcs.md).

## Adaptive orchestration and delegation

- At the start of each development slice, assess whether parallel agents or AIDD Orchestrator would improve delivery; consider dependencies, integration effort and coordination cost.
- Prefer one agent for simple or strongly sequential work. Delegate independent tasks to parallel Codex subagents only when the expected time or quality gain is concrete; do not multiply agents without that benefit.
- For complex work across components, dependencies or cross-validation, evaluate AIDD Orchestrator when available to organize responsibilities and integration. Direct delegation is sufficient when it meets the need; Orchestrator is not mandatory.
- Before delegation, define each agent's deliverable, dependencies and distinct file ownership. Keep shared-file edits sequential and coordinate changes to shared contracts before implementation.
- Keep the primary agent accountable for technical coherence, integration, tests and final validation. Review delegated results before treating the slice as complete.
- Preserve approved business and architecture decisions and all existing security and authorization boundaries. Delegation does not expand permissions; unavailable orchestration tooling does not authorize installation or framework changes.

## Validation depth

- For documentation changes, check local links, AIDD memory references, marker integrity, whitespace and the intended file scope; inspect both working-tree and staged changes without staging files.
- For future implementation, run the checks actually configured for the affected behavior; report missing checks instead of inventing commands or results.
- Before an approved merge or release, provide relevant validation evidence and unresolved gates. Documentation approval or a successful ping does not authorize deployment or real-data use.

## When the AI drifts

- Re-read the current request and relevant baseline sections, identify the scope mismatch and correct only the affected work. Do not restart onboarding or redesign approved decisions without instruction.

For the general AIDD playbook (planning, review loops, prompting and context hygiene, anti-patterns), see the framework docs: <https://github.com/ai-driven-dev/framework>.
