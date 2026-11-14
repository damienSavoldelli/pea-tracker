# Approved-next-operation runbook — not executed

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
