# V2.0-D — Captured JSON and free-tier qualification

24 November 2026; branch `feat/v2.0d-multi-provider`. Supplements the
[external report](external-poc-2026-11-23.md) and [D5 parser](response-parser.md).
Only the owner's nine authorized JSON files were inspected, read-only, after a
non-disclosing secret-pattern scan. No key/credential indicators were detected;
this is a bounded inspection, not a general secret-detection guarantee. Original
files, paths, raw responses and downloaded prices remain outside the public repo.
The owner confirms all three accounts used Free plans; no dashboard was accessed.

## What the files establish

| Provider | Captured structure | Qualified result and remaining boundary |
| --- | --- | --- |
| EODHD | Three arrays, three code-keyed rows each; numeric `close`, integer Unix `timestamp`, session OHLC/volume and previous-close/change fields | All three original byte bodies passed D5 unchanged. Nine rows also passed D2 under explicit assumed EUR/listing/adjustment context and synthetic instrument IDs, held only in memory. This validates structure/decimal/time handling, not that the supplied context is independently true. |
| Marketstack | Three identical bodies: `pagination` plus `data`, three rows, explicit `exchange`, raw `close` and distinct `adj_close`, daily `date` with midnight UTC representation | Closing session is 20 November. Midnight is a daily label, not proof of an execution/closing instant. No source currency/ISIN or exact reception time is present. No live adapter is implemented. |
| Alpha Vantage | Three identical `Global Quote` objects; one symbol, decimal-string price and date-only `07. latest trading day` | Closing session is 20 November; only one equity was tested, no ETF coverage demonstrated. No genuine market-time instant, currency or ISIN supplied. No live adapter is implemented. |

The files contain response bodies, not saved HTTP status/headers or request URLs.
HTTP 200 remains owner-reported; D5's offline invocation supplied status 200 and
JSON content type explicitly. Exact endpoint/version, transport timing and current
entitlement/metering cannot be reconstructed from bodies alone.

The EODHD sequence includes a symbol whose price changes while its source timestamp
does not. D5 preserves both declarations; it must not invent a later market time or
discard that discrepancy. This may reflect timestamp granularity/revision semantics;
it does not independently establish last-trade/venue equivalence. Shadow selection
will need an explicit equal-time revision/divergence rule before real valuation.

## Collection clock, reception clock and freshness

Filename prefixes are UTC-labelled capture/collection-clock proxies. The naming
procedure is not supplied: they could mark request start, completion or file save.
They are **not exact HTTP reception timestamps**, and file modification time is not
used as a substitute. No clock-offset or transport-duration measurement is available.

For the nine EODHD rows, filename time minus the row's own source timestamp ranges
from **919 to 982 seconds (15m19s–16m22s)**. This is observed apparent age relative
to that proxy, consistent with delayed snapshots, not a precise feed-latency bound.
Rows in one body do not all carry the same timestamp. Use per-row source times;
never replace them with the batch maximum or collection time. Declared delay stays
unknown in the offline normalization; observed age is not a provider guarantee.

Marketstack/Alpha preserve the 20 November session across the three captures.
Their recent collection does not make those closes intraday data for 23 November.
No exact close age in seconds is derived from a date-only/daily-label field. A
quiet/unchanged close is not evidence of a broken API.

## Free plans: official constraints checked 24 November

| Provider | Budget and attainable frequency | Markets/data and admission decision |
| --- | --- | --- |
| EODHD | 20 calls/day, 20 requests/minute; daily reset midnight GMT. 500 welcome calls are finite and excluded from sustainable sizing. Delayed endpoint meters each symbol even in a grouped request. No separate monthly allowance established. | Free plan lists delayed snapshots and one-year EOD history; historical intraday bars are a different, excluded product. Three supplied symbols work, not all 20. One full 20-symbol pass consumes the recurring daily budget with no retry reserve. **Not viable for a regular full-catalogue intraday fallback; candidate for strictly budgeted selective use.** [E1, E2] |
| Marketstack | 100 ticker lookups/month; a grouped request costs one per ticker. No distinct daily/minute allowance established from the consulted Free pages. At most five 20-symbol sweeps/month before any reserve or other use; 20 × 22 daily closes = 440/month. | Free is EOD, one-year history, non-commercial. Exchange-directory breadth is not quote coverage; the three captures prove only their observed closes. **Not viable for daily full-catalogue closing backup; retain occasional targeted EOD checks only.** [M1, M2] |
| Alpha Vantage | 25 requests/day for standard Free; no separate monthly allowance or current minute ceiling established here. A hypothetical one-symbol-per-request daily 20-title pass leaves at most five requests before other use/retries. Unlimited verified open-source/educational access is a separate approval, not assumed. | Global Quote defaults to daily updating; US paid realtime/delayed products do not establish Paris intraday access. Only one captured equity, no tested ETFs. **Conditional EOD candidate; no intraday fallback or complete coverage claim.** [A1, A2] |

These are recurring advertised ceilings, not measurements of remaining account
quota, guaranteed throughput or permission to spend them. All workflow, metadata,
manual and retry usage shares the account budget. Do not poll a daily source every
intraday slot. Do not pool historical-close allowances into an intraday promise.

## Private use and retention

- EODHD terms permit non-professional private storage/analysis and prohibit sharing
  the data. Official FAQs explicitly cover personal cloud, AI/MCP and automated
  private pipelines, retained data and provenance. Keep downloaded datasets and
  outputs containing data out of public Git/examples; use synthetic fixtures.
  Being run on a work Mac does not by itself establish professional use; the actual
  user/purpose determines the scope. [E3, E4, E5]
- Marketstack Free is explicitly non-commercial. Its linked legal hub/general
  agreement was inspected; no specific durable market-data retention/private
  MCP/AI permission was established for this Free feed. This remains an activation
  gate, not an inferred prohibition or an automatic reason to buy a plan. [M1, M3]
- Alpha Vantage grants personal non-commercial use subject to its terms/EULA.
  The consulted terms do not settle this project's durable D1 retention and private
  cloud/MCP data handling explicitly. Keep that gate open; do not equate free API
  access with unrestricted storage or redistribution. [A3]

No supplier was contacted and no legal/account permission was fabricated. Existing
public documentation of downloaded prices is replaced by qualitative sample evidence;
the original JSON files are not copied into fixtures or public release material.

## Validation and impact

- D5 source is unchanged: reuse the **42 passing synthetic cases** from its recorded
  checkpoint, without rerunning them for an evidence-only review.
- Direct offline replay: three original EODHD bodies parsed; nine rows normalized
  in memory with explicitly assumed context. No D1 persistence, network, financial
  operation or assertion of qualified venue/adjustment semantics.
- **Three added synthetic tests passed in 0.01s** in
  `collector/tests/test_external_provider_shapes.py`: three-row full snapshot
  envelope, per-symbol times and same-time price revision preservation; Marketstack
  daily and Alpha Global Quote envelopes cannot be mistaken for EODHD snapshots.
  All values/identifiers/times in tests are invented. No new supplier adapter or
  broader runtime was introduced. Existing parser, transport and Yahoo are unchanged.

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_external_provider_shapes.py -o addopts='' -q
collector/.venv/bin/python -m py_compile collector/tests/test_external_provider_shapes.py
git diff --check
```

## Zero-additional-cost continuation

1. Keep Yahoo primary and existing V1 explicit selectors unchanged. Reuse shared
   observations once per instrument, not once per portfolio. No paid plan proposed.
2. Define a small provider policy with hard daily/monthly spend ceilings, reserve,
   reset rules and persistent cross-run accounting using existing infrastructure.
   It must stop/degrade explicitly before the free quota and never upgrade a plan
   automatically. EODHD can serve selected eligible failures only; Marketstack is
   occasional EOD; Alpha EOD stays conditional on coverage/rights.
3. Before more API calls, resolve ISIN/listing/currency/adjustment from existing
   trusted metadata and available documents. Qualify missing members of the
   20-instrument set only under an explicit call budget; these files do not supply
   the full matrix. Resolve daily-label handling before implementing close adapters.
4. Write synthetic shadow-selection tests for compatibility, stale/older close
   refusal, delayed eligibility, equal-time revisions, exhaustion and reset. Shadow
   decisions do not alter PEA values; no read-triggered provider HTTP calls.

**Decision:** the observed feed formats are usable for continued isolated work,
but Free plans do not support an always-on 20-instrument secondary intraday service.
Prefer honest partial/stale/unavailable results over a paid upgrade or older-close
substitution. Infrastructure capacity/retention gates from the earlier report remain
open; reduced free-tier volume does not itself certify Workers/D1/Actions headroom.

## Official references

- [E1: EODHD Free quotas and products](https://eodhd.com/pricing)
- [E2: Delayed endpoint, timestamps and per-symbol metering](https://eodhd.com/financial-apis/live-ohlcv-stocks-api)
- [E3: EODHD governing terms](https://eodhd.com/financial-apis/terms-conditions)
- [E4: EODHD private AI/cloud/software](https://eodhd.com/help/ai-tools)
- [E5: EODHD storage and retention](https://eodhd.com/help/storage)
- [M1: Marketstack Free plan](https://marketstack.com/pricing)
- [M2: Marketstack per-ticker accounting](https://marketstack.com/faq)
- [M3: Marketstack-linked APILayer legal hub](https://www.ideracorp.com/legal/APILayer)
- [A1: Alpha Vantage Free quota](https://www.alphavantage.co/support/api-key/)
- [A2: Global Quote updating](https://www.alphavantage.co/documentation/#latestprice)
- [A3: Alpha Vantage terms](https://www.alphavantage.co/terms_of_service/)
