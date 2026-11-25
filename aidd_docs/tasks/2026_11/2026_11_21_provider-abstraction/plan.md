---
status: implemented
---

# V2.0-D / D1 — Minimal Python quotation provider boundary

## Scope and authority

Owner-approved inline D1 plan: document supplier experiments, introduce a minimal
Python provider interface, retain Yahoo behavior and validate offline. No commit,
network call, dependency change, migration, deployment, REST/MCP/valuation change,
batch optimization, routing or fallback. Base: `5264794`, branch
`feat/v2.0d-multi-provider`. Pre-existing edits: architecture memory, roadmap and
untracked feasibility spike. Preserve those edits; roadmap is not changed by D1.

## Phase 1 — Supplier evidence (done)

This dated update supplements the original
[documentation-only study](../../../backlog/spikes/adaptive-multi-provider-feasibility.md).
It does not retroactively change that study's evidence boundary. No new supplier
requests are made for D1. Symbols are public test examples, not owner holdings.

| Supplier | Observed or reported evidence | Remaining validation |
| --- | --- | --- |
| Yahoo/yfinance | Existing primary implementation. Earlier local PoC on AIR.PA, CW8.PA and DCAM.PA: individual `get_info()` 15 HTTP responses; shared-session `Tickers.get_info(threads=False)` 11, same seven retained fields; grouped `download(period="1d", interval="1m", auto_adjust=False)` 8, but last-bar closes/timestamps differ from last-trade fields | One sample on 21 November, outside an active session; no repeatable performance guarantee, catalogue-wide claim or optimization activation |
| EODHD | Owner reports successful grouped AIR.PA/CW8.PA/DCAM.PA request and anomalies in some `previousClose`/`change` values | Intraday freshness, actual metering, licence and quote semantics; raw evidence not independently inspected in D1 |
| Marketstack | Owner reports five-session grouped OHLCV history for AIR/CW8/DCAM and differing V1/V2 coverage | Actual quotas, storage rights and version-specific coverage; history is not a last-trade substitute |
| Alpha Vantage | Owner reports individual AIR.PAR/CW8.PAR/DCAM.PAR quotes; bulk endpoint Premium-only and example response unusable | Entitlements, semantics, metering and licence; no demonstrated free bulk feed |
| Twelve Data | Owner reports XPAR catalogue entries for AIR/CW8/DCAM; AIR `quote` with `exchange=Euronext` denied, Grow/Venture required | No free Euronext quote source qualified; catalogue membership does not establish quote access |
| FMP / Finnhub | Owner reports denied free access for tested Euronext quotations | Not prioritized; no general claim about all products or subscriptions |
| Official Euronext | Owner reports an information request sent | Response on price, access, retention rights and quotas pending; no supplier contacted by this agent |

Yahoo measurements came from a temporary, isolated PoC using the existing Python
3.14/yfinance 1.8.0 environment. Transport counting included session setup and
library calls; successful live measurements had no redirects or transport errors.
The initial sandbox transport failures were excluded. Counts were 15/8/11 for
individual info/download/shared info; no 20- or 100-symbol run was performed.
`download` internally still fetches individual symbols. Its chart responses also
contained matching last-trade metadata, but the returned DataFrame did not retain
it. No raw prices, tokens, response dumps or temporary private paths are archived.
Other supplier results above are **owner-reported**, not newly measured here;
they do not establish production suitability or supersede licence gates.

## Phase 2 — Minimal boundary (done)

- Define structural `QuotationProvider.fetch(symbol: str) -> dict` next to Yahoo.
- Bind runner annotations to that interface; retain all runtime behavior.
- Add a test-only synthetic implementation, Yahoo child-path regression checks,
  partial failure and immutable delivery/replay checks. Keep the existing synthetic
  CLI and Yahoo-only live composition unchanged.
- This remains the legacy Yahoo-shaped raw contract. D1 does not claim generic
  secondary-provider normalization: `normalize()` still selects Yahoo provenance
  and `last_trade/unadjusted`. No provider-name flag may mislabel other data.

## Validation

Executed locally, 21 November 2026:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_provider_contract.py collector/tests/test_runner.py -q
git diff --check
```

**17 tests passed:** 5 new provider-boundary cases and 12 existing runner/CLI/
process/replay cases. New cases exercise the real Yahoo child adapter with a local
`yfinance` module stub (no provider network), selected fields/error sanitization,
exact normalization and mixed success/failure byte-identical replay. Existing cases
cover the real terminable-process deadline, bounded retries, CLI live gates and
partial-cycle monitoring failure. No fixture provider was added to the live CLI.

Local Markdown links and whitespace checked. Existing A/B/C evidence reused; no
TypeScript/financial code changed and their suites were not rerun. No full suite,
dependency installation, provider request, commit or remote operation. No production
validation is claimed. The Yahoo call path, seven selected fields, 15-second default
deadline, normalization, journal bytes/key format and live composition are unchanged.

Files: `collector/pea_collector/provider.py` defines the protocol and declares
Yahoo's implementation; `runner.py` annotates its injected provider; new
`collector/tests/test_provider_contract.py` contains the synthetic provider and
regression checks. No new runtime configuration or secondary adapter.

## Limits and next slice

Before Monday's supplier validation: obtain authorized entitlements and inspect
time-aligned raw semantics, market timestamp, currency/unit, unadjusted prices,
licences and actual quota accounting. Do not silently select older bars or EOD
prices for real-PEA last-trade valuation. Yahoo stays the only live provider.

Suggested D2: an offline explicit provider-mapping and normalized-observation
contract, exercised with synthetic data, retaining Yahoo as default. Resolve the
verified ingestion configuration restriction (an instrument cannot currently have
two provider grants) in a separately scoped slice before secondary ingestion.
No change to `access-collector.ts` belongs to D1.

Subsequent local D2 delivered the prepared mapping/normalization contract without
activating any supplier: [D2 scope and evidence](../2026_11_21_provider-mappings/plan.md).
