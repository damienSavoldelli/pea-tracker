# Live quotations — operational runbook

## Confirmed operational status — 2026-11-14

- The supervised AIR.PA catalogue import and one real Yahoo collection completed.
  D1 contains one instrument, one quotation observation and one ingestion receipt;
  portfolio tables remain empty. Backups and detailed evidence remain private.
- Ingestion was closed again: enabled flag false and grants `[]`.
- The separate D1 reader was deployed with owner-only Access and Managed OAuth.
  Anonymous MCP and quotation REST requests returned 401. The owner connected
  ChatGPT and supplied a screenshot showing the stored AIR.PA quotation, its Yahoo
  provenance and market/retrieval timestamps. This confirms the manual round trip.
- Freshness remains `unknown` with `market_calendar_unknown`; this is not a
  real-time quote or verification of a market calendar.
- Both Actions schedules remain commented. Provider recurring-use approval,
  protected-environment setup and monitoring readiness are not inferred from the
  approved one-off collection. No personal portfolio data has been loaded.
- The owner subsequently completed Actions live run #4 after replacing the
  mapping Secret with verified complete JSON. The job succeeded; the previous
  generic failure does not prove what the previous Secret contained.
  Read-only D1 verification found two observations and two receipts, with the same
  single instrument and all portfolio tables empty. Ingestion was closed again.
  This validates a manually dispatched hosted collector, not scheduled operation.
  Resetting the repository activation gates remains an owner-side GitHub action;
  their reset has not been independently verified. Service Token secret rotation
  is deferred by explicit owner decision and remains open before unattended use
  or release of personal portfolio data.

## Next operation — AIR.PA automation preparation

Do not repeat catalogue import or the manual round-trip setup below.

1. Review/create GitHub Environment `collector-live`: main branch only and required
   owner approval. This is a remote configuration operation requiring authorization.
2. Prepare its Actions Secrets from the existing private configuration:
   `COLLECTOR_MAPPING_JSON` (AIR.PA only), `COLLECTOR_API_ORIGIN` (ingestion origin),
   `COLLECTOR_ACCESS_CLIENT_ID`, `COLLECTOR_ACCESS_CLIENT_SECRET`. Enter the secret
   through GitHub's protected UI; never place it in arguments, chat or tracked files.
   Configure the approved independent heartbeat destination separately.
3. Keep `COLLECTOR_LIVE_ENABLED=false` until the required rights, coverage, security
   and monitoring gates are explicitly satisfied. The workflow evaluates its four
   gates before entering the protected job, so use repository Variables for
   `COLLECTOR_LIVE_ENABLED`, `COLLECTOR_PROVIDER_APPROVED`,
   `COLLECTOR_COVERAGE_APPROVED`, and `COLLECTOR_SECURITY_APPROVED`.
4. With separate authorization, deploy only the ingestion Worker with the existing
   single Yahoo/AIR.PA grant, then dispatch `Quotation collector` on main in `live`
   mode through the protected environment. Keep both schedules inactive. Verify the
   receipt and quotation through D1/MCP; close ingestion again on completion/failure.
5. Only after that run and monitoring/recovery checks, separately approve persistent
   ingestion enablement and uncommenting both existing schedules. Keep the existing
   30-minute cadence; do not expand the instrument allowlist implicitly.

Additional instruments require an owner-supplied list and verified mappings; they
are not a dependency of AIR.PA automation. Positions and valuation exposure remain
a separate step subject to the existing personal-data gates.

### Owner-approved supervised Actions execution

On 2026-11-14 the owner approved proceeding with one real AIR.PA Actions execution
under direct supervision, deferring the independent heartbeat until automation.
This is a scoped exception to the pre-activation monitoring requirement above,
not approval of unattended collection or a statement that recurring provider-use
rights have been established. Both schedules remain commented. The four workflow
gate variables must be true for this supervised dispatch; reset live, provider and
security gates to false afterwards, and close ingestion with empty grants.
GitHub CLI authentication was unavailable; dispatch/approval and reporting the run
result must therefore use the owner's authenticated browser. Do not rerun blindly
if delivery is uncertain; inspect the accepted receipt first.

## Reference procedures

All remote writes, Access setup, secrets, deployments and provider collection below
require separate owner authorization. Do not alter DEV, the existing OAuth PoC,
the 300-second machine assertion limit or existing Access policies.

## 1. Review and register one instrument

Review the ignored `.wrangler/catalogue-live/catalogue.private.json` and its source
evidence. Its UUID must match mapping/grant/SQL; never regenerate it on a retry.
Prepared outputs already exist. The offline preparation command below intentionally
refuses to overwrite them:

```sh
node scripts/catalogue-prepare.mjs .wrangler/catalogue-live/catalogue.private.json
```

Before a separately approved import, confirm the account/database, four migrations,
closed ingestion and no concurrent writer. Take a private export and Time Travel
bookmark. Require an empty initial catalogue/outcome table; if already populated,
stop and review the exact instrument and receipt rather than blindly importing.

```sh
npx wrangler d1 execute pea-tracker-quotes-ingestion \
  --config tests/fixtures/wrangler.access-collector-remote.private.jsonc \
  --remote --file .wrangler/catalogue-live/instrument.sql
```

The [official remote SQL-file import](https://developers.cloudflare.com/d1/get-started/)
documents rollback on incomplete execution. The SQL is captured from the native
repository batch, but SQL import does not execute the repository's JavaScript
post-batch conflict checks. This is a supervised bootstrap, not a general admin API.
Do not use it with changed input under an existing key. Verify exactly one expected
instrument and create outcome, zero quotes, and no changes to portfolio tables.
Do not expose public administration merely to load this one instrument.

## 2. Prepare the isolated reader

Private draft: `.wrangler/live-readiness/wrangler.access-read.private.jsonc`;
private owner-secret template: `.wrangler/live-readiness/access-read.secrets.json`.
Proposed Worker name: `pea-tracker-financial-read`; no hostname has been activated.
The existing D1 ID is private; no database/migration needs to be created again.

After approval, deploy initially closed (`ACCESS_READ_ENABLED=false`, workers.dev
and previews false). Configure a distinct owner-only Access application with Managed
OAuth on All traffic; obtain its own AUD and verify the exact signed owner subject.
Keep its AUD separate from ingestion and the existing PoC. Fill `ACCESS_READ_AUD`
and `ACCESS_OWNER_SUB` privately; verify issuer and binding. Do not send a Service
Token Client Secret to this Worker. Do not deploy the tracked example placeholders.

```sh
npx wrangler deploy --dry-run \
  --config .wrangler/live-readiness/wrangler.access-read.private.jsonc \
  --secrets-file .wrangler/live-readiness/access-read.secrets.json
```

Real deployment uses the same command without `--dry-run`, only after authorization.
Before later enabling reads/workers.dev, verify Access coverage and no conflicting
hostname/path/wildcard policy. Preview URLs stay disabled. Check anonymous and
non-owner rejection, machine-token rejection, absence of writes/portfolio routes,
then the separately approved ChatGPT connector to this new endpoint. Do not change
the connected PoC. An empty catalogue/quote result is valid until data is loaded.

## 3. First real quotation, manually controlled

Only after applicable Yahoo rights and mapping/security gates are approved:

1. Confirm unchanged provider metadata using the existing qualification mechanism;
   the public AIR sample check does not prove personal-catalogue coverage.
2. Prepare existing ingestion secrets with the single Yahoo grant from
   `.wrangler/catalogue-live/grants.private.json`; retain the existing service identity.
3. Authorize temporary ingestion activation, owner-masked secret input and one
   bounded live collector cycle with this mapping. Use the existing Python CLI and
   its private journal; keep credentials out of arguments/logs. No Yahoo call is
   authorized merely by preparing this runbook.
4. Verify accepted observations, receipt, timestamps, price/unit/provenance and
   unchanged portfolio tables. Retrieval failure is not a successful quote: preserve
   its fixed error and leave the last usable quote untouched.
5. Immediately restore ingestion flag false and grants `[]` after this test.
6. Through the new owner-only MCP, call `get_quotation_status` and `list_quotations`
   with the private UUID, provider `yahoo`, kind `last_trade`, adjustment `unadjusted`.
   Compare with D1-backed REST reads; do not call the ingestion Worker for reads.

## 4. Actions only after the manual round trip

Configure reviewed `collector-live` (main only, required owner approval), the four
existing approval/enabled variables, mapping/origin/Access credential Secrets and
an approved independent heartbeat/alert destination. Start with a manual live run;
confirm delivery, failure notifications, rotation/revocation and bounded resource
use. Retain fail-closed handling of missing original journals on rerun. Cron changes
and schedule activation require separate authorization. Both schedules stay commented.

Personal positions/PRU remain excluded until the existing private-data release gates
pass; a public instrument identity and a successful quote do not satisfy those gates.
