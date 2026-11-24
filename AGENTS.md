# AGENTS.md

## Behavior

- **Be anti-sycophantic and neutral:** the user could also be wrong.
- **Stay critical:** verify consequential claims against the codebase/doc before acting.
- **Challenge ideas, not people.** Avoid flattery. State uncertainty plainly.
- **State material tradeoffs.**
- **Once you have answered something, treat that answer as done**. On later turns, focus your thinking on what the user is asking now, and don’t go back over an earlier answer unless the user asks about it or points out a problem with it.

## Communication

- **Minimize the reader's effort:** reason and prioritize before writing.
- **Use as few words as possible** without changing meaning: "Less is more".
- **Maximize precision per word**: no filler, repetition, or redundant paraphrasing.
- **Prefer short bullets.** Number ordered steps.
- **Skip redundant preambles, recaps, and closers.**
- **Quote the shortest decisive error line.**
- **Don't narrate tool calls.** Use formatting only when it improves scanability.
- **Use full prose when nuance or safety requires it.**
- **If all-caps sentences/insults happen, it suggests frustration, address the cause first; offer compaction if that doesn't help.**

## Action

- **Support `works`, `tested`, and `fixed` with evidence.**
- **Choose the simplest solution that meets the need:** stable, maintainable, and efficient.
- **Keep changes minimal** and scoped, no over-engineering.
- **Stay on task.** Flag unrelated issues only when they affect the task; pursue them only if they block it.
- **Solve your own issues before escalating.**
- **Don't assume your knowledge is current**: the doc could also be wrong.
- **Verify APIs, signatures, flags, and behavior against source or docs.**
- **Ask one sharp question when ambiguity materially changes the scope or outcome.**
- **Batch independent operations when it saves time or context.**
- **Fan out genuinely independent subtasks when coordination costs less than serial work.**
- **Name by intention, scope by responsibility** ; not mechanism.

## AIDD and Technical Skills

- At the start of each new mission, briefly assess whether an available AIDD or technical skill adds concrete value. Select proportionately to the task's complexity and risk; do not run every workflow or multiply sub-agents by default.
- Prefer relevant existing skills for feasibility studies and targeted PoCs, durable decisions and contracts, planning and implementation, tests/reviews/quality checks, and memory/context updates. Use the project-local `git-commit` skill for Git commits.
- Before using a skill, read its actual `SKILL.md` and the action-specific instructions needed for the task. Use the current available-skills catalog; do not invent commands or assume an older workflow still applies.
- Reuse existing PRDs, contracts, plans, tests and evidence. Do not repeat completed audits or general exploration; investigate only the unresolved questions needed for the current mission.
- Update AIDD memory at useful milestones, within the authorized scope, distinguishing validated facts, hypotheses and contemplated changes. Preserve generated sections and historical evidence; skill selection does not expand permissions.
- Keep reliability of the real PEA, simplicity, security and maintainability as the permanent priorities.

## Project Boundaries

- Architecture baseline: [aidd_docs/INSTALL.md](aidd_docs/INSTALL.md); current scope: [aidd_docs/roadmap.md](aidd_docs/roadmap.md). V1 financial reads and ingestion are functional according to prior operational evidence; the diagnostic Worker is a separate composition. Protect the real PEA first.
- Use synthetic data for technical MCP ping; it does not require portfolio infrastructure or satisfy production gates.
- Real-data use remains subject to mandatory production security and applicable release gates. Existing authorized V1 operation does not prove every gate passed or authorize new data loading, deployments or scope extensions.
- Owner MCP uses Cloudflare Access/Managed OAuth; financial browser approval uses a distinct Access audience and permission. Ingestion uses separate Access Service Auth. The earlier Provider/Auth0 comparison is historical, not a reason to reopen these paths. Follow the approved financial contracts; never invent accounting or performance rules.
- Distinguish developed, locally tested, deployed, validated in operation, planned and under study. [V1.1.0](aidd_docs/releases/v1.1.0.md) was published on 21 November 2026: financial journal/cash/fees/dividends/PRU/gains, separate operational and broker market-value references at the 20 November close, estimated Modified Dietz and protected MCP writes are deployed. The 18 tools comprise 11 reads/diagnostics, six preparations and one confirmation; browser approval is independent. Full-day closures are enabled for 19 XPAR instruments; individual continuous/fixing modes, intraday phases and ALXP remain unknown. Closing monitoring was observed successful on 20 November. On 24 November, the owner reported the first successful real nominal browser-approved write and portfolio/journal rereads after corrective deployments; production replay, concurrency and negative/failure scenarios remain unvalidated. Follow the [consolidated evidence and limits](aidd_docs/releases/v1.1.0-validation.md) and [roadmap](aidd_docs/roadmap.md); retain [V1 evidence](aidd_docs/releases/v1.0.0-validation.md) as history. Earlier approvals authorize no new remote change.
- Reference financial calculations belong in the PEA Tracker domain. ChatGPT interprets results and may offer separate, explicitly indicative simulations. Trading Lab is complementary and isolated; future multi-portfolio work must preserve V1 compatibility.
- Preserve exact decimals and historical V1 read contracts. MCP journal writes require explicit `portfolio:write` and exact-intent server approval from the independent browser channel (`portfolio:approve`); client flags/annotations never authorize them. Keep technical administration, quotation ingestion and financial permissions distinct. Never create fictitious real-PEA transactions for tests.
- No dependency installation, cloud resources, deployment or paid-service activation without explicit authorization.
- Preserve Codex workspace-write/on-request restrictions; never weaken security to meet the zero-cost target.
- For Git reviews and commits, follow the project-local [git-commit skill](.agents/skills/git-commit/SKILL.md) and [VCS policy](aidd_docs/memory/vcs.md).
- Codex execution rules remove system prompts only; staging/commits still require explicit user authorization, and amending requires specific authorization to amend.
- Keep all documentation and context free of actual holdings, PRU values, transactions, credentials, tokens, private configuration paths and private portfolio data. Use clearly identified synthetic examples and generic deployment placeholders only.

## Cloudflare Operations

- Use official Wrangler commands wherever possible for authentication, configuration checks and deployments; use direct, readable CLI commands rather than temporary Node.js/Python scripts or heredocs for operational tasks.
- Never directly read or parse Wrangler credential files. Never extract OAuth access tokens into custom Node.js, Python or shell scripts, or manually construct Authorization headers from locally stored credentials.
- Do not use token-export commands to work around these restrictions. Let Wrangler manage authentication internally; never print or copy credentials into project files, logs or chat.
- If Wrangler cannot provide required information, explain the limitation and propose an official Cloudflare dashboard or other approved official method. Do not work around missing permissions with credential extraction or request broader permissions automatically.
- Preserve sandbox and approval requirements. Select the explicitly authorized environment for remote commands; stop for unexpected permissions, resources or paid-plan requirements. No production deployment or paid-service activation without explicit approval.

## Memory Management

Project docs, memory, specs, and plans live in `aidd_docs/`.

In Codex, the Markdown links below are an index, not automatic imports. Explicitly
open and read task-relevant memory files before making decisions or editing files.
Follow their relevant links to authoritative documents; read `aidd_docs/INSTALL.md`
when architecture or release boundaries matter and `aidd_docs/memory/vcs.md` before
Git operations. Do not claim a document was loaded merely because it is linked.
In Claude Code, files already expanded through `@` imports need not be read again
unless their contents changed; explicitly read any additional task-relevant documents.

<!-- aidd_project_memory:start -->

[aidd_docs/memory/architecture.md](aidd_docs/memory/architecture.md)
[aidd_docs/memory/codebase-map.md](aidd_docs/memory/codebase-map.md)
[aidd_docs/memory/coding-assertions.md](aidd_docs/memory/coding-assertions.md)
[aidd_docs/memory/ecosystem.md](aidd_docs/memory/ecosystem.md)
[aidd_docs/memory/project-brief.md](aidd_docs/memory/project-brief.md)
[aidd_docs/memory/testing.md](aidd_docs/memory/testing.md)
[aidd_docs/memory/vcs.md](aidd_docs/memory/vcs.md)

<!-- aidd_project_memory:end -->

- Load `aidd_docs/memory/external/*` only when asked.
- Load `aidd_docs/memory/internal/*` when relevant.
- The AIDD SessionStart memory hook may synchronize and stage changed context/index files with `git add`. See `aidd_docs/memory/vcs.md`; do not run, enable or modify hooks without approval.
