# V2.0-E qualification RETEX — closure, 25 November 2026

## Final bounded decision

**E closed: isolated optimization qualified on a live sample; configurable cadence
tested locally, not deployed or activated.** Yahoo remains primary, EODHD strictly
observation-only. This is not a production shared-session rollout or a catalogue-
wide reliability claim. Linux is explicitly deferred by the owner to global V2.0
integration through secret-free, non-ingesting GitHub Actions checks.

## Authorized live campaign — 25 November

The owner ran the prepared command once during the session. The existing private
receipt's hash-checked journal contains 12 outcomes and the conservative persistent
budget counters. No new capture, retry, supplier request or financial write was
made during analysis. Prices/raw observations remain ignored/private.

| Criterion | Measured result |
| --- | --- |
| get_info calls / maximum | 12 / 12 |
| HTTP attempts / maximum | 52 / 80 |
| Individual policy | 30 attempts; 15 per three-symbol round |
| Shared-session policy | 22 attempts; 11 per three-symbol round |
| Observed HTTP reduction | 8 attempts, 26.7% |
| Category accounting | Both: 6 summary + 6 quote + 6 fundamentals; individual: 6 cookie + 6 crumb; shared: 2 cookie + 2 crumb |
| Valid observations / EUR metadata | 12 / 12 |
| Comparable same-market-time pairs | 5 / 6, equal normalized prices/units/identity |
| Remaining pair | Source time advanced 16s between reads 3.016s apart; not comparable at one timestamp |
| Market timestamp regressions / same-time conflicts | 0 / 0 |
| Observed source age at parent reception | 903.551–1,036.299 seconds; median 916.914 seconds |
| Whole campaign wall time | 1,104.811 seconds (18m25s), below 20 minutes |
| Actual round spacing | Approximately 1,096.8 seconds (18m17s), rather than planned 15m |
| Application retries / ingestion writes | 0 / 0 |
| EODHD calls / remote D1 writes | 0 / 0 |

The round-spacing deviation is disclosed; its cause is not established. It does
not erase the source/request measurements, but prevents calling this an exact
15-minute cadence experiment. Per-symbol comparisons stayed within the 60-second
pairing limit. All three source timestamps advanced between the two rounds.
The different-time pair is inconclusive, not proof of a session-induced difference;
no unexplained equal-time difference or source-time regression was observed.

Measured get_info durations (six per policy) are descriptive: individual median
1.011s, range 0.887–3.013s; shared median 0.231s, range 0.212–4.167s. The shared
cold start was slower in one round. No latency SLA, p95 or production-wide saving
is inferred. The independently repeated request-count reduction is the stronger
finding. These observations supplement the earlier offline 19/14 evidence, not
additional reruns of it.

## Freshness and cadence decision

Source ages around 15–17 minutes are compatible with delayed dissemination, not
proof of a guaranteed 15-minute delay or refresh period. The returned declared
delay stays null; market time, body-received-or-failed time and parent reception
remain distinct. No collection clock was substituted for source time, no close/
adjusted/bar price substituted for last-trade fields. Old quiet-market trades must
still retain their original timestamps.

Maintain **30 minutes by default**. At 15 minutes, additional polling lag could
decrease, while current window cycles/observation volume double. Neither interval
removes the source's publication delay. The exact gain in useful market coverage
was not measured by two rounds approximately 18 minutes apart. Trading Lab may
later choose an explicit stronger freshness policy while sharing quotations.
Session reuse reduces HTTP setup, not D1 rows per collection. Synthetic native
D1 measured growth remains 1,576,960 bytes at 26 cycles versus 3,158,016 at 52,
with receipts/indexes included. Monthly/annual extrapolations are sizing inputs,
not measured production capacity or billed-write counts. Preserve immutability.

## Residual obligations at global V2.0 integration

- Linux/Python 3.14 with collector/uv.lock: process termination/cleanup, hard budget,
  partial failures and D seams through GitHub Actions, without production writes.
- Review/qualify the eventual active shared-session composition; the current
  operational provider remains unchanged. No synthetic success proves all live
  curl/TLS/OS failure modes or parent power-loss recovery.
- Confirm Actions queue age, skipped/replaced pending slots, real duration and
  billing allowances before any faster schedule. Keep final-hour completeness and
  backend 45/60-minute successful-fetch thresholds distinct from source age.
- Check actual storage headroom/retention policy and billed D1 amplification;
  doubling cadence must not silently exhaust the zero-cost infrastructure target.
- Yahoo's contractual request allowance/service continuity remains unestablished;
  this 52-attempt sample is not a quota entitlement. Retain bounded retries and
  rate-limit stop behavior. No EODHD admission/bonus-credit change is implied.

No further supplier request is needed to close this bounded E deliverable. Commits
and branch push are owner-authorized after these results; no main merge, release,
deployment or production cadence activation is authorized.
Finalization checks: 20 reused D file blobs match `763d9f9`; targeted review of
46 source/document candidates found no sensitive markers or private filesystem
paths; 189 local documentation links resolve. The raw capture remains ignored.
Official local scheduler type regeneration completed without declaration changes;
its first run's logging was sandbox-blocked and the authorized local rerun passed.
No acquired application test was repeated merely to publish these commits.

## Validated facts

- Local E1 19 and E2 14 acquired checks preserved, not rerun.
- Cadence candidate keeps default 30 and old slot keys; 15-minute option and
  final-hour completeness locally checked. Backend 45/60-minute thresholds unchanged.
- New bounded harness qualified locally, including native loopback; persistent
  global limits cover worker resets and native request reissues, no automatic resume.
- Native local D1 sizing includes indexes and immutable receipts. At unchanged
  source price/time, fresh collection timestamps still grow the database.
- D source modules reused exactly; no duplicate selection or EODHD quota service.

## Historical preflight — 24 November

Owner authorized one external campaign, at most 12 get_info and 80 cumulative HTTP
attempts, during a session. Preflight wall clock was 24 November 20:19 Paris,
outside both the venue session and the harness start window. No campaign executed;
receipt absent, zero new Yahoo/EODHD calls, no remote D1 writes.

Docker was considered solely to obtain a local Linux test environment from macOS.
The installed daemon was stopped; Docker Desktop was started and existing images
inspected in network-disabled, read-only disposable containers without project
mounts. Available Python images report 3.11.15 on Linux aarch64; the collector and
Actions use Python 3.14. No image/dependency download or Linux qualification test
was performed. A mismatched image is not evidence for the target runtime.

Subsequent owner decision: abandon local Docker qualification and stop the Desktop
started for that purpose. No further Docker download, installation or configuration.
Linux qualification is explicitly deferred to global V2.0 integration, directly
on GitHub Actions, without production writes. This is an accepted E scope deferral,
not a passed runtime check and not a blocker to E closure.
Docker Desktop stop command completed successfully; no further Docker work is
planned for E. Documentation-only follow-up checked 114 local links with no
missing target and passed git diff --check. No acquired test rerun.

## Lessons and next gates

- Authorization does not establish an eligible market window; check both before I/O.
- Source timestamp, publication delay, collection timestamp and workflow success
  remain distinct. At that preflight, live request gains and market freshness were
  unmeasured; the 25 November results above now provide bounded sample evidence.
- At global V2.0 integration, qualify Linux/Python 3.14 with collector/uv.lock:
  process cleanup/interruption, native request budget, partial failures and D seams.
  Use a secret-free, non-ingesting GitHub Actions job; no Yahoo/EODHD call is needed
  for these synthetic runtime checks. No workflow dispatch or dependency installation
  was executed as part of this documentary deferral.
- Do not call local storage bytes remote billed writes or promise indefinite free
  retention. Fifteen minutes approximately doubles current collection/storage load.
- The one authorized campaign is now completed. Do not rerun it, reset its budget
  or delete the private receipt. Any further capture needs its own explicit scope.
- E was not closed at the evening preflight. The qualified 25 November sample
  closes the remaining E gate under the bounded decision above, while preserving
  the explicit Linux/global-integration and production-activation obligations.
