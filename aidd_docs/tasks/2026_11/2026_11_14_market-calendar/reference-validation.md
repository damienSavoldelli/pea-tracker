# Market calendar — source admission and local evidence

## Admitted scope and provenance — 2026-11-14

The independently authored standard-library generator admits one explicitly assigned
profile: `xpar-continuous-core-v1`, only for XPAR instruments independently verified
to use continuous trading. A MIC or instrument type alone never establishes that
assignment. ALXP is not an admitted profile and retains its distinct recorded MIC.

Rule corroboration: the [XPAR calendar source of exchange_calendars](https://github.com/gerrymanoim/exchange_calendars/blob/master/exchange_calendars/exchange_calendar_xpar.py)
is distributed under [Apache-2.0](https://github.com/gerrymanoim/exchange_calendars/blob/master/LICENSE),
with `Copyright 2018 Quantopian, Inc.`. Its public rule definitions corroborate the
regular continuous core and recurring closures. No upstream source code, package or
licence file is copied into this implementation; the local date expansion and
Gregorian Easter calculation are independently authored, using only Python's
standard library. This is not an installation or vendoring of exchange_calendars.

Official cross-check only: the [Euronext hours/holiday page](https://www.euronext.com/en/trading/trading-hours-holidays)
was consulted for its Paris columns for 2025, 2026 and 2027. The generated recurring
closures agree with those reviewed editions; the page identifies 24/31 December as
half-days when weekdays. No official table, spreadsheet, PDF, text or image is
copied, packaged or redistributed. The publisher's access conditions are not treated
as an open redistribution licence. The checked years and references are recorded
in `src/adapters/calendar/profiles.json`; extending them requires a fresh bounded
control, not automatic extrapolation from the recurrence.

The admitted intraday interval is the continuous core **[09:00, 17:30)** in
`Europe/Paris` on regular trading dates. Outside that core the current profile
returns unknown; it does not claim the market is closed during auctions or other
phases. Entire half-days return unknown intraday because their detailed phases and
exact bounds are not admitted. Full closures/weekends can expose their established
previous session date. No fixing, opening grace, final official close or realtime
suspension status is inferred.

## Bounded reference semantics

- Checked-in generation: local years 2026 and 2027, 730 explicit daily records.
  UTC coverage is local midnight 1 January 2026 through exclusive local midnight
  1 January 2028, with the established 31 December 2025 session as initial predecessor.
- `regular`: core UTC open/close bounds established; other times within that date
  remain unknown. `closed`: no session on that date. `unknown_session`: existence and
  date of a half-day established, intraday bounds not admitted. `unknown`: date not
  established at all, including unreviewed years; no holiday/weekend inference.
- A half-day is unknown during its local date. Once that date has ended, its known
  session date may be the next day's predecessor; no exact closing time is implied.
  A wholly unknown date instead invalidates the predecessor chain, preventing a
  resolver from skipping uncertainty to an older apparently usable session.
- Regeneration uses the profile's current local year plus the next year, or an
  explicit `--year` for reproducible review. Beyond reviewed years, emitted dates
  remain unknown. Renewal is local and reviewed; neither a workflow nor runtime
  HTTP fetch regenerates or extends coverage.

## Generator verification

Local checks on 2026-11-14:

- `collector/.venv/bin/python -m pytest collector/tests/test_market_calendar_generation.py -q`:
  17 tests passed. These cover established closures, excluded half-day hours,
  predecessor seeding and invalidation, 23/25-hour DST dates, complete daily bounds,
  reproducibility, real CLI drift detection and the unreviewed 2028 rollover.
- `python3 scripts/generate-market-calendar.py --year 2026 --check`:
  `calendar_reference_current`; the checked-in artifact matches local regeneration.

These are local generator checks. No hosted validation, provider availability or
operational calendar integration is implied by generation.

## Reader integration and optional configuration

Local implementation authorized by the user on 2026-11-14; review remains pending.
The resolver validates the generated artifact once per reader instance, then uses
UTC interval lookup. `QuotationService` passes the instrument it already reads to
its optional internal callback; there is no extra repository request or runtime
calendar/provider fetch. REST and MCP retain the same shared services and DTOs.

Only `MARKET_CALENDAR_ASSIGNMENTS` is separated from the existing strict reader
configuration parser. Its value is a JSON string of explicit assignments, for
example **synthetic only**:

```json
[{"instrument_id":"00000000-0000-4000-8000-000000000001","mic":"XPAR","profile_id":"xpar-continuous-core-v1"}]
```

Absent, malformed, duplicate or incoherent assignments fall back to `unknown`.
Recorded MIC, assignment MIC and profile MIC must agree. No actual assignment is
stored in source or documentation; continuous trading must be established for an
instrument before assigning it. Unrelated unknown configuration keys and invalid
authentication configuration retain their existing strict rejection. No remote
configuration has been changed: existing readers remain unactivated for this
calendar, and missing configuration preserves their current unknown context.

## Integrated local verification — 2026-11-14

- `node node_modules/vitest/vitest.mjs run tests/market-calendar.test.ts tests/quotations.domain.test.ts tests/access-read.worker.test.ts tests/valuation.contract.test.ts tests/valuation.http.test.ts tests/quotations.contract.test.ts`:
  **127 tests passed, 6 files**. These cover closures, half-days, DST, exact core
  boundaries, out-of-range/invalid references, real Python-to-TypeScript rollover,
  unchanged prices and old market transactions despite successful recent fetches,
  V1 freshness priorities/thresholds, REST/OpenAPI/MCP consistency, authorization,
  and unchanged exact valuation amounts on memory and local D1 repositories.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `WRANGLER_SEND_METRICS=false node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config tests/fixtures/wrangler.access-read-local.jsonc --outdir .wrangler/calendar-read-build`:
  local reader bundle passed, **no upload/deployment**. The first sandboxed attempt
  could not write Wrangler's external log; the approved rerun completed cleanly.
- A rollover test initially caught an invalid predecessor retained on the first
  unreviewed 2028 date. Resetting it before emitting that date fixed the defect;
  the final Python and TypeScript checks include that regression.

No application-wide test battery was run. The V1 freshness engine, financial
calculations, public contracts, D1 schema, schedules, monitoring and dependency
manifests are unchanged. No hosted validation, authenticated remote call or
financial data modification was performed. The scheduled 16 November V1 cycle
remains to be confirmed separately.

## Remaining limits and documentation follow-up

- Operational locally for explicitly assigned XPAR continuous-core instruments
  during regular sessions, and on established full closures/weekends with a known
  predecessor. Coverage is 2026–2027; the predecessor seed is 2025-12-31.
- ALXP and unassigned XPAR instruments remain unknown. Regular-session auctions,
  pre/post-trading and intraday half-day phases are unknown. A half-day may supply
  its established date as predecessor only once that local date has ended.
- The reference does not detect exceptional unannounced closures or suspensions,
  or guarantee real-time quotes. A verified annual renewal is needed before
  extending admission to 2028; merely regenerating dates does not establish them.
- After review, a targeted AIDD memory/documentation update can record the local
  adapter, generation command and optional configuration. Any later activation
  needs its own authorization and evidence; historical V1 contracts stay intact.

## Local finalization — 2026-11-14

The user authorized targeted review, memory synchronization and one local commit.
The [static review](review.md) approved the unchanged implementation using the
existing passing evidence above; no application tests or runtime were rerun.
Five existing memories were synchronized, with scope recorded in the
[memory report](../2026_11_14_memory-check/report.md). Earlier pending-review and
no-commit statements describe the preceding implementation milestone; the current
authorization is limited to this local finalization. No remote activation,
configuration change, deployment, push or release is included.
