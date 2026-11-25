---
status: implemented
---

# V2.0-D3 — Isolated EODHD-format fixture adapter

## Authority and scope

Owner's inline D3 plan: read-only D1/D2 commit preparation and local synthetic
adapter/tests/documentation. No staging/commit, supplier call, credential, ingestion,
REST/MCP/valuation change, migration, routing, fallback or deployment. Preserve all
existing edits on `feat/v2.0d-multi-provider`, HEAD `5264794`.

## Consolidation review — done, proposal only

The reviewed D1/D2 code matches the recorded 17/91 targeted-test evidence; their
content was not changed for this review and tests were not rerun solely for Git.
Index was empty. No unrelated source edits were found.

Recommended single commit: `feat(collector): prepare provider abstraction and normalization`.

| Scope | Candidate files/hunks |
| --- | --- |
| D1 | `collector/pea_collector/provider.py`, `collector/pea_collector/runner.py`, `collector/tests/test_provider_contract.py`, `aidd_docs/tasks/2026_11/2026_11_21_provider-abstraction/plan.md` |
| D2 | `collector/pea_collector/provider_mapping.py`, `collector/tests/test_provider_mapping.py`, `aidd_docs/tasks/2026_11/2026_11_21_provider-mappings/plan.md` |
| D1/D2 memory | Corresponding sections in `aidd_docs/memory/architecture.md` and `aidd_docs/memory/testing.md` |
| Earlier documentary prerequisites, explicitly distinguished | `aidd_docs/backlog/spikes/adaptive-multi-provider-feasibility.md`, existing `aidd_docs/roadmap.md` change and original feasibility section in architecture memory |

Scope ambiguity to settle before any commit: the last row predates D1/D2 and is
not D1/D2 implementation. Including it is recommended to keep existing evidence
links resolvable, but requires explicit acceptance with the commit scope. It has
not been staged. A two-commit D1/D2 split would additionally require splitting mixed
memory/document links; no file has been rewritten merely to manufacture that split.

New D3 code/tests/fixtures/task documentation and D3 memory additions must be
excluded from the proposed D1/D2 commit. Shared memory files now contain multiple
slices; future staging must preserve these boundaries rather than include whole
files indiscriminately. No staging or commit has been performed.

## Adapter phase — done

- An in-memory `EodhdFixtureProvider` satisfies the structural `QuotationProvider`
  method and returns D2 neutral fields for explicit normalization. It has no HTTP
  transport, file loader, environment lookup, CLI selection or credential handling.
- Fixtures explicitly mark themselves synthetic. EODHD-shaped payload fields are
  `code`, Unix-second `timestamp`, `close`, optional `previousClose`/`change`.
  Context metadata (currency, exchange code, timezone, instrument type, data kind,
  adjustment and optional delay) is separately supplied by synthetic fixture
  declarations. It is not asserted to exist in EODHD's snapshot response.
- Admit only synthetic unadjusted last-price snapshot semantics. The field name
  `close` is not sufficient evidence of session-close data; actual trade/venue,
  adjustment and timestamp equivalence remain unqualified. No historical OHLCV
  endpoint or session-close mapping is accepted in this adapter.
- Missing symbols produce per-symbol unavailability. Malformed price/time/context,
  ambiguous duplicate codes and wrong provider/type/adjustment fail closed. Optional
  `previousClose`/`change` are neither trusted nor used to reconstruct a price.

## Validation

Executed locally on 21 November 2026:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_eodhd_fixture.py collector/tests/test_provider_mapping.py collector/tests/test_provider_contract.py -o addopts='' -q
git diff --check
```

**68 tests passed in 0.28 seconds**: 25 new D3 cases, 38 existing D2 cases and 5
existing D1 boundary cases. Existing model/runner evidence from the 91-test D2
run is reused; no full suite or financial/TypeScript test rerun. Tests load only
synthetic fixtures, and Yahoo child tests use a local module stub. No network calls.

New files:

- `collector/pea_collector/eodhd_fixture.py`: in-memory adapter with copied snapshots
  and context; no mutable fixture can change later results after construction.
- `collector/tests/fixtures/eodhd_snapshot.synthetic.json`: two artificial symbols,
  explicit context and deliberately unusable optional change/previous-close fields.
- `collector/tests/test_eodhd_fixture.py`: normalization, rejection, partial failure,
  provider isolation and fixture-mutation cases.

Rejections cover absent/null/nonpositive/NaN prices; absent, non-integer,
millisecond-shaped, invalid or future timestamps; missing/mismatched context;
adjusted/bar/session-close declarations; wrong provider, duplicate codes and absent
synthetic marker. Future-time rejection occurs at D2 normalization using the
explicit collection clock. No close is reconstructed from `previousClose`/`change`.
One unavailable/invalid symbol does not invalidate another valid snapshot; malformed
top-level structure or ambiguous duplicate codes reject the fixture as a whole.

The protocol method is structurally reused, but payload normalization remains
provider-specific: D1's current live runner requires Yahoo raw fields and must not
consume this neutral fixture adapter. Tests verify that the legacy Yahoo normalizer
rejects its output and that D2 rejects an EODHD response under a Yahoo mapping.
No existing Python runtime code, D1/D2 model/interface, CLI, financial path or
`access-collector.ts` was changed for D3. Import inspection finds the new adapter
only in tests. Local Markdown links/whitespace checked; index remains empty.

## External gates and proposed next slice

**D3 is not EODHD supplier qualification.** Monday's separately authorized checks
must establish exact listing/venue, currency/unit, timestamp meaning and freshness,
raw-versus-adjusted price semantics, anomalies, metered quotas and licence/private
storage/MCP rights. Fixture context is not a substitute for that evidence. Existing
multi-provider ingestion-grant restrictions remain unchanged.

Proposed next slice: inspect and record bounded, authorized real response evidence
before considering any HTTP adapter or shadow ingestion. If no network permission
or suitable licence exists, remain at offline contract qualification. Yahoo stays
the sole operational provider; no automatic fallback follows from this work.
