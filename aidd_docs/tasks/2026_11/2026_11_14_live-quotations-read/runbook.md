# Live quotations — operational runbook

## Current V1 status — 2026-11-14

This summary incorporates the prior owner-session handover. No remote operation,
test or credential inspection was performed for this documentation update.

| Evidence level | Current scope / limitation |
| --- | --- |
| Developed | Shared REST/MCP catalogue, opening-state, positions/cash, stored quotation status/history and exact EUR valuation; Python/yfinance and batch-only machine ingestion |
| Tested locally | Prior synthetic native D1/Memory, REST/OpenAPI/MCP and collector checks recorded in slice contracts/plans; 44 targeted Python automation tests previously passed, not rerun here |
| Validated in operation | Real ChatGPT reads and grouped valuation succeeded in the prior session, with timestamps, coverage and warnings. This does not individually certify every REST route |
| Prior deployment evidence | `pea-tracker-financial-read` serves owner-only reads; `pea-tracker-quotes-ingestion` was deployed for persistent ingestion bounded to the reviewed Yahoo catalogue. Anonymous ingestion returned HTTP 401 in the prior session |
| Awaiting confirmation | First complete scheduled cycle on Monday 16 November 2026; publication and dashboard screenshots are not execution evidence |
| Planned / under study | V1.1 per the [roadmap](../../../roadmap.md); no development started or blanket feasibility approval |

Publication on `main`: `1c24a57336a2ae3f83c6c3c9a1dffa299a5d4ec2`.
The ingestion version verified in the prior session was
`72b8d6d9-1a53-4ba7-8bdb-ace2faa15a77`; no current remote version check is claimed.
Collector cron: `17,47 6-18 * * 1-5`; monitor cron: `9 * * * 1-5` (UTC).
Collection is configured at 30 minutes in a weekday window, 07:17–19:47 Paris
time in November, without a real exchange calendar.

The owner confirmed complete mapping JSON and showed `collector-live` restricted
to `main`, with Required reviewers unchecked. Failure-only GitHub/email notifications
were shown and saving was requested. CLI authentication was unavailable: not all
saved remote settings were independently verified. Monitoring depends on GitHub;
the optional external heartbeat is unconfigured. Fresh-runner retries without the
original private journal remain fail-closed, not automatic cross-run recovery.

Freshness remains `unknown` / `market_calendar_unknown`. Quote observations are not
an atomic cross-instrument snapshot. A previously encountered individual-tool-call
limit has an undetermined cause; it is not evidence of collection failure. Rotation
was deferred by explicit owner decision to finalization and is not claimed complete.
No tag or release has been created.

## Next check — scheduled cycle of 16 November 2026

Evidence to obtain later through a separately authorized read-only check:

1. A successful **Scheduled** execution with the actual `Run collector` step successful;
   skipped/synthetic jobs or a green overall workflow alone do not suffice.
2. Successful-fetch timestamps advanced across the reviewed catalogue; distinguish
   last attempt from last successful retrieval.
3. Market dates checked after opening, allowing for instruments with no recent trade.
   A recent retrieval of an old trade does not establish collector failure or realtime data.

Prefer one grouped `get_portfolio_valuation` with provider `yahoo`, price kind
`last_trade`, adjustment `unadjusted`, displaying `quotation.last_successful_fetch_at`
and market dates. Do not fan out individual `get_quotation_status` calls. If the
call fails, report the error without reusing previous financial data.
After this check, consider `v1.0.0` and a release only with explicit authorization.
Do not repeat the initial catalogue bootstrap or reset live settings for this check.

## Historical evidence — initial supervised bootstrap, 2026-11-14

The following sections retain the original single-public-sample scope and its
temporary settings. They precede the current V1 status above; statements about
empty portfolio tables, inactive schedules or closed ingestion describe that stage.
Their former activation prerequisites are not a new instruction to interrupt V1.

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

## Historical procedure — AIR.PA automation preparation

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

## Historical reference procedures — initial bootstrap

These procedures preserve the originally reviewed bootstrap. Their empty-database,
single-instrument, quotation-only reader and commented-schedule assumptions do not
describe current V1. In particular, current authorized portfolio reads are present;
do not apply the old absence-of-portfolio-routes check to the current reader.
The original required-reviewer/heartbeat steps below predate the later authorized
unattended settings. Do not rerun these procedures without a newly scoped review
and explicit operational authorization. Historical contracts remain unchanged.

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
