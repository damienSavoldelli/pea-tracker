---
status: implemented
---

# V2.0-D4 — Raw EODHD HTTP transport only

Current outcome: [owner-approved observation closure, measured capture and limits](finalization.md).
The [coverage preparation and recipes](coverage-readiness.md) preserve earlier
checkpoints; the reference and one bounded capture were subsequently completed.

Later local implementation: [D5 isolated response parser](response-parser.md),
24 November. It reuses this raw response and D2 normalization without changing
the transport or activating a provider; actual external-payload qualification remains open.

Later evidence: [owner-reported external PoC of 23 November, recorded 24 November](external-poc-2026-11-23.md).
This supplements the dated local D4 record below; it does not demonstrate that this
transport or a live normalized adapter executed the external tests. Yahoo remains
primary and no fallback is activated.

## Authority and scope

Owner explicitly approved reduced D4 after the normalization blocker: raw transport
only. No normalized quotation, synthetic adapter reuse on real responses, supplier
qualification, active collector wiring, network request, quota use, dependency,
Worker/D1/grant change, commit or deployment. Initial branch
`feat/v2.0d-multi-provider` was clean at `fa1c008`. Existing
[D3 qualification gates](../2026_11_21_eodhd-fixture-adapter/plan.md) remain open.

## Implementation phase — done

- Standalone `EodhdHttpClient.get_quotes(symbols)` reads `EODHD_API_TOKEN` from an
  environment mapping (defaults to the process environment). It issues a fixed-origin
  HTTPS GET to `/api/real-time/{first}`, `fmt=json`, and optional comma-separated
  additional `s` symbols as described in the existing study's
  [official endpoint reference](https://eodhd.com/financial-apis/live-ohlcv-stocks-api).
  This delivery performs no new external documentation/API request.
- Reuse existing `NoRedirect`, User-Agent and sanitized `CollectorError` conventions.
  Disable environment proxies, retain normal TLS verification, use a 1–30-second
  socket timeout (default 10), and bound response bytes to 64 KiB. No retry/fallback.
  Twenty unique symbols is a local safety cap, not a verified vendor maximum.
- Return HTTP status, content type and original bytes for success and HTTP errors.
  `is_success` reports HTTP status only. No JSON parsing, float conversion, partial
  result reconstruction, provenance or interpretation of prices/timestamps.
  Transport errors raise fixed `eodhd_timeout`/`eodhd_network_failure` codes. Oversized
  bodies fail explicitly rather than silently truncating. Bodies are excluded from
  result repr; URLs and raw evidence must remain private because URLs carry tokens
  and an upstream error body could reflect them.
- No import/call of `eodhd_fixture.py`, provider normalization or operational CLI.

## Validation

Executed locally on 21 November 2026:

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 collector/.venv/bin/python -m pytest collector/tests/test_eodhd_http.py -o addopts='' -q
collector/.venv/bin/python -m py_compile collector/pea_collector/eodhd_http.py collector/tests/test_eodhd_http.py
git diff --check
```

**39 tests passed in 0.06 seconds**, syntax check passed. Only simulated openers and
synthetic token values were used; no real socket, API request or quota. Tests cover
single/grouped URL construction, raw bytes and partial/malformed JSON preservation,
HTTP 3xx/4xx/5xx response bodies without retry, direct/wrapped timeouts, network and
incomplete-read failures, response limits, disabled redirects/proxies, environment
key and request validation, and absence of token/body logging or result repr leaks.
Local documentation links/whitespace checked. Previous Yahoo/D1/D2/D3 evidence
reused, not rerun; no full suite or TypeScript check because existing code is unchanged.

New files: `collector/pea_collector/eodhd_http.py`,
`collector/tests/test_eodhd_http.py`, this task record. Architecture/testing memory
updated. No existing runtime file or dependency was edited. The transport is only
imported by its test, and never invokes the synthetic EODHD adapter or normalization.
No staging, commit, remote configuration change or deployment.

## Limits

This is **transport preparation, not EODHD qualification or activation**. Price
meaning, adjustment, timestamp semantics/freshness, venue, currency/unit, exact
coverage, real per-symbol metering, storage/MCP licences and partial-error formats
remain to qualify under separate authority. A 200 or complete raw body proves none
of these. Missing or invalid records remain visible exactly as returned, not as
fabricated financial observations. Timeout is a socket timeout, not a hard total
process deadline. Streaming/large responses need a separately reviewed policy.
