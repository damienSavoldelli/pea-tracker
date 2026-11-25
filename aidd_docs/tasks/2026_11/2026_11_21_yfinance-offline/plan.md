---
status: implemented
---

# V2.0-E2 — Installed-yfinance offline qualification

## Scope

Owner authorizes isolated local E2, including strict exactness/freshness gates.
Preserve uncommitted E1 and operational code. No real network, quota, provider,
dependency, deployment, financial contract, commit or production change.

## Implementation phase — done

Use real installed yfinance 1.8.0 / curl_cffi 0.17.0 under spawned workers, with
mandatory simulated Session.request and blocked socket/DNS, plain requests and
native Curl/AsyncCurl execution exits. Unexpected network paths fail the experiment,
not merely an instrument. Only SYNTHETIC-prefixed symbols are allowed; there is no
live mode. Private per-worker caches are removed after worker reaping.

`YfData` is a process-wide singleton for sessions/cookies/crumbs. `Ticker.get_info`
fetches quote-summary, quote response and complementary fundamentals; individual
Ticker objects also cache info. Create a fresh Ticker per symbol/attempt, sharing
only a real HTTP Session inside the worker. Quote requests use get(), while the
complementary fundamentals URL uses cache_get(). Library network retries default
to zero; request timeouts do not bound the whole get_info operation.

Minimal isolation candidate: a parent-held cycle provider sends one symbol to a
persistent worker, waits against a monotonic total per-attempt deadline including
spawn/import, and terminates then kills/reaps the worker if necessary. Earlier
observations and fixture progression stay in the parent/unchanged runner. A new
worker/session/cache handles following work. This is experiment code only.

## Validation

Executed locally on 21 November 2026:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_yfinance_offline_experiment.py -o addopts='' -q -s
collector/.venv/bin/python -m py_compile collector/experiments/yfinance_offline.py collector/tests/test_yfinance_offline_experiment.py
git diff --check
```

**14 targeted tests passed in 8.69 seconds**, including the POSIX interruption case;
syntax check passed. Only real-library/mock-transport execution, no actual network
or quota. E1's 19 model tests are reused and were not rerun. Early tests exposed an
experiment-only IPC error-code unpacking mistake; it was corrected, the mock's HTTP
error `ok` flag was aligned with curl_cffi responses, and all E2 cases reran.
No operational code or dependency was changed.

Verified observations:

- Three synthetic symbols yield identical complete normalized dictionaries in
  individual/shared modes, with the unchanged price/unit/provenance/clock contract.
  The actual installed get_info path generates **15 versus 11 mocked request
  invocations**, including cookie/crumb and complementary endpoints. Shared mode
  uses one real Session and one crumb fetch versus three isolated workers/sessions.
  These counts are not network measurements, quotas or an in-session savings claim.
- Repeating one symbol with a fresh Ticker inside the same Session sends another
  quote request. An old source timestamp stays old while collection time advances;
  a subsequently changed price/time is received rather than replaced by cached info.
  No market-freshness assertion is inferred from successful collection.
- Missing responses, timeouts, HTTP errors and rate limits preserve preceding and
  following valid observations. The runner does not recollect earlier successes;
  explicit rate-limit errors receive no immediate application retry. yfinance may
  itself switch cookie strategy and repeat a request, despite network.retries=0.
  Shared worker state is discarded after an exception; no upstream rate-limit reset
  or permission to bypass limits is implied.
- Absent price/time, inconsistent currency and invalid future timestamps produce
  unavailable observations. Previous close, daily close, adjusted-close or OHLCV
  fields cannot supply a missing regularMarketPrice. No chart endpoint is permitted.
- A controlled **native POSIX signal.pause** inside the mock transport ignores
  SIGTERM. The warm-worker test uses a 0.75-second total attempt budget; terminate
  grace is 0.2 seconds then kill/join grace is 0.2 seconds. The actual child exits
  with SIGKILL, is reaped in under 2 seconds, and a fresh worker processes the next
  symbol while the earlier parent-validated observation remains unchanged. Every
  experiment cache is removed. This tests a native wait, **not a curl deadlock,
  TLS failure or uninterruptible kernel I/O**; universal hard real-time guarantees
  are not established.
- Intentional socket/native-Curl probes are rejected before I/O and fail the
  experiment. Normal runs record zero blocked-network attempts. Journal bytes,
  receipt keys and replay payloads remain identical between session policies;
  replay performs no new provider attempt.

Compared with E1, field-preservation/error behavior matches its assumptions, but
request counts differ from its toy one-setup/one-quote model. E2 exercises only
three symbols under this installed library, not 20 real instruments or market feeds.
Parent/worker timing and global Yahoo cookie/rate policies remain live-test gates.

Added `collector/experiments/yfinance_offline.py`,
`collector/tests/test_yfinance_offline_experiment.py` and this record; architecture/
testing memory updated while preserving E1 edits. No active import/CLI path changed.
Documentation links/whitespace checked. No staging, commit or deployment.

## Intraday and next-step gates

Use only regularMarketPrice/regularMarketTime and the existing normalizer. Never
substitute previousClose, a daily close or OHLCV; preserve stale source time rather
than relabel it as fresh collection. No local simulated success proves actual
last-trade accuracy, unadjusted-price semantics, venue or real intraday freshness.

A future separately authorized in-session comparison must use the same small
public symbol set and nearby timestamps, alternate execution order, retain exact
prices/units/provenance, compare market and collection times plus declared delay,
market age/session coverage, errors, latency and actual HTTP/redirect/retry counts.
Reconcile differing timestamps before attributing a price divergence to a method.
Set a request budget first. Any unexplained deterioration of accuracy, freshness
or provenance is NO-GO for operational integration. No network test is authorized
by this local delivery.

Decision: **conditional GO for continued isolated qualification**. Retain parent-owned
observations and a terminable worker/session per cycle segment; reset on timeout,
then let the existing runner retry only the failed symbol under its normal policy.
No shared worker is approved for operational integration yet. Explicitly qualify
the hard-deadline/recovery envelope under supported environments and compare quality
in session before considering activation. Any unexplained accuracy/freshness/
provenance regression remains a strict NO-GO.
