---
status: implemented
objective: "Implement the approved Python/yfinance collector and inactive public-repository GitHub Actions preparation."
---

# Quotation collector — approved V1 implementation

Owner decision 2026-11-11: Python + yfinance + GitHub Actions, independent collector
in this **already public repository**. No Python Workers, VPS, Python web framework
or new provider comparison. [PRD](../2026_11_08-financial-backend-prd.md),
[baseline](../../../INSTALL.md), [ingestion contract](../2026_11_11_quotations/contract.md).

## Scope / acceptance

1. Modular provider, strict symbol mapping/normalization, bounded HTTP client and
   orchestration. Locked dependencies; synthetic offline pytest tests.
2. Preserve price, currency, unit, verified provider timestamps/time zone and source.
   No inferred price, adjusted-close fallback, market calendar or financial engine.
3. Finite provider/HTTP timeouts/retries, stable payload/key on delivery retry,
   private durable local retry journal, failure declarations without fake prices.
4. Real local Hono ingestion tests with existing dedicated JWT machine policy,
   least-privilege subject/provider/instrument grants and public diagnostic isolation.
5. Manual workflow prepared, schedule commented out, explicit live gates, main-branch
   only, pinned actions, contents:read, bounded concurrency/runtime, no PR execution
   with secrets, no payload/config/token artifacts or raw provider logging.
6. Missing-cycle monitoring preparation and clear external-monitor/activation gates.
   Qualify representative public Euronext/ETF metadata and Yahoo terms as far as
   available; external failures must not block local synthetic development.
7. Run pytest, existing TypeScript/OpenAPI/regressions and useful packaging checks.
   Final complete diff/security review, no staging/commit/push/deployment.

The collector never accesses D1 or holdings. Secrets belong in GitHub Actions
environment Secrets, never tracked files/logs/artifacts. A small explicit instrument
mapping is private configuration; the tracked example is synthetic only. No remote
secret, environment, resource, schedule or repository visibility change is authorized.

## Delivery phases

- Local collector and retry contract: done.
- Machine ingestion interoperability and QA: done (local synthetic integration).
- Inactive automation and external qualification: done; hosted activation gated.
- English Python documentation review: done.

Operational contract, known limits and activation gates: [contract.md](contract.md).

## Validation evidence — 2026-11-11

Local CPython 3.14.0 / uv 0.10.4. Locked runtime yfinance 1.8.0 and test pytest 9.2.0
installed in `collector/.venv`, with no global package installation. Both required
yfinance APIs import successfully; the editable package supports root and collector
working directories. Linux-hosted GitHub execution has not been activated/tested.

- 83 synthetic pytest cases pass after the final documentation pass: strict
  mappings/decimal bounds/source clocks, unavailable values, retries, process timeout,
  journal permissions/corruption/concurrent lock/process replay, HTTP redirects,
  machine token response checks, live gates, workflow structure/cadence/missing jobs,
  fixed check launcher and offline qualification argument guards.
- Host full TypeScript suite: 442 tests / 30 suites pass, including four actual
  Python CLI → JWT-protected Hono tests on Memory/native local D1. Existing OAuth,
  default diagnostics, OpenAPI, migrations, rollback, concurrency and restart tests
  pass. The Python tests block external socket connections and do not need Yahoo.
- Strict TypeScript passes. Existing OpenAPI document/representative batch response
  assertions pass without any API contract/schema change.
- Real read-only provider qualification: both public sample categories pass; no
  prices/raw payloads retained. Rights/full catalog coverage remain unverified.
- English documentation: all 15 Python files reviewed; 112 module/class/function
  nodes documented. ASTs with docstrings removed are identical before/after that
  pass. No behavior/import/assertion change was introduced by documentation.
- Python compileall and offline uv lock consistency pass. The fixed checks launcher
  passes all 83 tests; offline qualification succeeds from root and collector/.
- Worker dry-runs: DEV 1513.32 KiB / gzip 262.81; PoC 1564.10 KiB / gzip 277.02.
  Both pass with no bindings/private configuration loaded and no upload.
- Complete tracked/untracked diff reviewed; no credentials, personal financial
  data, environment files, private journals, databases or generated state selected.
  Documentation links and whitespace checks pass. Nothing is staged.

The initial loopback Python tests needed normal sandbox escalation; no sandbox rule
or permission boundary was weakened. No Git staging/commit/push, remote secret,
schedule, resource, deployment, paid service or real portfolio record was introduced.
