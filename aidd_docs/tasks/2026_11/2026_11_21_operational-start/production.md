# V1.1 operational-reference deployment — 21 November 2026

## Current production state

Worker `pea-tracker-financial-read`, version
**`20f6a0fb-25cb-4d51-94bf-d7cb22ea5ec1`**, has `FINANCIAL_WRITES_ENABLED=true`.
The same real portfolio, owner, D1 and independent browser-approval audience are
preserved. Its operational reference is the verified Bourse Direct state after the
20 November session, separate from the immutable historical V1 opening. No omitted
transactions were reconstructed. Actual holdings, PRU, cash, source/account identifiers,
configuration paths and operational artifacts remain private and outside this record.

## Completed stages and evidence

| Stage | Worker version | Recorded evidence |
| --- | --- | --- |
| Temporary write suspension | `cdbbe750-d174-4199-85cf-200830b5ab3f` | No new reference selected; reads use the existing schema before 0007 |
| Reference switch, writes disabled | `313be6b7-61bd-4e5d-9b5d-22cc1334543f` | Published reference/portfolio/D1 bindings compared with approved configuration |
| Separately authorized reactivation | `20f6a0fb-25cb-4d51-94bf-d7cb22ea5ec1` | Published write flag true; all other bindings unchanged |

- Source implementation commit: `cb733a12d229f458470f4e4a79f548f999783bf1`.
- Targeted preflight confirmed the old anchor, empty journal/events, available Time
  Travel bookmark and only 0007 pending. Only that migration was applied successfully.
- The approved private single-row reference import succeeded. D1 payload comparison
  exactly matched all 20 quantities/declared PRU, independently evidenced cash and
  provenance. Historical V1 opening payload/rows remained identical; journal/events
  remained empty. No financial transaction or fictitious acceptance event was created.
- Authenticated MCP ping/historical opening read succeeded; the historical response
  matched its pre-switch and pre-reactivation baselines. Anonymous MCP access was
  HTTP 401; the browser approval path redirected to authentication (HTTP 302).
- The owner reports historical/current reads and financial tool exposure in ChatGPT.
  This running Codex session retained its old catalogue, so no independent current
  read/authenticated tools-list invocation is claimed from that session.
- Canonical private configuration was kept aligned with the deployed reference and
  write flag. Secrets, Access/OAuth, ingestion and scheduler were not changed by the
  switch/reactivation. No errors or automatic restoration occurred.

## Not yet validated end to end

No real operation has completed owner browser approval → MCP confirmation → unique
journal event/receipt → replay and projected read in production. Local synthetic
coverage establishes those service/adapter rules, not hosted human acceptance.
No proposal or approval was created to manufacture that evidence. Any future real
recording needs its own explicit owner instruction and independent server approval.

Approval consumption precedes append; an ambiguous failure with no receipt requires
journal reconciliation, not automatic rearming or blind duplication. Calendar,
freshness, closing-monitor proof, advanced alerts and global return limitations are
listed once in the [roadmap delivery matrix](../../../roadmap.md).

## Authorization and delivery boundary

These facts reuse existing operational evidence; this documentary closure performs
no new remote check, deployment, migration, transaction, push, merge, tag or release.
Private comparisons, logs and recovery metadata are retained outside Git. No D1
restore or deletion is authorized by this record. A rollback must keep writes
safely disabled and preserve both references and immutable journal history.

V1.1 publication can cover the financial foundation with these explicit reservations,
subject to owner approval of scope/version. It must not claim the whole original
roadmap or real-write acceptance is complete. No v1.1.0 publication is asserted here.
