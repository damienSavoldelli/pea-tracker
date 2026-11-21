---
type: spike
status: resolved
---

# Spike: Adaptive collection and multiple quotation providers

## Question

Can V2.0-D add adaptive collection and N-provider routing/fallback without changing
the real PEA's financial conventions or introducing new infrastructure?

## Decision

**Conditional GO for incremental local development; no provider activation or
yfinance replacement approved.** The architecture can reuse existing components.
Feed equivalence, exact catalogue coverage and subscription rights remain gates,
not demonstrated operational capabilities. This spike resolves the architecture
direction, not those external qualifications.

## Bounds

Evidence date: **21 November 2026**. Targeted source inspection and official public
documentation only. No quotation API calls, account creation, purchases, production
database access, deployment or D implementation. Connected catalogue reads twice
returned the same authentication/retry response without returning a catalogue;
the cause is undiagnosed. No authentication settings were changed.

V2.0-C was reviewed and committed locally as
`52647949459b1d7e9744bfe09306aedcfe7eefd5`; its existing
[55-test evidence](../../tasks/2026_11/2026_11_21_portfolio-writes/plan.md) was reused,
not rerun. A/B/C are inherited by `feat/v2.0d-multi-provider`.
Local `main` remains `c6e7dee84e4cd53b68f69d1c173d5326f0c7c778` (V1.1.0).
These facts do not establish production validation of A/B/C.

## Investigation

### Existing components: verified in code

| Component / evidence | Existing capability | Minimum D impact |
| --- | --- | --- |
| `src/domain/quotations.ts`, `src/ports/quotations.ts`, `src/adapters/d1/quotations.ts` | Immutable observations keyed by instrument/provider/type/adjustment; market and collection timestamps, delay, provenance; latest usable quote ordered by market time within a provider | Reuse N-provider storage; introduce explicit eligible-candidate selection across providers |
| `src/domain/instruments.ts`, `collector/pea_collector/model.py` | One catalogue `provider_symbol`; Yahoo-specific mapping/selector; mapping validation capped at 20 | Separate trusted provider-specific symbol/MIC/unit mappings; review the collection cap independently of portfolio count |
| `collector/pea_collector/provider.py`, `runner.py` | Bounded Yahoo calls, selective retry, immutable delivery journal/replay | Small provider interface and adapters; weighted quota budgets, bounded fallback and cooldown; preserve original replay payloads/keys |
| `collector/pea_collector/cloudflare_cadence.py`, `src/scheduling/github-dispatch.ts`, `wrangler.scheduler.jsonc` | Global 30/60/120-minute cadence; weekday Paris window; durable dispatch claim | Versioned due plan inside existing slots; no workflow per instrument; preserve ambiguous-dispatch protections |
| `src/adapters/calendar/market-calendar.ts`, existing calendar validation report | Bounded 2026–27 reference; qualified XPAR full closures; explicit individual profile admission; unknown remains unknown | Share admitted calendar facts with Python planning; no assumed continuous/fixing profile or inferred ALXP hours |
| `collector/pea_collector/monitor.py`, quotation freshness domain | Workflow completion and separate quote freshness signals | Expected-plan/skip reasons, provider health/budget and stale-market-data alerts; a green workflow does not prove fresh prices |
| `src/application/valuation.ts`, `portfolio-reads.ts` | Explicit provider selection; no FX or fallback; shared quotations independent of portfolios | Keep historical selection/contracts unchanged; new router initially observation-only |

### Provider comparison: documentation confirmed, feeds untested

USD prices below use monthly billing, before taxes. Coverage advertisements are
not proof that any particular listing or account entitlement works.

| Provider | Coverage / semantics | Quotas and price | Rights / qualification | Disposition |
| --- | --- | --- | --- | --- |
| yfinance / Yahoo | Current integration, Paris equity/ETF sample shapes already documented; `regularMarketPrice` + `regularMarketTime`; delay remains unknown when absent | No subscription fee for library; no contractual rate allowance or service guarantee established | Library licensing does not license market data; README directs users to Yahoo terms and personal use [Y] | Keep baseline; no new rights or completeness claim |
| EODHD | Global stock/ETF delayed snapshots advertised, 15–20-minute stock delay, Unix quote timestamp; snapshot `close` is latest delayed price, not necessarily official session close [EL] | Free 20 symbol calls/day; paid EOD All-World $19.99/month, 100,000/day, 1,000/min; historical intraday plan $29.99/month. Batch still costs per ticker [EP, EL] | Private storage permitted by terms; private AI/cloud/automation clarified in FAQs. Terms also disclaim indicative market-maker data, including ETFs/CFDs: exact venue and unadjusted-price equivalence unresolved [ET, EA, ES] | First delayed-feed PoC candidate; no PEA fallback admission yet |
| Twelve Data | Exchange-specific XPAR page says **EOD**, Grow+. Broad EU real-time marketing does not prove Paris intraday. Global equities/ETFs advertised [TX, TP] | Basic 8 credits/min and 800/day; Grow starts $29/month, 55/min; Pro starts $99/month, 610/min; paid plans no daily cap, endpoint weights apply [TP] | Internal storage/non-display use depends on tier and permitted retention; redistribution restricted. Private MCP/AI and durable D1 retention must be confirmed for the chosen tier [TT, TU] | EOD candidate; no demonstrated Paris intraday fallback |
| Alpha Vantage | Global equity endpoints; US real-time/15-minute entitlements explicitly documented. Exact Paris stocks/PEA ETF coverage unverified. Global Quote is EOD by default; a trading date is not an intraday timestamp [AD, AP] | Free 25 calls/day; paid no daily cap; paid rates not readable in the public selector inspected, so no reliable price estimate [AK, AP] | Storage, private AI use and applicable exchange rights not established here | Lower-priority EOD candidate; do not assume Paris support |
| Marketstack | International EOD marketed; exchange metadata is not price coverage. Plan table specifies **US IEX** intraday, not Paris [MP] | Free 100/month; Basic $9.99/month, 10,000 symbol lookups; $0.003996 additional lookup; Professional $49.99/month, 100,000 [MP, MF] | Free non-commercial / paid commercial labels do not settle durable retention/AI redistribution rights. Documentation redirect exposed legacy v1; current endpoint/contract still to verify | EOD candidate only; coverage/licence gate |

All are technically compatible with Python HTTPS collection in principle. None
has been integrated or tested here. Independent upstream data sources and outage
independence are unverified; a second vendor does not prove independent fallback.
No other supplier is justified before these gates are resolved.

### Representative qualification sample

Exact selection from the current catalogue is **not completed** because the
connector returned no data. Do not infer holdings from public examples or copy
private mappings into this document. Reuse public `collector/pea_collector/qualify.py`
examples `AIR.PA` (liquid equity) and `WPEA.PA` (PEA ETF) only as public test candidates.
Complete the private sample with one less-liquid listing and one independently
qualified fixing/auction or quotation-unit case from the catalogue. These must not
be labelled qualified merely from an unchanged price. Add a non-Paris listing only
if present/relevant; GBX fixtures demonstrate normalization logic, not live coverage.
The known ALXP calendar limitation remains unknown, not a new admitted profile.

### Adaptive collection and minimum architecture

1. Keep the existing Cron/DO → protected GitHub dispatch → Python → ingestion/D1
   chain. Collect once per unique instrument across portfolio needs. Do not send
   portfolio holdings in scheduler payloads or public workflow logs.
2. Define a small trusted, versioned policy: instrument/venue, desired freshness,
   provider priority list of arbitrary length, entitlements, weighted call budget
   and calendar qualification. Keep credentials outside policy and logs. Preserve
   historical Yahoo mapping and explicit REST/MCP provider contracts.
3. Plan only due instruments within existing slots. First safe saving: skip proven
   full market closures; collect EOD feeds after their actual publication time.
   Unknown calendars retain conservative cadence. Instrument type alone does not
   establish liquidity or trading hours. Decreasing a thinly traded instrument's
   frequency needs an explicit freshness policy, not inference from identical prices.
4. Bound retries/fallback by endpoint weights, remaining budget, cooldown and a
   maximum attempt count. Do not fan out to all providers. Reserve probe/retry
   capacity and define daily reset time; stop before paid overage. Persistent
   cross-run budgets/health require a design choice within the existing DO or
   trusted state store; fresh GitHub runners cannot supply that state themselves.
5. Normalize raw decimal strings where supplied, price unit, currency, MIC,
   source/market timestamp, fetched timestamp, session and declared delay. Keep
   EOD/session-close separate from last-trade data. Never invent a market timestamp
   from collection time, silently apply FX, or accept adjusted prices as unadjusted.
6. Append immutable provider observations; choose only eligible, semantically
   compatible candidates. **Never regress the selected market timestamp** when
   falling back. If no compatible current quote exists, retain the last admissible
   quote with explicit stale/unavailable status. Do not replace it with older EOD
   data. Equal-time divergent values need a deterministic preference/quarantine
   rule; comparisons require comparable timestamps/venues. Thresholds remain to
   be specified and tested, not invented here. A routing-policy change must not
   silently recompute historical valuation/performance references.
7. Start with shadow comparisons excluded from real valuation. Record policy
   version, selected observation/provider, reason and rejected alternatives before
   any separately authorized activation. Provider delay and quality are declared
   evidence, not an invented confidence score. Keep synthetic portfolios from
   silently forcing faster/paid collection for the real PEA.

Polling frequency cannot remove a 15–20-minute publication delay or turn EOD into
intraday. The current 30-minute minimum accepted cadence and queued GitHub runners
are unsuitable for a one-minute real-time promise. No such promise is required by
this slice. Market close must permit final publication/grace and probes, not an
immediate blanket stop; half-days, auctions and unsupported venues stay explicit.

### Quotas, infrastructure and cost bounds

**Synthetic sizing, not actual holdings or measured production usage:** 20 unique
instruments × 26 weekday slots × 22 weekdays = **11,440 observations/month**, or
520/day before retries. A 10% fallback adds 52 symbol lookups/day; a full second
feed doubles volume. One EOD request per instrument/session is 440/month.

- EODHD free 20/day cannot sustain intraday polling; even one 20-symbol daily pass
  leaves no recurring retry margin. Twelve Data's free numeric quota is not a
  Paris entitlement; its minute limit also requires pacing. Alpha's free 25/day
  could cover only the synthetic daily pass if listings/rights qualify.
- Marketstack counts each batched ticker. The intraday-shaped 11,440 workload
  would cost approximately **$15.74/month** on Basic including 1,440 overages,
  without establishing Paris intraday access; EOD-shaped 440 fits Basic. Its FAQ
  also documents preselected optional annual Platinum Support: checkout total and
  overage controls require explicit review [MF]. No purchase was made.
- GitHub standard hosted runners are free for public repositories; private/larger
  runner allowances and artifact storage differ [GH]. Current dispatch-only
  workflows do not rely on GitHub scheduled cron. Queuing/startup and the 10-minute
  slot acceptance window remain operational constraints. At an assumed 2–3 minutes
  per collection run, 572 monthly runs mean 1,144–1,716 runner minutes, excluding
  monitoring; duration is not measured. Do not create per-symbol workflows.
- Workers Free advertises 100,000 requests/day and 10 ms CPU/invocation; the
  existing scheduler is lightweight and keeps provider I/O in Python [CW]. No
  actual account headroom or CPU benchmark was inspected. Paid Workers starts at
  $5/month [CP]; no upgrade is authorized or shown necessary.
- D1 Free: 5 million rows read/day, 100,000 written/day, 5 GB account storage but
  **500 MB per database** [DP, DL]. Index writes count; observation count is not
  the complete write bill. `0004_quotations.sql` stores repeated JSON plus batch
  inputs/outcomes and forbids deletion. Illustrative **2–4 kB all-in per observation**
  means 22.9–45.8 MB/month and 274.6–549.1 MB over 264 collection weekdays/year;
  two full feeds double this. These byte assumptions require synthetic measurement,
  including indexes/receipts. Do not promise indefinite free retention or propose
  deletion of immutable evidence. Capacity/retention decisions precede rollout.

No new infrastructure is currently justified. Total incremental recurring cost is
not proven zero: provider subscription, exchange entitlements, taxes, overages,
optional support and eventual D1/Worker capacity must be budgeted. API keys in
query strings and provider error bodies must never appear in public Actions logs.

## Outcome

| Area | Assessment | Gate |
| --- | --- | --- |
| Adaptive collection | **Faisabilité conditionnelle** | Existing cadence/dispatch supports a targeted change; per-instrument planner, calendar admission and monitor must be implemented/tested |
| N-provider storage foundation | **Faisabilité validée** at source-contract level only | Already accepts provider-scoped observations; no new live feed validated |
| N-provider routing | **Faisabilité conditionnelle** | Mapping/policy and timestamp-safe selection contracts/tests required |
| Controlled fallback | **Faisabilité conditionnelle** | Compatible feed, rights, quota and venue/price semantics must pass a PoC; no live fallback demonstrated |
| Replacing yfinance | **À reporter ou abandonner** for this slice | No proven replacement covers the required catalogue and conventions |
| One-minute Trading Lab feeds / additional vendors | **À étudier** separately if needed | New freshness requirement and business case first |

Confidence: high for inspected code boundaries and documented plan distinctions;
limited for actual feed suitability. V1.1 operational evidence remains historical;
55 C tests support local financial compatibility, not D feasibility or deployment.

## Follow-up

**Later evidence update — 21 November 2026:** the owner subsequently supplied
supplier-test outcomes and authorized local D1 implementation. See the
[D1 evidence and implementation record](../../tasks/2026_11/2026_11_21_provider-abstraction/plan.md)
for the measured Yahoo experiment and explicitly attributed supplier reports.
These follow-up facts supplement, rather than rewrite, the original study bounds;
no secondary feed is admitted to real valuation by this update.

Original prospective delivery sequence (reassess after the separately scoped D1 above):

1. D1: policy/normalization contracts and synthetic quota, calendar, timestamp,
   divergence and monitoring tests; measure synthetic D1 bytes/row amplification.
2. D2: adaptive due-plan on current slots, starting with admitted full closures;
   conservative unknown-calendar behavior and monitor agreement. Keep Yahoo only.
3. D3: provider abstraction and trusted N-provider mappings; isolated bounded PoC
   for EODHD first, Twelve Data if EOD is useful. Use an owner-authorized existing
   credential/entitlement only; no signup or paid plan without separate approval.
4. D4: shadow routing/fallback, then separately approved activation after evidence.

PoC stop conditions: resolve exact catalogue sample; verify ISIN/MIC/currency/unit,
raw/adjusted semantics and timestamp meaning; observe a few admitted sessions
including a quiet listing, closure and stale/error cases; compare time-aligned
quotes without recording private positions. Freeze the call ceiling beforehand;
store only licensed private evidence. EODHD's public demo symbols do not establish
Paris coverage. Failure to obtain a suitable entitlement leaves the PoC blocked;
it does not justify fabricated prices or weaker valuation rules.

Before any real fallback: settle retention/private MCP licensing, supplier data
origin disclaimer, quota hard stops, durable budget state, price discrepancy
thresholds, monotonic selection and unchanged historical references. No D commit,
financial migration or contract change belongs to this study.

## Official sources

All consulted **2026-11-21**. Public documents can change; account entitlements and
sample responses were not verified. Links identify evidence, not endorsements.

- [Y: yfinance README](https://github.com/ranaroussi/yfinance)
- [EP: EODHD pricing](https://eodhd.com/pricing)
- [EL: EODHD delayed quote semantics and per-ticker accounting](https://eodhd.com/financial-apis/live-ohlcv-stocks-api)
- [ET: EODHD governing terms and data disclaimer](https://eodhd.com/financial-apis/terms-conditions)
- [EA: EODHD private AI/cloud/automation FAQ](https://eodhd.com/help/ai-tools)
- [ES: EODHD storage/retention FAQ](https://eodhd.com/help/storage)
- [TX: Twelve Data XPAR specifications](https://twelvedata.com/exchanges/XPAR)
- [TP: Twelve Data pricing](https://twelvedata.com/pricing)
- [TT: Twelve Data governing terms](https://twelvedata.com/terms)
- [TU: Twelve Data personal/commercial usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage)
- [AD: Alpha Vantage endpoint documentation](https://www.alphavantage.co/documentation/)
- [AP: Alpha Vantage premium plans](https://www.alphavantage.co/premium/)
- [AK: Alpha Vantage free quota](https://www.alphavantage.co/support/api-key/)
- [MP: Marketstack plans, exchange-info distinction and US intraday](https://marketstack.com/pricing)
- [MF: Marketstack per-symbol accounting, overages and optional support](https://marketstack.com/faq)
- [GH: GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [CW: Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [CP: Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [DP: D1 pricing and index accounting](https://developers.cloudflare.com/d1/platform/pricing/)
- [DL: D1 database limits](https://developers.cloudflare.com/d1/platform/limits/)
