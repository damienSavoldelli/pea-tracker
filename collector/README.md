# PEA Tracker quotation collector

Independent Python provider adapter and HTTP ingestion client. The repository is
already **public**. No portfolio positions, database access or financial calculations
belong here. Backend prices/quantities remain exact decimal strings.

## Local synthetic development

Python 3.14 and uv 0.10.4 are used. `uv.lock` pins runtime/test dependencies and
distribution hashes; the editable package works from the repository root or from
`collector/`. No global Python package installation is needed.

```sh
uv sync --project collector --frozen
collector/.venv/bin/python -m pea_collector.checks --
collector/.venv/bin/python -m pea_collector.qualify --offline --
```

The check launcher runs only `collector/tests`, rejects extra arguments, disables
plugin autoload and clears inherited pytest options. Tests block external socket
connections; the HTTP transport test uses loopback. No Yahoo/API key is needed.
The exact raw equivalent is `collector/.venv/bin/python -m pytest collector/tests`;
it remains a separate execution approval because pytest permits extra code paths.

To exercise the collector without ingestion, from `collector/`:

```sh
.venv/bin/python -m pea_collector --cycle-id synthetic-local
```

Only the packaged `mapping.synthetic.json` and generated synthetic quotes are used.
Output contains counts and fixed status codes, never prices, symbols or tokens.
`.collector-state/` is ignored, owned/private (directory 0700, files 0600).
Reusing a cycle ID reuses the original journal; use a new ID for a new retrieval.
Never upload the journal, mappings or caches as public CI artifacts.

`tests/collector.http.test.ts` runs the real Python CLI against guarded Hono
loopback servers, existing signed machine JWT policies and Memory/native local D1.
Run the root TypeScript suite with `node node_modules/vitest/vitest.mjs run --`.
Those four cross-language tests explicitly skip if this venv is absent; the
implementation evidence records a host run where all four executed.

## Provider boundary

- Explicit instrument UUID ↔ symbol, exchange, instrument type, currency/unit and
  source time-zone mapping; maximum 20 unique mappings. The tracked mapping is
  entirely synthetic; real mappings must not become a list of personal holdings.
- Only `regularMarketPrice` + `regularMarketTime` from `Ticker.get_info()` are used;
  no history/adjusted-close fallback. Mismatched/missing metadata is rejected.
- Session date is derived from the provider timestamp using the **verified source
  exchangeTimezoneName**, not a guessed exchange calendar. This is not proof of an
  expected trading session, holiday calendar or real-time freshness.
- Prices are serialized via Decimal(str(value)), never rounded or unit-converted.
  At most 30 significant / 12 fractional digits; upstream float precision cannot be
  recovered and this limitation is explicitly recorded in provenance.
- Currency-unit prices stay unchanged; reported GBp/GBX maps explicitly to GBP
  hundredth_currency_unit. Ambiguous unit/currency pairs fail rather than convert.
- Provider delay remains null until a reliable source field/semantics is verified.
- Each yfinance call runs in an owned child with a 15-second deadline and private
  disposable cache. Raw provider stdout/stderr/errors are suppressed. Two attempts
  maximum, no immediate retry on rate-limit or invalid-data results.

Live metadata qualification is an explicit network operation requiring approval:

```sh
collector/.venv/bin/python -m pea_collector.qualify --live
```

It checks two public representative samples without printing/storing prices or
reading owner holdings. Offline qualification is the default. Neither mode grants
data-use rights or proves complete instrument coverage.

## Delivery and machine authentication

POST only to `/api/v1/quotation-batches` on a configured origin. Production uses
HTTPS, no redirects or environment proxies, bounded response sizes and timeouts.
Transient network/5xx failures retry the exact bytes/key at most three times.
401/403/409/422 and rate limits stop; do not automatically change a key after 409.
Failure observations have null prices; the backend preserves the last usable quote.

A new short-lived OAuth Client Credentials token is requested **after** collection:
`quotes:ingest` only, no refresh token. Configure an approved machine issuer/client,
distinct audience and stable internal subject in the existing JWT verifier policy;
never reuse the interactive Cloudflare MCP owner assertion/token. The optional
`src/collector-app.ts` composition reuses that verifier and mounts ingestion only.
It is not imported by deployed entrypoints. No identity provider, secret, D1 binding
or endpoint has been configured remotely by this work.

Only synthetic loopback integration uses `--deliver-local` with an ephemeral
`COLLECTOR_ACCESS_TOKEN`. Live mode forbids this option. Tests pass tokens through
the child environment, never process arguments or logs.

Delivery journals preserve original payload/key across local process restarts.
Fresh GitHub runners do not retain private journals: run attempt >1 fails closed
before fetching if the original journal is missing. This prevents conflicting
recollection under a used key, but is **not** durable automatic cross-run recovery.
Recover using the original private journal when available, or start a deliberately
new collection cycle after checking backend status. No private artifact/cache is
introduced as a workaround.

## Inactive GitHub Actions preparation

Both workflow files have only `workflow_dispatch`; their Cron entries are comments.
No push/PR/fork trigger is installed. Main branch and exact repository identity are
checked. Actions are SHA-pinned, checkout credentials are not persisted, jobs are
bounded and concurrency never cancels an in-flight delivery.

The live job also requires these repository Variables to equal `true`:

- `COLLECTOR_LIVE_ENABLED`
- `COLLECTOR_PROVIDER_APPROVED`
- `COLLECTOR_COVERAGE_APPROVED`
- `COLLECTOR_SECURITY_APPROVED`

Use a manually reviewed `collector-live` GitHub Environment, restricted to main
with required owner approval. Do not rely on its name alone: missing environments
can be auto-created by GitHub without protection. Configure and review protection
before enabling any gate. No environment or variable was created by this work.

Put these values in that Environment's **Actions Secrets**, never workflow/source
files: `COLLECTOR_MAPPING_JSON`, `COLLECTOR_API_ORIGIN`, `COLLECTOR_TOKEN_URL`,
`COLLECTOR_CLIENT_ID`, `COLLECTOR_CLIENT_SECRET`, `COLLECTOR_AUDIENCE`, and optionally
`COLLECTOR_HEARTBEAT_URL` for an already approved independent dead-man checker.
No secrets are passed to dependency installation or synthetic tests. Never echo the
mapping: automatic masking of structured JSON is not sufficient by itself.

The proposed schedule is offset from the hour and uses a conservative weekday UTC
collection window, not an exchange calendar. `COLLECTOR_INTERVAL_MINUTES` accepts
30 (default), 60 or 120. Longer intervals intentionally provide less freshness;
they do not change backend warning/stale thresholds. A separate read-only workflow
detects missing successful **actual live steps**, excluding synthetic/skipped jobs.
It adds `actions: read` solely to inspect run/job conclusions; no ingestion secret.
GitHub-wide failures can stop both workflows: independent heartbeat monitoring and
notification testing remain activation prerequisites. Public scheduled workflows
can be disabled after 60 days without repository activity; notifications alone do
not detect a job that never starts.

Before any activation: approve data-use rights/full mapping, configure and test
machine authentication/allowlists, approve remote backend/D1 work separately,
measure CPU/query budgets with bounded batches, test monitoring/recovery, and then
explicitly approve uncommenting schedules and remote workflow activation.

See [AIDD plan and evidence](../aidd_docs/tasks/2026_11/2026_11_11_collector/plan.md)
and [contract](../aidd_docs/tasks/2026_11/2026_11_11_collector/contract.md).
