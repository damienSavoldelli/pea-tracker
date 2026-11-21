---
status: implemented
scope: local-only
---

# Start the existing real PEA from a newly verified broker declaration

The separately authorized production switch and later write reactivation completed:
see [current evidence and acceptance limits](production.md). This plan preserves the
local implementation scope and the controlled sequence, not a new remote authorization.

Owner decision: do not reconstruct the intervening transactions. Use the newly
supplied official broker export and separately confirmed cash, then record only
new operations. This authorizes local implementation/validation and one local
commit, not production writes, migrations, deployment, push or merge.

## Implemented minimal solution

Historical V1 opening corrections preserve the first effective timestamp. They
cannot express a new operational date; selecting their latest revision would also
change historical default V1 reads. Neither behavior was changed.

One immutable `portfolio_operational_openings` record attaches a new declaration
to the existing portfolio UUID, owner and historical opening anchor. It stores the
complete new opening, separate cash provenance and an explicit restart reason.
No new instrument/portfolio registry, simulated portfolio, reconstructed event or
generic snapshot framework. Historical opening/position/quotation tables unchanged.

`D1OperationalOpeningRepository` checks the pinned portfolio/owner/reference/old
anchor. The journal and exact cost engine read this opening only when the new
optional `FINANCIAL_OPERATIONAL_OPENING_ID` is configured. Historical `PortfolioService.get`
continues to use its original repository. Projected reads obtain their opening from
the operational repository and expose `operational_reference` with cash provenance,
old anchor and `prior_performance_available=false`. V1 responses remain unchanged.

Buys/sells, fees, solvency, cost/PRU, reversals, journal CAS/receipts and MCP approval
continue through the existing services. No new initialization/reset tool is exposed
through MCP or HTTP. Actual initialization requires separately authorized D1
administration. The reference is immutable even before the first transaction.

## Date and financial interpretation

The owner identifies an export produced on a non-trading day as the state after
the previous completed session. The private reference uses **end of that session's
calendar day in Europe/Paris**, not export-generation time or an inferred execution
timestamp. This is an explicit cutoff convention, not evidence of an exact market
tick. Actual chosen timestamp and all financial values live only in ignored state.

Positions/PRU retain broker-export provenance with a source SHA-256; cash retains
its independently supplied evidence. Declared PRU fee history stays unknown. No
market-value opening reference is invented from PRU or from a displayed broker
total. Pre-reference performance remains unavailable, and the existing total-return
limitations remain. Subsequent journal operations must be strictly after the new
cutoff; no intervening transactions are fabricated.

## Migration 0007 — bounded schema change, not a reset

`0007_operational_opening.sql` adds the immutable reference and replaces the journal
parent's historical-only opening FKs with equivalent anchor-validation triggers
supporting either kind of immutable opening. This is **not purely additive**: it
copies all empty/version-zero journal rows through a replacement parent table and
reinstalls the existing journal/event concurrency guards. Child table names and
data remain unchanged. Native local D1 validates the resulting write path.

The migration first aborts if **any transaction event exists**, before changing the
schema. The one-time empty-journal requirement is deliberate; it does not authorize
deleting events to make the migration pass. Each reference insert additionally
refuses an already initialized journal for its portfolio, validates the original
anchor/date and existing EUR instruments, and rejects later replacement/deletion.
Once a reference exists, stale old-anchor writes are refused even if an old Worker
version is still running. No immutable historical V1 row is updated or deleted.

## Local source preparation and evidence

`scripts/prepare-operational-opening.py` uses stdlib only, supports Strict and
Transitional OOXML, maps ISIN to an existing verified catalogue and preserves
decimal text with Decimal. It emits private JSON and a single INSERT SQL file;
it performs no network, broker, database or credential operation. On identical
reruns it retains the reference ID/recording time; changed existing output is
refused rather than silently replaced. Repeated SQL import is rejected by the
unique immutable reference, never duplicated.

The actual supplied export was read locally: 20 positions, the five owner-specified
quantity/PRU pairs matched exactly, and the other declarations came from that same
file. Independently confirmed cash was used exactly. Real holdings, values, source
filename/account details, IDs and private import SQL are excluded from Git.

**11 targeted tests and typecheck passed**:

- Seven operational checks: exact synthetic 20-position reads and separate cash
  provenance, future exact trade/cost and replay, immutable/isolated reference and
  stale-anchor refusal, nonempty-journal refusal, protected MCP service plus actual
  Worker historical/current REST reads, migration-precondition rollback, and an
  explicit private 20-position domain/PRU/cash check without private diagnostics.
- Four existing native D1 transaction cases rerun because migration 0007 changes
  its parent/anchor triggers: atomic journal behavior, isolation/conflicts, failed
  anchor rollback and persisted original-outcome replay after reopening.
- The extended V1.1 OpenAPI schema validates the new optional metadata. Historical
  V1 OpenAPI remains unchanged. No full TypeScript/Python suite or remote operation.

```sh
PEA_PRIVATE_OPERATIONAL_REFERENCE="<approved-private-reference-json>" \
  node node_modules/vitest/vitest.mjs run \
  tests/operational-opening.test.ts tests/transactions.d1.test.ts --exclude '**/.wrangler/**'
node node_modules/typescript/bin/tsc --noEmit
```

Normal synthetic tests skip the private check unless explicitly given an ignored
local reference path. The private Excel/JSON is never required by CI or committed.

## Controlled production sequence — executed under separate authorization

Operational source, reference JSON, reviewed single-row import SQL, deployment
configurations, secrets files, comparison logs and Time Travel metadata remain
private. No actual paths or financial values belong in this plan. The deployment
record is authoritative for completed stages and the current write flag.

1. Record the Worker version/Time Travel bookmark and deploy the temporary
   disabled-write configuration without selecting the new reference. Existing
   reads therefore do not depend on schema 0007 before it is applied.
2. Verify the old anchor, journal/event counts zero and only migration 0007 pending.
   Apply only that migration. Stop on mismatch/error; do not delete events or restore
   the shared D1 automatically to make a prerequisite pass.
3. Import the approved private reference. DB guards reject a nonempty journal,
   mismatched old anchor, unknown instrument or duplicate/replacement reference.
4. Deploy the selected operational reference with writes disabled. Compare all
   declarations/cash privately and confirm unchanged V1 plus journal version zero.
5. Only after separate owner authority, enable financial writes on that reference.
   Every recording still requires its own owner instruction and browser approval.

Generic command forms (placeholders only; not runnable deployment instructions):

```sh
npx wrangler deploy --config "<approved-private-deployment-config>" \
  --secrets-file "<existing-private-secrets-file>"
npx wrangler d1 migrations list INSTRUMENTS_DB --remote \
  --config "<approved-private-deployment-config>"
npx wrangler d1 migrations apply INSTRUMENTS_DB --remote \
  --config "<approved-private-deployment-config>"
npx wrangler d1 execute INSTRUMENTS_DB --remote \
  --config "<approved-private-deployment-config>" --file "<reviewed-private-reference-sql>"
```

On failure stop and keep writes disabled. Never reset journal history, delete the
reference or restore D1 without new authority. An old-anchor recording is refused
once the operational reference exists. A code rollback must preserve this boundary;
old strict parsers also require removal of unsupported newer environment keys.
