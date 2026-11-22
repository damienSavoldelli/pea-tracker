---
status: implemented
---

# V2.0-E1 — Offline Yahoo cycle-session comparison

## Scope and authority

Owner-approved isolated synthetic PoC on `feat/v2.0e-collector-optimization`, clean
base `78a0dac`. No live yfinance execution, transport, quota, active code change,
intercycle quote cache, dependency, commit, deployment or financial modification.
Reuse the [earlier measured Yahoo evidence](../2026_11_21_provider-abstraction/plan.md)
without repeating it. No bar replaces a last-trade quote.

## Implementation phase — done

`collector/experiments/yahoo_cycle.py` is outside the installed `pea_collector`
package and has no CLI/live mode or network imports. Two synthetic providers differ
only in cycle-local session lifetime: fresh session/attempt versus shared session
until a simulated session failure. Both use the real `collect()` retry policy and
the unchanged `normalize()` validation. Missing/invalid/rate-limited symbols cannot
erase or recollect earlier successes. Simulated timeouts invalidate the session;
the next attempt gets a new one, while observations remain in runner-owned state.

Counters are explicitly separated: logical calls = requested instruments; attempts
= provider fetch invocations including retries; simulated HTTP requests = transport
trace events. The toy transport charges **one setup event/session and one quote
event/attempt**. These are modelling assumptions, NOT yfinance endpoint counts,
network measurements, quota savings or a reproduction of the earlier 15/11 PoC.
Deterministic per-symbol clock sequences allow full observation comparison without
inventing or changing either clock. New comparisons have independent sessions/scripts.

## Validation

Executed locally on 21 November 2026:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_yahoo_cycle_experiment.py -o addopts='' -q
collector/.venv/bin/python -m py_compile collector/experiments/__init__.py collector/experiments/yahoo_cycle.py collector/tests/test_yahoo_cycle_experiment.py
git diff --check
```

**19 targeted tests passed in 0.03 seconds**, syntax check passed. No network,
installed-library execution or full suite. Initial tests exhausted a fixture clock
on invalid responses: the unchanged runner reads the clock for validation and then
again for the failure declaration. The synthetic clock budget was corrected;
production timing/behavior was not altered. The final targeted run includes the
additional exact-subunit and future-timestamp cases.

| Instruments | Logical calls, each mode | Attempts, each successful mode | Individual simulated HTTP events | Shared simulated HTTP events |
| --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 2 | 2 |
| 3 | 3 | 3 | 6 | 4 |
| 20 | 20 | 20 | 40 | 21 |

These totals merely count the toy model's assumed requests; **they are not Yahoo
measurements or savings estimates**. Full normalized dictionaries match under the
same supplied source responses and observation clocks, including exact decimal
strings, GBX/GBP hundredth-unit labels, UUID/type, provenance and original market
time. This proves preservation of supplied fields, not real market freshness or
source accuracy. Success/failure journals, keys and delivery/replay bytes match
between both policies. Replay makes no provider calls and reads no new clock.

Tests exercise timeout/session-failure/missing-response retries limited to the failed
symbol; rate limits and invalid metadata/prices produce no immediate retry. Earlier
and following successes remain independent. Missing last-trade fields cannot be
filled from a bar Close or collection time. A new comparison cycle gets new state
and observes changed raw prices/times rather than cached data. This does not imply
upstream rate limits are actually symbol-local.

Files added: `collector/experiments/__init__.py`, `collector/experiments/yahoo_cycle.py`,
`collector/tests/test_yahoo_cycle_experiment.py`, this record. Architecture/testing
memory updated. Import inspection confirms the experiment is used only by its
test. Active collector/Yahoo, Workers/D1/MCP/Actions and dependencies are untouched.
Whitespace/local documentation links checked. No staging, commit or deployment.

## Limits and E2 gate

This validates orchestration under **simulated exceptions**, not actual yfinance
session/cookie behavior, global upstream rate limiting, real HTTP reduction, timings
or freshness in session. A blocking native library call is not a raised TimeoutError
and is **not isolated by this model**. The PoC does not replace the real adapter's
terminable per-attempt subprocess or its deadline. Do not use `Tickers` bulk failure
semantics as proof of per-symbol isolation.

Conditional next E2: bounded offline PoC with the installed library behind a fully
mocked transport and an actual hanging-worker scenario. Establish per-symbol hard
deadlines, session reset after termination, preservation of earlier successes and
cycle cleanup before any authorized live comparison. If that isolation fails,
stop shared-session work. No live activation is implied by local model success.
