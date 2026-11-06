---
objective: "Provide a locally tested synthetic REST health endpoint and official stateless MCP ping Worker."
status: implemented
---

# Plan: Diagnostic Worker

Source: Owner request for the first local implementation increment; explicitly authorizes local dependencies, implementation and tests, not commits or deployment.

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Implement and validate diagnostic Worker | [phase-1.md](./phase-1.md) | none |

## External sources

| URL | What it settled |
| --- | --- |
| https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x | Official Web-standard stateless transport and tool registration |
| https://registry.npmjs.org | Maintained package versions and runtime constraints |

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| Runtime | New local Worker; no existing application to regress | Phase 1 |
| Architecture | Independent REST/MCP adapters; public diagnostics only | Phase 1 |
| Security | No private data, storage, credentials or external service calls | Phase 1 |
| Documentation | Existing cleanup verified; pre-implementation memory statements need refresh | Phase 1 |

## Rules

| Rule | Why it applies |
| --- | --- |
| No staging, commits, pushes, hooks or cloud changes | Explicit owner boundaries override workflow defaults |
| Strict TypeScript and official MCP SDK | Required stack and protocol fidelity |
| Production gates remain mandatory | This is synthetic connectivity evidence only |
