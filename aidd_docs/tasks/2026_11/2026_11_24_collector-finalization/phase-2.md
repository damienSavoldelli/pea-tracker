---
status: done
---

# Instruction: Qualify session reuse with bounded execution

## Architecture projection

```txt
.
└── collector/
    ├── experiments/
    │   ├── yfinance_offline.py
    │   ├── yahoo_cycle.py
    │   └── yahoo_session_capture.py ✅
    └── tests/
        └── test_yahoo_session_capture.py ✅
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| --- | --- | --- | --- |
| Setup | Build isolated future capture harness with injected transport | Default dry-run performs zero network requests | cli |
| Happy path | Compare supplied responses in individual/shared modes | Exact normalized fields and original clocks retained | system |
| Edge case | Cap exhausted, redirect, 429 or unexpected endpoint | Stop campaign without fresh-budget retry or endpoint substitution | system |
| Edge case | Worker hangs or process interrupted | Parent keeps prior results, worker reaped, private state cleaned | system |
| Teardown | Finish or interrupt an isolated campaign | No ingestion/D1 call, cookies or processes retained | system |

## Tasks to do

### 1) Prepare an independently gated capture harness

1. Implemented locally in `collector/experiments/yahoo_session_capture.py`.
   Existing E2 retains its mandatory offline mode and synthetic-prefix guards;
   no modification or acquired-test rerun was needed.
2. Reuse the E2 lifecycle pattern in a separate experiment with a supplied transport
   and parent-owned observations; do not enable the active provider or workflow.
   The shared lifecycle must match the eventual candidate before its results can
   qualify that candidate. No monkeypatch disabling E2's network guards.
3. Implement one parent-owned campaign counter surviving worker resets: every
   attempted HTTP transfer, including cookie/crumb, consent, internal retries and
   redirect hops, consumes the same budget. Disable uncontrolled automatic
   redirect following; uncountable native requests are a NO-GO, not an estimate.
   The implemented guard charges before native Curl.perform (including connect
   failures) and uses CURLOPT_PREREQFUNCTION to charge any additional native
   request before it is sent. curl_cffi 0.17.0 needs its exported ffi/lib bridge
   for this callback; unsupported versions/options fail closed. Async Curl,
   Python alternate transports, proxies and unqualified endpoints are forbidden.
   Native callback IP arguments and header/body contents are never recorded.
4. Store only selected quotation fields and necessary timing in a private bounded
   file, never cookies, request URLs/query strings, headers or profiles. Public
   diagnostics contain fixed codes and aggregate counts only.
5. New tests target counter enforcement, dry-run, interrupt cleanup and changed
   harness seams. Do not rerun E1/E2 unchanged. Mac cleanup is locally qualified.
   Owner deferred target Linux qualification to global V2.0 integration on GitHub
   Actions, with no production writes; it does not block E closure. Local Docker
   qualification is abandoned, with no image/dependency installation or configuration.

### 2) Present this fixed live protocol for explicit approval

1. Public examples, not portfolio inputs: AIR.PA, CW8.PA, WPEA.PA. Verify public
   mapping metadata before execution, without loading holdings. No owner ID used.
2. Two rounds separated by 15 minutes in an ordinary Paris continuous session,
   avoiding opening/closing boundaries and admitted closures. Compare each symbol
   consecutively in isolated/shared policies; reverse policy order in round two.
   A fresh Ticker per attempt; shared Session limited to one round, no quote cache
   crossing rounds. Per-symbol comparison gap at most 60 seconds, otherwise mark
   inconclusive rather than attribute movement to session policy.
3. Exactly **12 planned get_info invocations**: 3 symbols × 2 policies × 2 rounds.
   **80 attempted HTTP transfers maximum for the complete campaign**, including
   library-internal retries/setup; no application retries, no automatic restart.
   This is a proposed hard cap, not a forecast of 80 requests or a Yahoo quota.
   Stop early on 429, consent/auth changes, cap, unknown origin or bad cleanup.
4. Proposed total get_info deadline 15 seconds including spawn/import, bounded
   terminate/kill/reap allowances recorded separately; maximum 20 minutes elapsed
   campaign including the 15-minute wait. Count failures within the cap; do not
   compensate by adding symbols/rounds. Existing normalization stays unchanged.
5. No supplier subscription or paid endpoint; zero new EODHD/Marketstack/Alpha
   calls, zero ingestion writes. Yahoo has no established contractual free call
   allowance here; do not label this budget a provider-approved entitlement.
6. Capture request count by category, monotonic durations, request start/end,
   exact response-body reception where measurable, normalization time, source
   timestamp, original declared delay, age and result. Existing fetched_at is
   not retroactively labelled exact reception time. Preserve missing delay as null.
7. Equal market times require equal normalized price/unit/identity; unexplained
   divergence blocks acceptance. Different times require documented temporal
   interpretation, not a false equality assertion. Old unchanged trades are valid
   observations with explicit age, not proof of freshness. Missing price/time must
   not use previousClose, adjusted data or bar Close.
8. Any unexplained quality/provenance regression, leaked data, orphan worker or
   budget breach is NO-GO. Shared mode must reduce observed setup transfers without
   harming outcomes; a tiny noisy latency difference alone cannot establish gains.
   Two rounds qualify a sample, not whole-catalogue reliability or p95 latency.

### 3) Preserve failure and replay guarantees

1. Use synthetic injection for timeout, 429, partial failure and interruption;
   never deliberately send malformed or rate-limiting live requests.
2. Distinguish child retrieval interruption (earlier observations stay in parent)
   from parent loss. Existing runner journals only after collect completes; parent
   loss before that point does not have durable per-symbol recovery. Do not claim it.
3. After a journal exists, replay original bytes/key with zero provider requests.
   Without original journal, existing rerun fails closed. Do not introduce a new
   cycle ID to hide an ambiguous previous delivery.

Implemented capture-specific recovery: one fixed private campaign journal is
claimed under the existing nonblocking flock. Both counters persist before the
child receives permission. Each completed observation is then saved; a stopped
or interrupted campaign retains counters/results and refuses automatic resume.
This capture journal does not change the active ingestion journal's semantics.
Normal partial retrieval failure resets the worker and proceeds to the next
scheduled sample without application retry. Timeout or hard guard failure stops
the campaign; terminate/kill/reap and private-cache cleanup are bounded.

Local checkpoint: 23 new cases qualified, including actual native Curl/HTTP
against loopback for 200/302/401/429, synthetic additional native prerequests,
global cap across process resets, refusal of get_info 13, partial success,
SIGTERM-ignoring worker kill, interruption, durable no-resume, dry-run and D seams.
The captured observation clock is parent reception; transport event clocks are
separately labelled body-received-or-failed. Neither is substituted for source
market time. The offline report returns ages/conflict/regression counts and
requires review even if no conflict is detected. It never declares production GO.

Prepared session: **25 November 2026, proposed start 10:00 Paris**, round two
15 minutes after round-one start. The committed XPAR venue reference marks the
date regular. That is venue-day evidence, not individual instrument intraday
profile qualification. CLI requires an exact matching local session date and
start between 09:30 and 16:00 on a weekday. No provider request has been executed.

Safe preparation from repository root:

```sh
cd collector
.venv/bin/python -m experiments.yahoo_session_capture
```

Execution command, **owner-authorized but only during the eligible session**:

```sh
.venv/bin/python -m experiments.yahoo_session_capture --execute --session-date 2026-11-25
```

Offline review after a capture:

```sh
.venv/bin/python -m experiments.yahoo_session_capture --report
```

The output directory is fixed, ignored `.wrangler/yahoo-session-qualification/`
under repository root, private 0700/0600. No credentials are required or saved.
Do not delete or move a started receipt to bypass the campaign cap. Review any
failure before deciding on another separately authorized campaign. No subscription,
paid endpoint, new EODHD request or D1 write is part of these commands.

Authorization checkpoint: owner approved actual execution within the documented
caps. At the 24 November 20:19 Paris preflight the session was closed, so execution
was not attempted; private campaign receipt does not exist and no budget has been
spent. The authorization persists; no new confirmation is required for the
documented campaign in the next eligible session. No unattended launch was created.

## Test acceptance criteria

25 November acceptance: the owner executed the already authorized command once.
Private persistent receipt integrity verified; 12 get_info, 52 HTTP attempts,
12 valid observations, no retry or ingestion write. Offline review qualifies the
bounded experiment: five pairs share identical source time and normalized value;
the sixth advanced by 16 source seconds during a 3.016-second retrieval gap and
cannot establish method equivalence at one timestamp. It is not counted as a
matching pair or a method-induced defect. Source times advanced across rounds
for all three samples; no regression/unexplained same-time conflict. Per-attempt
durations stayed below 15 seconds. Round spacing was about 18m17s, not the planned
15 minutes; whole capture took 18m25s. No reason for an additional provider call.
See [RETEX and reproducible aggregates](./retex.md).

| Task | Acceptance criteria |
| --- | --- |
| 1 | Harness has validated hard request cap and zero-I/O default before any live authorization is requested. Existing synthetic network guards stay intact. |
| 2 | Owner approves exact executable command, 12 fetches/80-transfer cap and output location before execution; sample quality/count/timing evidence recorded privately and summarized safely. |
| 3 | Injected failures preserve successes and existing replay bytes; interruption limitations explicitly documented, no real PEA writes. |
