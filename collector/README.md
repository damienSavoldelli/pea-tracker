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

### V2.0-D observation utilities (local, inactive)

Real qualification checkpoint: one authorized 16-symbol group returned 16/16 and
cost 16 measured units; campaign total 17 with the reference, no bonus or retry.
Together with three acquired samples, response evidence covers 19/20; one identity
conflict remains excluded. Stored Yahoo values were compared without a new supplier
fetch. Differing source clocks and undeclared quote-body currency/unit/adjustment
fields prevent claiming exchange-trade equivalence or production admission.

`provider_observation.capture_shadow` composes the isolated EODHD transport,
parser, normalization and Yahoo-first shadow selector. Default execution is a plan
only; explicit execution additionally requires qualified policies, fresh account
usage and a quota store. It has no ingestion client or financial repository.
Neither the existing CLI nor the active workflows import this composition.

`PrivateQuotaLedger` reuses the private runner journal and account-wide file lock.
It reserves before I/O, retains uncertain spend, refuses replay, requires refreshed
usage at UTC rollover and caps this qualification campaign at 18 base units, with
two daily units withheld. All account consumers must share its directory or remain
stopped. An ephemeral Actions checkout is **not** shared persistent storage; E must
wire the `QuotaStore` port to an approved shared authority before cloud execution.
The local campaign cap is deliberate, not an always-on collector quota service.

Offline replay requires private mode-0600 files: a JSON array of `FeedPolicy`
declarations (each includes a complete `ProviderMapping`), raw response bytes, and
a receipt with `state=response_saved`, `http_status`, `content_type`,
`body_received_at` and matching `body_sha256`. Existing normalized Yahoo rows and
previous selections are optional private JSON inputs. Supply previous selections
when comparing against already selected prices; otherwise this is a first-selection
experiment, not proof of monotonic selection across historical runs.

```sh
collector/.venv/bin/python -m pea_collector.provider_observe \
  --policies "$PRIVATE_POLICIES" --body "$PRIVATE_CAPTURE" \
  --receipt "$PRIVATE_RECEIPT" --existing "$PRIVATE_YAHOO_ROWS" \
  --previous "$PRIVATE_PREVIOUS_SELECTIONS"
```

This command never fetches data. It prints only fixed codes/counts and indexed
selection diagnostics, evaluated **as of the recorded capture time**. It does not
claim that an archived quote is fresh now. Private normalized rows remain inside
the composition; never log its full return value or upload inputs as CI artifacts.
The reference qualifier compares exact ISIN/ticker/currency and requires separate
reviewed venue evidence; a `.PA` suffix cannot establish ALXP identity.

See [finalization evidence and integration gates](../aidd_docs/tasks/2026_11/2026_11_21_eodhd-http/finalization.md)
and [operator-reviewed reference/capture recipes](../aidd_docs/tasks/2026_11/2026_11_21_eodhd-http/coverage-readiness.md).

### Existing active Yahoo boundary

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
Auth have been verified in prior supervised operation.
Persistent ingestion and publication of the weekday schedules were subsequently
authorized and completed according to the owner handover. The first complete
scheduled cycle on Monday 16 November 2026 remains to be confirmed; this update
performs no hosted check. See the [current V1 runbook](../aidd_docs/tasks/2026_11/2026_11_14_live-quotations-read/runbook.md).
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
The schedule publication is recorded in commit `1c24a57336a2ae3f83c6c3c9a1dffa299a5d4ec2`
on `main`. Collection is configured at 30 minutes, cron `17,47 6-18 * * 1-5` UTC;
the monitor uses `9 * * * 1-5` UTC. In November collection spans 07:17–19:47 Paris
time on weekdays. Publication is not proof of scheduled execution: the first
complete 16 November cycle remains to be confirmed. Prior offline automation
evidence includes 44 targeted Python tests; none were rerun for this documentation.
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
restriction, repository/ref checks and dedicated environment Secrets. That change
was owner-authorized; main-only protection and unchecked Required reviewers were
shown in the prior session, not independently rechecked through the CLI. The owner
confirmed complete mapping JSON; do not treat this as proof of a scheduled run.
Do not rely on its name alone: GitHub can auto-create missing environments without protection.

Put these values in that Environment's **Actions Secrets**, never workflow/source
files: `COLLECTOR_MAPPING_JSON`, `COLLECTOR_API_ORIGIN`,
`COLLECTOR_ACCESS_CLIENT_ID`, `COLLECTOR_ACCESS_CLIENT_SECRET`, and optionally
`COLLECTOR_HEARTBEAT_URL` for an already approved independent dead-man checker.
No secrets are passed to dependency installation or synthetic tests. Never echo the
mapping: automatic masking of structured JSON is not sufficient by itself.

The published schedule is offset from the hour and uses a broad weekday UTC
collection window, not an exchange calendar. `COLLECTOR_INTERVAL_MINUTES` accepts
30 (default), 60 or 120. Longer intervals intentionally provide less freshness;
they do not change backend warning/stale thresholds. A separate read-only workflow
detects missing successful **actual live steps**, excluding synthetic/skipped jobs.
It adds `actions: read` solely to inspect run/job conclusions; no ingestion secret.
One unavailable instrument already makes the collector CLI fail after delivering
the complete batch of success/failure observations. Ingestion success alone is not
a healthy cycle. The safe counters distinguish unavailable instruments from
unchanged prices, which are normal before opening or outside market sessions.
Targeted synthetic CLI-to-monitor regression cases cover partial delivery and
recovery. The monitor retains its existing grace/age threshold and closing-slot
checks; no new notification channel or repeated per-instrument alert is added.
GitHub Actions email/web failure notifications were shown and saving was requested;
saved settings and actual alert delivery were not independently verified. Retain
these notifications for both collector and monitor. Fixed failure summaries contain no private data.
The monitor detects missing successful collection steps while GitHub is running;
both workflows depend on GitHub, so they cannot independently detect its outage.
The existing optional external heartbeat is unchanged and unconfigured. This
limitation must be acknowledged in the unattended-activation decision. Public
schedules can be disabled after 60 days without repository activity.

### Historical activation checklist and future reactivation

The following procedure preserves the original activation order. It is not the
next operation for the running V1; do not reset gates or close ingestion merely
because this historical checklist starts in a closed state. Current next check:
successful scheduled `Run collector`, advancing successful-fetch timestamps across
the reviewed catalogue, and market dates after opening, allowing for no recent trade.
The optional heartbeat remains unconfigured. Credential rotation was explicitly
deferred to finalization by the owner; it is not claimed complete here.

For a separately authorized new activation: approve data-use rights/full mapping, configure and test
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
