# Review: Bounded XPAR market calendar

- Rounds: 1
- Started: 2026-11-14

## Round 1 · r-c6a1

- Date: 2026-11-14
- By: damien savoldelli (review performed by Codex)
- Diff: `8fca2c57e0bd7e56d22487a8b017139f1a5cfe11...8fca2c57e0bd7e56d22487a8b017139f1a5cfe11` plus the working tree, tracked and untracked; calendar delivery only. Prior documentary commits excluded from this targeted review; this report excluded from its own diff.
- Axes: code, functional, relevancy
- Verdict: approve
- Score: 3/3 met, 0 unmet, 0 unverified at runtime, 0 out of the diff

### Criteria

- [x] Task 1 — bounded reproducible reference with a usable established profile and prior session, traced provenance and no official-file redistribution — `profiles.json`, `sessions.generated.json`, generator and the 17 passing Python checks recorded in [reference-validation.md](reference-validation.md). Only explicitly assigned XPAR continuous core is admitted; 2026–2027 dates and predecessor seed are bounded. ALXP is not aliased. Half-day dates are established, their intraday phases excluded; unreviewed years break the predecessor chain immediately.
- [x] Task 2 — reuse of the instrument already read and existing MarketContext, with optional configuration isolated from strict owner configuration — `src/application/quotations.ts`, `src/entrypoints/access-read.ts`, `src/adapters/calendar/market-calendar.ts` and recorded reader tests. Assignment/profile/catalogue MICs must agree; missing, malformed, duplicate or unsupported assignments return unknown. Existing two-argument callbacks remain compatible. No extra repository call, runtime network request, authentication relaxation or write route.
- [x] Task 3 — shared REST/MCP results, unchanged exact amounts and freshness policy, integrated targeted checks — the 127 passing TypeScript tests, typecheck and local Worker dry-run recorded in [reference-validation.md](reference-validation.md), from the same pre-commit HEAD and unchanged implementation reviewed here. No tests rerun for this static review. Domain freshness, financial arithmetic, OpenAPI/MCP contracts, migrations, dependency manifests, schedules and monitoring are outside the changed paths and remain unchanged.

No code, functional or relevancy finding. Approval concerns the local delivery and
commit only; it does not approve production activation or prove hosted CPU budgets.
Renewal beyond 2027, real instrument/profile verification and exceptional market
closures remain the documented limits. The scheduled V1 cycle remains unconfirmed.
