# AI Operating Guidelines

Project-specific conventions for AI-assisted work on PEA Tracker.

## House rules

- Treat [INSTALL.md](INSTALL.md) as the architecture baseline and [roadmap.md](roadmap.md) as the current scope reference. Read the dated supplement of the [financial PRD](tasks/2026_11/2026_11_08-financial-backend-prd.md) alongside its original approval. Distinguish developed, locally tested, validated in operation, planned and under study.
- Scope technical MCP connectivity work to synthetic data. Private-data production gates remain mandatory; do not invent accounting/performance rules before the PRD defines them.
- Preserve hexagonal REST/MCP boundaries, exact decimal arithmetic and separate administrative authorization. REST/MCP share services directly; Python retrieves provider data separately and delivers to ingestion. Owner Access/Managed OAuth and machine Access Service Auth are the current paths; the older OAuth comparison is historical.
- Protect the real PEA first. [V1.1.0](releases/v1.1.0.md) is published: journal, cash, fees/dividends, PRU/gains, broker-reference Modified Dietz and protected financial MCP are deployed. Historical V1 and the distinct operational reference are preserved. No first real owner-approved write/receipt/replay is yet production-validated. Reference calculations belong in the domain; ChatGPT may provide distinct, explicitly indicative simulations. Trading Lab remains complementary and isolated.
- Use [consolidated V1.1 evidence](releases/v1.1.0-validation.md) for the 19 XPAR closure-only assignments, explicitly unknown individual modes/intraday/ALXP and successful 20 November closing monitor. The [V1 runbook](tasks/2026_11/2026_11_14_live-quotations-read/runbook.md) and its earlier pending checkpoints are historical. Publication and local tests do not prove real financial writes, independent alerts or complete recovery/security readiness.
- Existing approvals are bounded to their original operations; they never grant permanent permission for future writes, tests, deployments or remote changes. Preserve V1 contracts and dated evidence; update historical status through explicit dated context rather than rewriting its original acceptance.
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
