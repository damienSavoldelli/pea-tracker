---
status: implemented
---

# V2.0-D2 — Local provider mappings and normalization

## Authority and bounds

Owner's inline D2 plan authorizes local code, synthetic tests and AIDD updates.
Keep `feat/v2.0d-multi-provider` and all existing A/B/C/D1 edits. No commit, network,
live provider integration, routing/fallback, financial selection, ingestion grant,
REST/MCP change, migration or deployment. Reuse
[D1 interface and evidence](../2026_11_21_provider-abstraction/plan.md).

## Implementation phase — done

- Add a local provider mapping extending the validated legacy instrument mapping:
  canonical UUID, provider ID, provider-specific symbol/exchange/metadata, data kind
  and adjustment. Multiple providers and streams may refer to one instrument.
- Normalize explicit provider-neutral synthetic fields into the existing observation
  shape only for unadjusted last trades and session closes. Reuse exact decimal,
  clock and instrument-metadata utilities; no inferred prices, currencies or times.
- Explicit OHLCV-bar and adjusted declarations can be mapped but cannot be emitted
  through the present quotation contract. No OHLCV model, adjustment conversion or
  broader ingestion schema is introduced.
- Keep the old Yahoo mapping/parser/normalizer, D1 protocol, runner and CLI unchanged.
  The new module is an internal prepared contract, not selected by live collection.

## Validation

Executed locally on 21 November 2026:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_provider_mapping.py collector/tests/test_model.py collector/tests/test_provider_contract.py collector/tests/test_runner.py -o addopts='' -q
git diff --check
```

**91 tests passed in 2.32 seconds:** 38 new D2 cases and 53 existing model/D1/runner
cases. Synthetic only; no network, dependency installation or full suite. Local
Markdown links/whitespace checked. No TypeScript change or application test rerun.

New source: `collector/pea_collector/provider_mapping.py`; new tests:
`collector/tests/test_provider_mapping.py`. The inherited `InstrumentMapping`
fields/parser validate source symbol, currency/unit, exchange, timezone and type.
Local lists admit N providers/streams; duplicate stream or ambiguous provider-symbol
associations and inconsistent canonical metadata are rejected. There is no fixed
two-provider limit and the live parser's 20-instrument cap remains unchanged.

Neutral source dictionaries explicitly declare provider, symbol, exchange,
timezone, quote type, currency, data kind, adjustment, price, market timestamp
and provenance. Declared delay is optional and bounded; unknown remains null.
Only supported unadjusted streams become the existing observation dictionary;
price precision, units and provenance are preserved without conversion. Missing
required metadata or a timezone-less/date-only/future market time raises sanitized
`ProviderError`, rather than inventing a price or timestamp. The verified source
timezone determines session date; collection time is independently supplied.

Tests cover three providers for one UUID, distinct symbols/venue codes, independent
last-trade/session-close streams, descriptive bar/adjustment refusals, exact subunits,
null reference/unknown delay, missing fields, invalid metadata and duplicates.
The 53 existing cases retain Yahoo normalization, process deadline, partial-cycle
behavior and immutable journal replay. Existing D1 files, Yahoo mapping/normalizer,
CLI/runner, schemas, migrations and financial selection were not edited by D2.
An import search confirms only the new tests use the new module: no live wiring.

## Remaining gates

The canonical UUID is a local association, not proof of catalogue identity or
authorization. Provider exchange codes may differ; actual ISIN/MIC/venue equivalence
must be qualified before integration. Daily dates without a genuine timestamp are
not silently promoted to timestamped session-close observations. Unknown delay
stays null. The existing single-provider-per-instrument ingestion grant restriction
remains unchanged; no secondary-provider data is delivered by D2.

Directly constructing a mapping is not catalogue qualification: source adapters
still need explicit symbol/venue and price/timestamp semantics validation. D2
revalidates each supplied mapping before normalization, but neither performs
authorization nor changes ingestion grants. A rejected response raises an error;
no new secondary-provider failure-delivery path is activated.

## Proposed D3 — not implemented

Implement one isolated secondary-provider adapter against approved synthetic/raw
fixtures, consuming this neutral contract. Choose and qualify its field semantics
first, including daily-date versus genuine timestamp and adjusted/raw prices.
Keep it outside live collection/valuation and preserve Yahoo as the sole active
provider. Resolve licensing and multi-provider grants separately before any live
secondary ingestion. No routing/fallback or automatic supplier selection implied.
