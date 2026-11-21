# Financial MCP contract — local V1.1

Production follow-up, 21 November: the separately authorized read-only deployment
is recorded in [operational evidence](production-2026-11-21.md). Descriptions below
of an unselected/unmigrated local composition refer to the earlier local milestone.
Production writes remain disabled; hosted projected-read client verification is
still pending in this running session.

## Confirmed implementation

- MCP adapters call application services directly, just like the existing isolated
  administrative REST adapter. No internal HTTP hop, duplicated finance arithmetic,
  brokerage order, new provider, framework, Worker resource or dependency.
- `portfolio:write` is a **business capability**, not Cloudflare administration.
  Only explicitly configured, cryptographically verified owner identity receives
  it. `portfolio:approve` is separately issued to the browser confirmation path.
  Neither permission grants ingestion, catalogue administration or opening edits.
- `TransactionService.append` accepts the new business permission or the existing
  REST business-admin permission; the administrative REST adapter still requires
  its original permission. It is not mounted by the new Worker composition.
- The historical `access-read.ts` entrypoint and its constant read-only mapping are
  unchanged. No Wrangler configuration selects the new optional entrypoint.

## Tools

| Tool | Effect |
| --- | --- |
| `prepare_recorded_buy`, `prepare_recorded_sell` | Preview already executed trade, explicit gross amount and optional actual fees |
| `prepare_cash_deposit`, `prepare_cash_withdrawal` | Preview an external cash movement |
| `prepare_received_dividend` | Preview cash actually received, optionally linked to an instrument |
| `prepare_transaction_reversal` | Preview existing traceable counterposting rules |
| `get_transaction_journal` | Read recorded operations/current journal balances |
| `confirm_financial_operation` | Consume exact browser approval and append the approved immutable intent |

Preparation tools persist a proposal, so their annotations are **not read-only or
idempotent**, even though they do not change financial journal balances. Confirmation
is marked modifying/destructive and idempotent. Annotations never authorize a write.
Tool discovery hides preparation/confirmation from read-only principals; service
checks independently enforce identity and permissions.

## Exact intent and human approval

1. Financial preview uses `TransactionService.preview` → existing `applyTransaction`.
   No journal event or alteration to the V1 opening occurs during preparation.
2. Server generates a UUID (also the immutable append idempotency key), five-minute
   timestamps and SHA-256 fingerprint. Fingerprint covers normalized input, pinned
   owner/real portfolio, opening ID/revision and expected journal version. It is a
   binding, **not an authentication credential**. Proposal/recap are persisted.
3. Owner opens `/financial-confirmation/:id`. Server verifies the exact owner and
   the browser-specific signed Access audience. A recap identifies instrument,
   quantity, actual declared fees, date/source and exact cash/quantity impacts.
4. Explicit same-origin form POST requires a server-stored one-time nonce and
   matching Secure/HttpOnly/SameSite cookie. No third-party scripts/assets; CSP
   forbids scripts, frames and external submissions. Rendering is escaped, bodies
   bounded to 1 KiB, responses no-store, referrers suppressed.
5. The form grants approval only; it does not alter positions/cash. ChatGPT then
   calls confirmation with **only operation ID and fingerprint**. Server loads the
   immutable intent; caller cannot substitute amounts, fees, account or dates.
6. Atomic `approved → consumed` compare-and-set permits one append attempt.
   Existing journal receipt/CAS handles financial persistence and exact replay.
   A scheduled task has no browser-approval permission and cannot self-approve.
   It can only complete a specific operation already approved by the owner.

No `confirmed=true`, caller-claimed task mode, user-agent or tool annotation counts
as human consent. The browser page does not accept MCP bearer credentials. Its
Access AUD must differ from the MCP AUD; the MCP assertion cannot authorize it.

## Persistence and failures

- Existing journal repositories/migration 0005 remain responsible for financial
  events. Additive **local-only** migration 0006 stores proposals and approval
  timestamps. SQL triggers forbid changing immutable content/recap or rearming a
  consumed approval. Memory is only a synthetic/local substitute.
- Consumed approval with a committed receipt returns the immutable original result
  on retry while the proposal remains valid, even after subsequent transactions.
- Approval consumption and journal append are deliberately separate transactions:
  a crash before append, or a failed CAS, burns the approval. Retry can **only read
  an existing receipt**, never append again. No receipt gives
  `financial_confirmation_consumed`. Inspect the journal before preparing another
  operation; do not silently retry ambiguous writes or reset consumed approvals.
- At expiry, page approval/confirmation are refused. Later resolution uses the
  journal. No automatic purge or retention policy is introduced; proposals contain
  private financial data and must receive journal-equivalent storage protection.
- Reversals, exact decimal rules, solvency, chronology, fees, original opening
  provenance and real/simulated isolation stay in existing domain/services.

## Minimal configuration, not applied

The existing Managed OAuth application need not change. Its grant/session durations
remain untouched. Financial permission comes from the Worker's explicit owner policy,
not fabricated OAuth scopes or a Cloudflare administrator role.

For reliable separate browser consent, use **one path-specific Access protection**
on the same existing financial Worker hostname:

1. Zero Trust → Access controls → Applications → self-hosted application for
   `<existing-financial-host>/financial-confirmation/*`.
2. Explicit Allow policy for the existing owner/identity provider only. No Bypass,
   Service Auth or broad membership. A more-specific path does not inherit the
   parent's policy: configure this rule explicitly.
3. Leave **Managed OAuth disabled on this browser application**. Keep it enabled
   and unchanged on the existing MCP application. Pin the new application's AUD
   as `ACCESS_CONFIRMATION_AUD`; it must differ from `ACCESS_READ_AUD`.

Why this small Access application is necessary in this implementation: Managed OAuth
and browser login look identical to the origin for the same application. A separate
AUD on the approval path prevents the existing MCP grant from approving its own
proposals. If an already suitable browser-only Access application exists, reuse it;
no assumption that it exists was made. No new Worker, database or identity provider.

Optional entrypoint `src/entrypoints/access-financial.ts` accepts the existing D1,
issuer/read audience/owner/read enable flags/calendar configuration, plus:

| Setting | Meaning |
| --- | --- |
| `FINANCIAL_WRITES_ENABLED` | Explicit opt-in, defaults to `false` |
| `ACCESS_CONFIRMATION_AUD` | Distinct browser-only Access application AUD |
| `FINANCIAL_ORIGIN` | Exact HTTPS origin of existing financial Worker |
| `FINANCIAL_PORTFOLIO_ID` | Explicit authorized real portfolio identity |
| `FINANCIAL_OWNER_ID` | Stable internal journal owner, defaults to existing `owner:financial-read` |
| `FINANCIAL_OPENING_ID`, `FINANCIAL_OPENING_REVISION` | Explicit validated immutable V1 opening anchor |

These are implemented configuration names, not commands or changes already applied.
The current read entrypoint stays selected until publication/deployment is authorized.
All existing V1 read routes and V1.1 projected reads are mounted by the optional
composition; administrative REST, ingestion and OAuth/token endpoints stay absent.

Before hosted activation: approve publication/configuration, validate the real opening
anchor and stable portfolio identity, apply pending 0005/0006 only after authorized
review/backup, configure the path-specific protection, then deploy on the **same**
financial Worker initially with writes disabled. Verify browser and MCP audience
separation before explicitly enabling writes. In ChatGPT, refresh tools on the
existing connector and review action permissions; no reinstall or OAuth-duration
change is inherently required. Test one expressly authorized operation and negative
scheduled-task approval before claiming operational acceptance.

Rollback: set `FINANCIAL_WRITES_ENABLED=false`. Returning to the older read entrypoint
also requires removing the V1.1-only configuration keys because its environment
parser is strict; retain the approved V1 configuration. Never
delete journal events, consumed approvals or original V1 records to roll back code.

## Sources and limits

- [Cloudflare application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/): specific paths override, do not inherit parent policies.
- [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/): origin does not distinguish OAuth from browser login for the same application.
- [OpenAI MCP tools](https://developers.openai.com/plugins/build/mcp-server): tool annotations are client-facing guidance, not server authorization.

Installed MCP SDK 1.32.2, stateless JSON transport unchanged. No assumption that
ChatGPT elicitation or remembered confirmations prove human approval. Real hosted
browser/ChatGPT interoperability, path policy configuration and production migration
are **to test**, not established by the local synthetic checks.
