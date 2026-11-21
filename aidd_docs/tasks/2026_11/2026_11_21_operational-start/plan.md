---
status: implemented
scope: local-only
---

# Start the existing real PEA from a newly verified broker declaration

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
PEA_PRIVATE_OPERATIONAL_REFERENCE=.wrangler/portfolio-reference-2026-11-21/reference.private.json \
  node node_modules/vitest/vitest.mjs run \
  tests/operational-opening.test.ts tests/transactions.d1.test.ts --exclude '**/.wrangler/**'
node node_modules/typescript/bin/tsc --noEmit
```

Normal synthetic tests skip the private check unless explicitly given an ignored
local reference path. The private Excel/JSON is never required by CI or committed.

## Prepared production sequence — NOT EXECUTED

Private outputs:

- `.wrangler/portfolio-reference-2026-11-21/reference.private.json`
- `.wrangler/portfolio-reference-2026-11-21/import.private.sql`
- `.wrangler/live-readiness/wrangler.access-read.v1.1.reference-paused.private.jsonc`
- `.wrangler/live-readiness/wrangler.access-read.v1.1.reference-ready.private.jsonc`

Both prepared deployment configs have writes disabled. The paused copy has no new
reference ID, so the old reference/reads keep working before migration. The ready
copy contains the new ID while preserving the real portfolio, owner, old historical
anchor, D1, Access, OAuth, calendar and other Worker settings. The previously active
local configuration remains untouched.

After specific authorization:

1. Record the current Worker version and D1 Time Travel bookmark. Deploy the paused
   copy to temporarily disable financial writes while retaining old reads. Verify
   journal/event counts remain zero and the expected historical anchor is present.
2. List migrations: **only 0007** should be pending. Apply it; stop on mismatch or
   failure, without retries or automatic restore. No quote collection is triggered.
3. Import the reviewed private single-row SQL. Its DB guard rejects a nonempty
   journal or stale/missing original anchor. No journal events are inserted.
4. Deploy the ready copy, still writes disabled. Verify the historical V1 response
   remains identical; current reads match all 20 private declarations/cash/PRU and
   disclose the new reference/provenances; journal version remains zero.
5. Only after that check and separate authorization, re-enable writes on the ready
   reference. Refresh ChatGPT tools as needed. Every future recording still requires
   individual owner instruction and the existing browser approval. Never create a
   fictitious real-portfolio transaction for acceptance.

```sh
npx wrangler deploy \
  --config .wrangler/live-readiness/wrangler.access-read.v1.1.reference-paused.private.jsonc \
  --secrets-file .wrangler/live-readiness/access-read.secrets.json

npx wrangler d1 time-travel info INSTRUMENTS_DB \
  --config .wrangler/live-readiness/wrangler.access-read.v1.1.reference-ready.private.jsonc

npx wrangler d1 execute INSTRUMENTS_DB --remote \
  --config .wrangler/live-readiness/wrangler.access-read.v1.1.reference-ready.private.jsonc \
  --command "SELECT COUNT(*) AS events FROM transaction_events"

npx wrangler d1 migrations list INSTRUMENTS_DB --remote \
  --config .wrangler/live-readiness/wrangler.access-read.v1.1.reference-ready.private.jsonc

npx wrangler d1 migrations apply INSTRUMENTS_DB --remote \
  --config .wrangler/live-readiness/wrangler.access-read.v1.1.reference-ready.private.jsonc

npx wrangler d1 execute INSTRUMENTS_DB --remote \
  --config .wrangler/live-readiness/wrangler.access-read.v1.1.reference-ready.private.jsonc \
  --file .wrangler/portfolio-reference-2026-11-21/import.private.sql

npx wrangler deploy \
  --config .wrangler/live-readiness/wrangler.access-read.v1.1.reference-ready.private.jsonc \
  --secrets-file .wrangler/live-readiness/access-read.secrets.json
```

On failure stop and inspect, preserving the disabled-write state. Do not delete the
new reference, reset journal history or restore the shared D1 automatically. Any
code rollback must keep writes disabled: old-anchor recording is intentionally
rejected once the operational reference exists. Publication and operational
acceptance remain unperformed; this commit certifies local preparation only.
