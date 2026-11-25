---
status: implemented
---

# V2.0-D5 — Isolated EODHD response parser

Later qualification: [nine captured JSON files and Free-plan limits](captured-json-qualification.md).
Three original EODHD bodies now pass this parser unchanged; this does not qualify
the assumed listing/currency/adjustment context or reconstruct exact reception time.
The original synthetic checkpoint below is retained, not rerun.

## Scope

Owner continued the [external PoC integration plan](external-poc-2026-11-23.md).
Implement only the small offline parser/normalization bridge using the documented
D4 JSON envelope and existing D2 normalization. Actual external JSON, entitlements
and receipt-time evidence remain missing; no production feed admission follows.
Stay on `feat/v2.0d-multi-provider`; preserve preceding uncommitted documentation.
No new branch, main edit, merge, staging/commit, provider call, credential access,
dependency installation, ingestion, routing, deployment or financial change.

## Phase 1 — Parser and synthetic workflow

Status: done.

Acceptance criteria:

- Consume bounded raw D4 responses with object or array JSON envelopes; match exact
  requested codes without positional association. Reject ambiguous keys/identities.
- Decode fractional numbers as Decimal; preserve source precision through D2.
  Reject malformed price/time without inventing prior close, currency or timestamp.
- Keep missing symbols distinguishable from invalid rows; a bad price/time in one
  symbol must not destroy a valid neighbor. Sanitize HTTP/error-body failures.
- Use explicit caller-provided mapping/provenance and optional qualified delay.
  Unknown delay remains null; a mapping is not proof of live qualification.
- Exercise raw bytes → parser → D2 entirely on synthetic data. Preserve existing
  HTTP/fixture implementations, Yahoo CLI/runner and financial source unchanged.

## Verification

Executed 24 November 2026 with already installed dependencies:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_eodhd_response.py -o addopts='' -q
collector/.venv/bin/python -m py_compile collector/pea_collector/eodhd_response.py collector/tests/test_eodhd_response.py
git diff --check
```

**42 new targeted tests passed in 0.03 seconds**, plus Python syntax checks.
Synthetic object/array bytes exercise Decimal precision, code-based association,
one invalid neighbor, missing symbols, duplicate keys/codes, wrong symbols,
HTTP errors/rate limits, invalid media type, oversized and malformed bodies,
non-finite/extreme numbers, missing/invalid/future source times, wrong stream/context
and exclusion of untrusted extra fields. The inherited test network guard remained
active; no network or credentials were used. Import inspection finds the new module
only in its tests, never in the active CLI/runner or financial services.

Existing D1–D4 campaigns are reused, not rerun. No global application suite was run
for this isolated addition. No actual supplier payload or production readiness is
claimed. Whitespace and local documentation links are checked without staging.

New module: `collector/pea_collector/eodhd_response.py`. Public API:
`parse_eodhd_response(response, symbols)` returns only requested source fields;
`normalize_eodhd_snapshot(mapping, snapshot, fetched_at, provenance=...,
provider_delay_seconds=None)` delegates to D2 after exact symbol/stream checks.
The latter trusts the caller's explicit context; it cannot establish that context's
real-world qualification. Raw missing symbols return no row; normalization reports
`provider_unavailable`. Invalid price/time yields `invalid_provider_data` per symbol.
Ambiguous JSON identity rejects the complete envelope. No error body is emitted.

## Remaining gates

Review the owner's redacted existing JSON and account entitlement, complete missing
catalogue/identity and timestamp evidence, then decide separately whether a live
adapter or shadow policy can be implemented. This parser has no network entrypoint
or automatic activation. The existing fixture adapter remains explicitly synthetic.

Reference: [EODHD snapshot fields and envelopes](https://eodhd.com/financial-apis/live-ohlcv-stocks-api),
checked 24 November 2026; object/array snapshots, Unix seconds UTC and latest delayed
`close` are documented, but exact listing/adjustment equivalence remains unqualified.
