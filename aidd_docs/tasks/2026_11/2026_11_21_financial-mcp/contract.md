# Financial MCP contract — V1.1

Current state, 21 November: journal/approval migrations and the separate operational
reference are deployed; financial writes are enabled under explicit owner authority.
[Current production evidence](../2026_11_21_operational-start/production.md) supersedes
the [earlier staged deployment](production-2026-11-21.md). The owner reports current
reads and tool discovery in ChatGPT; this running Codex catalogue remained cached.
No real operation has completed the browser approval/write/replay journey in production.

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
- Historical V1 read contracts and the preceding `access-read.ts` composition remain
  unchanged. The active financial Worker uses `access-financial.ts`; selecting it
  does not authorize a new deployment or a financial record without owner approval.

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
  events. Deployed additive migration 0006 stores proposals and approval
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

## Configuration and authorization boundary

The existing Managed OAuth application and its one-month grant/session settings
were not changed by financial activation. Financial permission comes from the Worker's explicit owner policy,
not fabricated OAuth scopes or a Cloudflare administrator role.

The owner configured **one path-specific browser Access protection** on the same
financial Worker hostname. Preserve these settings; do not recreate the application:

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
proposals. This reuses the existing financial Worker and database, with no new
identity provider. Full authenticated browser approval is still an acceptance limit.

Active entrypoint `src/entrypoints/access-financial.ts` accepts the existing D1,
issuer/read audience/owner/read enable flags/calendar configuration, plus:

| Setting | Meaning |
| --- | --- |
| `FINANCIAL_WRITES_ENABLED` | Explicit opt-in, defaults to `false` |
| `ACCESS_CONFIRMATION_AUD` | Distinct browser-only Access application AUD |
| `FINANCIAL_ORIGIN` | Exact HTTPS origin of existing financial Worker |
| `FINANCIAL_PORTFOLIO_ID` | Explicit authorized real portfolio identity |
| `FINANCIAL_OWNER_ID` | Stable internal journal owner, defaults to existing `owner:financial-read` |
| `FINANCIAL_OPENING_ID`, `FINANCIAL_OPENING_REVISION` | Explicit validated immutable V1 opening anchor |
| `FINANCIAL_OPERATIONAL_OPENING_ID` | Optional separate current-state reference; does not change the historical V1 anchor |

These are configuration names only; actual values and configuration paths stay private.
All existing V1 read routes and V1.1 projected reads are mounted by the active
composition; administrative REST, ingestion and OAuth/token endpoints stay absent.

The staged activation and operational-reference switch were individually authorized
and completed on the same Worker. No migration or bootstrap should be replayed from
this contract. In ChatGPT, refresh the existing connector tools; a new conversation
may be necessary if its catalogue is cached. No OAuth-duration change or reinstall
is inherently needed. Real owner-approved recording, unique receipt/replay and
subsequent projected reads still need operational acceptance; never insert a
fictitious transaction into the real PEA to obtain that evidence.

Rollback: set `FINANCIAL_WRITES_ENABLED=false`. Returning to the older read entrypoint
also requires removing the V1.1-only configuration keys because its environment
parser is strict; retain the approved V1 configuration. Never
delete journal events, consumed approvals or original V1 records to roll back code.

## Sources and limits

- [Cloudflare application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/): specific paths override, do not inherit parent policies.
- [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/): origin does not distinguish OAuth from browser login for the same application.
- [OpenAI MCP tools](https://developers.openai.com/plugins/build/mcp-server): tool annotations are client-facing guidance, not server authorization.

Installed MCP SDK 1.32.2, stateless JSON transport unchanged. No assumption that
ChatGPT elicitation or remembered confirmations prove human approval. Migrations,
configuration/import comparisons, historical MCP reads and anonymous denial have
production evidence; authenticated human approval and actual financial write/replay
interoperability remain **to validate**, not established by local synthetic checks.

## Post-incident audience policy — deployed, 24 November 2026

The browser diagnostic succeeded in the owner's live browser with the separate
approval hostname: strict browser-only audience and owner identity were accepted,
without D1 or financial permission. This qualifies that authentication check, not
the real approval/write journey. See the [incident record](authentication-incident-2026-11-24.md).

`MCP_KNOWN_AUDIENCE_PAIR_ENABLED` is a new opt-in server setting, default false.
When enabled, MCP accepts its single configured read AUD or the exact pair of
configured read/browser AUDs, in either order. Unknown, missing and duplicate AUDs
are rejected. Signature, issuer, time and exact owner validation remain mandatory.
This admission policy grants no permission from JWT audience membership alone:
the server assigns `portfolio:write` only when financial writes are explicitly enabled.
MCP never receives `portfolio:approve`; its assertion remains invalid on browser
GET and POST, even when it contains the browser AUD.

Browser approval remains strict: browser AUD alone, owner identity, no bearer or
service credentials, protected same-origin form, CSRF, expiry and one-use approval.
Confirmation still consumes that independent approval and uses unchanged financial
intent fingerprints, journal guards, concurrency handling and idempotent receipts.

The existing `MCP_READ_ONLY_MIXED_AUDIENCE_ENABLED` recovery mode retains its original
write-disabled guard. It must be false before enabling financial writes; the new
MCP known-pair setting controls the normal financial channel separately. Diagnostic
GETs are disabled when writes are enabled and should be explicitly switched off.
No REST/MCP input parameter, new tool, operation type or migration is introduced.

After explicit owner approval, commit `caeb627` was deployed as Worker
`3cdf9216-04ee-462e-bbda-6d8697172ef0`: normal known-pair MCP admission and financial
writes enabled; recovery mode and browser diagnostics disabled. One connector ping
succeeded after activation. No real operation was prepared, approved or confirmed.
The 47 targeted local checks include the official SDK/native D1 journey with mixed
MCP and browser-only approval, exact replay, old single-AUD compatibility and refusal
of mixed assertions on browser GET/POST. They do not establish production financial
approval or authorize preparing/confirming a real operation.
