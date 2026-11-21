# Controlled production deployment — 21 November 2026

## Subsequent explicitly authorized activation

The owner subsequently authorized deployment with financial writes enabled, while
expressly prohibiting every transaction/proposal, additional migration, push/merge
and Access/OAuth/ingestion/scheduler change.

- Activation deployment succeeded: **`6f891ed9-a06f-4b8b-8c81-acc06fdeb492`**.
- Published version inspection confirms `FINANCIAL_WRITES_ENABLED="true"`.
  Every other binding was compared with the prior disabled version and is unchanged,
  including the existing owner secret, D1 target, opening/portfolio and Access audiences.
- Authenticated connector ping returned `ok`. Historical opening read succeeded and
  exactly matched the prior disabled-deployment response.
- Anonymous MCP ping POST returned HTTP 401; anonymous browser confirmation GET
  redirected to authentication (HTTP 302). No proposal or financial event was created
  or approved. End-to-end authenticated browser approval is still to validate with
  an individually authorized real operation; these boundary checks do not prove it.
- Owner must refresh the existing ChatGPT connector tools; a new conversation may
  be needed if the current session keeps its old catalogue. Every actual financial
  recording still requires separate owner instruction and exact server approval.
- Private activation logs/metadata are retained in the existing ignored operational
  evidence directory. No credential or financial amount is reproduced here.

The sections below preserve the earlier **disabled-write deployment** evidence and
its then-current authorization boundary; they do not describe the latest flag value.

Owner authorization: apply only pending migrations 0005/0006, replace the financial
reader with the V1.1 composition, keep writes disabled and verify reads. No push,
merge, Access/OAuth change, ingestion/scheduler change or financial event authorized.

## Completed

- Source: branch `feat/v1.1-financial-management`, commit `380349b` (financial
  foundation `ac057edc`), clean before deployment. No new test campaign.
- Target: existing `pea-tracker-financial-read` and unchanged `INSTRUMENTS_DB` binding.
  Actual published binding ID was compared privately with the approved configuration.
- Initial opening anchor matched remotely before execution. Time Travel bookmark
  and previous deployment were retained under the ignored private evidence directory.
- Previous Worker version: `498fb8af-fab7-4bed-aa05-13bd5762d697`, 100% deployment.
- Only `0005_transactions.sql` and `0006_financial_approvals.sql` were pending;
  both applied successfully. Follow-up listing reports no migrations pending.
- V1.1 deployment succeeded: **`bd2d8531-7090-4bcd-91d6-572a21ed0770`**.
  Published version inspection confirms `FINANCIAL_WRITES_ENABLED="false"`, the
  approved portfolio binding and preservation of the owner secret binding.
- Connected MCP `ping` returned `status=ok`, `service=pea-tracker`.
- Connected MCP historical opening read succeeded and its entire decoded response
  matched the predeployment baseline. Financial values were not printed or stored
  in tracked evidence.
- Historical opening/position counts and quote observations were preserved across
  migrations. New journal, event and approval tables remained empty after deployment.
- Anonymous POSTs to administrative transactions and MCP financial confirmation
  returned **HTTP 401**. These are anonymous boundary checks, not proof of an
  authenticated owner's write-tool discovery/denial.
- Last existing collector run: [#64](https://github.com/damienSavoldelli/pea-tracker/actions/runs/44796120165),
  workflow_dispatch on 20 November, successful ingestion: delivered=true,
  observations=20, unavailable=0. Runs #62/#63 also succeeded. D1 retains successful
  quotes for 20 instruments; last successful fetch `2026-11-20T18:48:37.372Z`.
  Saturday deployment does not establish the next automatic weekday cycle. No
  collection was triggered and ingestion/scheduler were not modified.

## Remaining client verification — not claimed as passed

The owner refreshed the ChatGPT connector tools. This running Codex session still
exposes only the previous eight tools, with no `get_current_portfolio` function.
Its direct invocation fails locally with `TypeError: ... is not a function` and
does not reach the server. No credentials were extracted to circumvent this limit.

Use a newly refreshed/new client conversation to call `get_current_portfolio` for
the privately configured real portfolio, then verify the current tool list excludes
all preparation/confirmation tools while writes remain disabled. Until then the
production V1.1 projected-read/client discovery check is **pending**, not passed.
Local SDK/Worker/native D1 coverage remains the separately recorded 53-test evidence.

## Evidence and rollback boundary

Private operational metadata/logs: `.wrangler/live-readiness/v1.1-production/`.
No credentials, amounts, holdings or actual transaction data belong in this document.

No rollback was executed. Any later rollback requires authorization and targets
Worker code/version only; it must not restore D1 automatically, drop new tables or
delete financial records. Merely switching the current source to the old read
entrypoint with new V1.1 environment keys is unsafe because its parser is strict.

Financial activation remains explicitly unauthorized. Stop after these checks;
do not enable writes as a workaround for client tool discovery.
