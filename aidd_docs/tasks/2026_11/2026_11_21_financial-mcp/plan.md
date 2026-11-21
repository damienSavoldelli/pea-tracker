---
status: implemented
scope: local-only
---

# Financial MCP — owner-confirmed journal operations

Authority: owner requests of 21 November: implement locally using existing finance,
explicit business write permissions and a trusted, exact-intent, single-use approval.
No commit, remote change or production activation is authorized.

1. Separate `portfolio:write` (financial operations), `portfolio:approve` (browser
   consent) and existing read/admin/ingestion permissions. Preserve V1 composition.
2. Prepare an immutable five-minute proposal, previewed by `TransactionService`,
   scoped to owner, real portfolio, opening anchor, journal version and unique key.
3. Persist preparation/approval/consumption through Memory/D1 ports; add a minimal
   Access-authenticated browser form, then MCP confirmation through existing append.
4. Validate the official SDK → Worker composition → browser approval → native local
   D1 path, negative authorization, replay/concurrency and affected V1 reads.
5. Document local evidence and exact configuration requirements. No hosted proof
   or existing OAuth/session change is implied by local validation.

Details and activation boundary: [contract](contract.md).
Checks and current completion state: [evidence](evidence.md).

All five local steps completed. Hosted activation is excluded from this plan and
remains unapproved/unverified.
