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
The shared transport sends `User-Agent: pea-tracker-collector/0.1.0`, identifying
the application rather than relying on urllib's library default, which Cloudflare
can reject on `workers.dev`. A documented Cloudflare JSON 1010 response becomes
the fixed, non-retryable `browser_integrity_1010` error. Optional operator diagnostics
expose only bounded metadata and allowlisted codes, never upstream prose or bodies.
Transient network/5xx failures retry the exact bytes/key at most three times.
401/403/409/422 and rate limits stop; do not automatically change a key after 409.
Failure observations have null prices; the backend preserves the last usable quote.

Production uses **Cloudflare Access Service Tokens + Service Auth**. The selected
`COLLECTOR_AUTH_MODE` is `cloudflare_access` (the production default). Each request
sends only `CF-Access-Client-Id` and `CF-Access-Client-Secret`; no OAuth token endpoint,
bearer, refresh token or interactive MCP owner identity is used. Access checks the
pair and forwards its signed assertion to the Worker. The backend checks its fixed
issuer, distinct ingestion application AUD, signed service identity and time bounds,
then grants only `quotes:ingest` with server-side provider/instrument allowlists.

The dedicated collector Worker exposes ingestion only, with no MCP,
portfolio/admin routes or quotation reads. Hosted manual ingestion and Service
Auth have been verified; unattended scheduling is a separate activation step.
Use the [machine-ingestion runbook](../aidd_docs/tasks/2026_11/2026_11_11_remote-ingestion/contract.md)
for the approval-gated configuration, rotation and revocation procedure.

Synthetic loopback integration uses `--deliver-local`; it defaults to the existing
ephemeral `COLLECTOR_ACCESS_TOKEN` fixture. Setting `COLLECTOR_AUTH_MODE` explicitly
to `cloudflare_access` permits the synthetic Access pair against a simulated local
edge. Live mode forbids `--deliver-local`. Tests pass credentials through the child
environment, never process arguments or logs. Production rejects mixed Access,
bearer and legacy OAuth variables rather than choosing an implicit fallback.
The old ClientCredentials class remains only for explicitly constructed compatibility
clients/tests; the production CLI cannot select it.

Delivery journals preserve original payload/key across local process restarts.
Fresh GitHub runners do not retain private journals: run attempt >1 fails closed
before fetching if the original journal is missing. This prevents conflicting
recollection under a used key, but is **not** durable automatic cross-run recovery.
Recover using the original private journal when available, or start a deliberately
new collection cycle after checking backend status. No private artifact/cache is
introduced as a workaround.

## GitHub Actions automation

Both workflow files support `workflow_dispatch` and the reviewed weekday schedules.
The schedule change is local until an explicitly approved commit and push; it does
not activate GitHub Actions by itself. Current hosted activation must be verified
separately rather than inferred from the local files.
No push/PR/fork trigger is installed. Main branch and exact repository identity are
checked. Actions are SHA-pinned, checkout credentials are not persisted, jobs are
bounded and concurrency never cancels an in-flight delivery.

The live job also requires these repository Variables to equal `true`:

- `COLLECTOR_LIVE_ENABLED`
- `COLLECTOR_PROVIDER_APPROVED`
- `COLLECTOR_COVERAGE_APPROVED`
- `COLLECTOR_SECURITY_APPROVED`

Use the reviewed `collector-live` GitHub Environment, restricted to main. Required
reviewers are suitable for supervised dispatches, but block every scheduled job
until a human approves it. Unattended operation therefore requires explicit owner
approval to remove that per-run review rule while retaining the main-only branch
restriction, repository/ref checks and dedicated environment Secrets. Do not rely
on its name alone: GitHub can auto-create missing environments without protection.

Put these values in that Environment's **Actions Secrets**, never workflow/source
files: `COLLECTOR_MAPPING_JSON`, `COLLECTOR_API_ORIGIN`,
`COLLECTOR_ACCESS_CLIENT_ID`, `COLLECTOR_ACCESS_CLIENT_SECRET`, and optionally
`COLLECTOR_HEARTBEAT_URL` for an already approved independent dead-man checker.
No secrets are passed to dependency installation or synthetic tests. Never echo the
mapping: automatic masking of structured JSON is not sufficient by itself.

The proposed schedule is offset from the hour and uses a conservative weekday UTC
collection window, not an exchange calendar. `COLLECTOR_INTERVAL_MINUTES` accepts
30 (default), 60 or 120. Longer intervals intentionally provide less freshness;
they do not change backend warning/stale thresholds. A separate read-only workflow
detects missing successful **actual live steps**, excluding synthetic/skipped jobs.
It adds `actions: read` solely to inspect run/job conclusions; no ingestion secret.
Enable GitHub Actions email/web notifications, optionally failed workflows only,
for both collector and monitor. Fixed failure summaries contain no private data.
The monitor detects missing successful collection steps while GitHub is running;
both workflows depend on GitHub, so they cannot independently detect its outage.
The existing optional external heartbeat is unchanged and unconfigured. This
limitation must be acknowledged in the unattended-activation decision. Public
schedules can be disabled after 60 days without repository activity.

Before any activation: approve data-use rights/full mapping, configure and test
machine authentication/allowlists, approve remote backend/D1 work separately,
measure CPU/query budgets with bounded batches, test monitoring/recovery, and then
explicitly approve publishing the prepared schedules and remote activation.

Activation order: keep `COLLECTOR_LIVE_ENABLED=false`; confirm the complete private
mapping Secret and main-only environment; configure failure notifications and
approve the review-rule change; deploy the existing ingestion Worker with exactly
the reviewed Yahoo instrument allowlist; publish the schedules; finally enable the
repository gate. Stopping collection requires disabling that gate and closing the
ingestion Worker with empty grants. Do not rerun failed cycles blindly.

See [AIDD plan and evidence](../aidd_docs/tasks/2026_11/2026_11_11_collector/plan.md)
and [contract](../aidd_docs/tasks/2026_11/2026_11_11_collector/contract.md).
