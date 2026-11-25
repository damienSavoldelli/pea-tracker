---
objective: "Qualify cycle-session optimization and a configurable Yahoo cadence without changing production, quotation semantics or financial data."
status: implemented
---

# Plan: V2.0-E collector qualification and cadence

Source: owner request of 24 November 2026, after acceptance of D at `763d9f9`.
Branch `feat/v2.0e-collector-optimization`, inspected at `322c0e5`.
The local cadence slice, bounded capture harness and D source articulation are
implemented/tested, default unchanged. **25 November: E qualified and closed for
this bounded, non-production scope.** One authorized Yahoo campaign returned
12 valid observations with 52 HTTP attempts; two rounds each measured 15 versus
11 requests. Five same-time pairs match; one advancing-source-time pair remains
explicitly inconclusive. No unexplained equal-time conflict/time regression.
The complete campaign took 18m25s, within its 20-minute budget, but rounds were
about 18m17s apart rather than exactly 15; cadence benefits remain estimates.
No shared-session adapter or 15-minute cadence is activated in production.
Owner decision: Linux qualification moves to global V2.0 integration via GitHub
Actions, without production writes; it is not a V2.0-E closure gate. Local Docker
qualification is abandoned: no image download, installation or further configuration.
The owner subsequently authorized the documented
campaign during a market session, within 12 get_info/80 HTTP attempts, without
automatic retry or remote D1 writes; no further campaign confirmation is needed
within those bounds. Commits/push are authorized only after conclusive results.
Main merge, production changes, deployment and 15-minute activation remain excluded.
See [qualification results and closure limits](./retex.md). Commit/push authorization
is exercised for this bounded closure; a wider runtime/rollout GO is not implied.

## Phases

| # | Phase | File | Depends on |
| --- | --- | --- | --- |
| 1 | Preserve E evidence and articulate D contracts | [phase-1.md](./phase-1.md) | none |
| 2 | Bounded session qualification, offline then authorized live | [phase-2.md](./phase-2.md) | 1 |
| 3 | Optional 15-minute cadence and operational acceptance | [phase-3.md](./phase-3.md) | 1 |

## External sources

| URL | What it settled |
| --- | --- |
| https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency | Consulted 24 November: default concurrency permits one running and one pending execution; another pending execution can replace the previous pending one. Existing cancel-in-progress=false is not an unlimited FIFO. |
| https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html | Search located the official exchange-delay reference; page retrieval returned HTTP 429. Exact current Paris delay was not independently verified. No retry or per-instrument 900-second delay assignment. |
| https://curl.se/libcurl/c/CURLOPT_PREREQFUNCTION.html | Native callback runs before a request on a new/reused connection and may abort it; used to charge native reissues before sending. |
| https://curl.se/libcurl/c/CURLOPT_DEBUGFUNCTION.html | Debug output alone is not an abortable request-budget guard and can expose sensitive contents; not used for header capture. |

## Impact

| Category | Verdict and evidence | Handled in |
| --- | --- | --- |
| runtime | Yahoo remains active; EODHD observation only. No provider or remote D1 requests. Native HTTP loopback and synthetic local D1 used; actual market freshness and live shared-session behavior remain unverified. | 2, 3 |
| regression | E1 19 and E2 14 passing checks reused unchanged. Shared runner/normalizer/replay bytes must remain compatible; no financial contract changes. | 1, 2 |
| architecture | Retain single scheduler → Actions → provider → ingestion chain. Reuse D ports, no second router/quota store; shared market observations remain independent of portfolio count. | 1, 3 |
| documentation | Preserve historical E1/E2 evidence; add this current qualification record and update architecture/testing memory and roadmap. | 1, 2, 3 |

Initial read-only findings on 24 November, before the local candidate changes:

- `wrangler.scheduler.jsonc`, `src/scheduling/github-dispatch.ts`, Python cadence
  modules and workflow defaults use **30 minutes**, supporting only 30/60/120.
  The GitHub repository variable also reads `30`; `collector-live` has no variable
  of that name. Deployed Worker configuration was not independently inspected.
- Eight latest main collector workflows were created at approximately :17/:47,
  spanning 14:47–18:17 UTC. Created-to-updated elapsed times were 35–54 seconds,
  all workflow conclusions successful. This is neither provider latency nor proof
  of a successful live step, catalogue coverage or advancing market timestamps.
- Backend `quotationFreshness()` warns above 45 minutes and marks stale above
  60 minutes using **successful-fetch age** with trusted calendar context; market
  age and declared delay are separate returned metadata. Unknown calendars remain
  unknown. A successful fetch of an old trade does not make the trade recent.
- Monitoring uses max(90, 2 × cadence) minutes, plus startup grace and an explicit
  final-slot check at 20:09 Paris. The current workflow timeout is 20 minutes and
  accepted dispatch age is at most ten minutes. Faster cadence needs queue and
  closing-slot qualification, even if these eight workflows were short.
- D differs by 27 files / three finalized commits; E additionally owns its two
  experiment modules and tests. No synchronization, merge or copying occurred.
  D's 19/20 coverage, TNO exclusion, 17/20 daily units and untouched 500 bonus
  credits are historical qualification evidence, not a new runtime entitlement.

Local checkpoint: 35 selected Python cases and 59 TypeScript cases passed, plus
typecheck. The cadence/scheduler/closing components changed, justifying their
targeted regression checks; E1's 19 and E2's 14 were not rerun. Initial new tests
incorrectly expected seven 120-minute summer slots (the preserved UTC alignment
has six); corrected that fixture assumption. A Node fs test import was rejected
by the existing TS configuration; configuration consistency is instead checked
in Python without new dependencies. Scoped plan review corrected phase dependency,
Wrangler cron projection and test discovery location. No full suite executed.

Subsequent owner-authorized local checkpoint: six D source modules, their seven
test files and seven evidence documents restored exactly from D's finalized
`763d9f9` into E's worktree; no branch/history merge or commit. Six source blob
hashes match D exactly. Acquired D tests were not rerun. New E seams reuse D's
mapping validation and monotonic selector. The harness uses the existing private
runner journal primitives; no second EODHD quota implementation.

New local validation: 23 harness cases qualified on Mac (synthetic spawned
workers, request reissue injection and four actual native HTTP loopback cases),
one new native-local D1 storage test passed, and typecheck passed. No provider
requests, production writes, dependency changes or E1/E2 reruns. The first native
test attempt was blocked by sandbox loopback permissions; authorized loopback
execution then exposed a test-only Curl context-manager assumption, corrected
with explicit close. D1 rejected PRAGMA page_count; measurement now uses the
supported query metadata size_after. These checks do not qualify Linux or
real Yahoo/TLS/consent behavior.

## Rules

Latest execution checkpoint: at 20:19 Paris on 24 November, the permitted session
window was closed. No capture launched; persistent receipt absent, zero new Yahoo
get_info/HTTP attempts and zero EODHD calls. Authorization is retained for the next
eligible session. Docker Desktop was started to inspect existing Linux images;
available Python images use 3.11 on Linux aarch64, unlike Actions Python 3.14 on
Ubuntu. No image pull, dependency installation, Linux test or external data request
occurred. This environment does not qualify the Linux gate. See [RETEX](./retex.md).

This Linux observation is historical evidence only. The later owner decision
defers representative Linux/Python 3.14 process recovery, hard-budget and cleanup
checks to global integration on GitHub Actions. Do not launch another local Docker
qualification. E may close after its remaining Yahoo criteria pass, carrying this
explicit integration obligation; no Linux success is claimed by the deferral.

| Rule | Why it applies |
| --- | --- |
| AGENTS.md, INSTALL.md and memory/vcs.md | Real PEA protected; API-first/hexagonal boundaries, no private financial data in docs, no staging/commit/push without authorization. |
| E1/E2 existing plans | Preserve 19+14 acquired tests; new targeted cases only for new behavior or changed components. |
| Owner's D/E boundaries | Yahoo primary; EODHD observation only; no paid plan, new infrastructure or automatic fallback. Do not touch pea-tracker-main. |

## Decisions

| Decision | Why |
| --- | --- |
| Separate cadence, publication delay, source age and collection age | Polling every 15 minutes cannot remove a delayed feed's publication delay; last-trade and bar-close remain distinct. |
| Keep 30-minute default until measured acceptance and explicit activation | 15 minutes would double the current configured workload, not reduce a five-minute workload. |
| Reuse one quotation stream for unique instruments across portfolios | Additional portfolio readers must not multiply provider calls or stored observations. Trading Lab may later request a different explicit freshness policy. |
| D interfaces remain authoritative | Do not duplicate provider selection, normalization or quota accounting in an E experiment. The local qualification ledger is not cross-run durable cloud authority. |
