---
status: implemented
---

# V2.0-A — Portfolio registry and independent openings

## Authority and evidence boundary

The owner's inline V2.0-A plan authorizes local implementation, new additive
migrations, synthetic tests and relevant AIDD updates only. The preceding read-only
multi-portfolio spike concluded conditional GO: reuse the portfolio-scoped journal
and shared market data; separate global V1 openings from future portfolio openings.
That spike was delivered in conversation, not persisted as a repository artifact.
The four supplied reference documents were read at their supplied external locations;
their contents are not duplicated here. No production, Git or deployment authority
is inferred from the V1.1 release or those historical references.

## Implemented decisions

- One owner can register N portfolios, including multiple of each `real`/`simulated`
  kind. No user table, fixed owner, portfolio-count limit, sharing or hierarchy.
- `portfolios` stores UUID, owner subject, immutable name/kind/opening reference,
  explicit active/archived status, metadata version and timestamps. Owner/UUID is
  indexed for bounded keyset listing. Names need not be unique.
- New independent openings use the existing exact-decimal `OpeningState` format,
  stored in the same row as the registry metadata. This deliberately avoids a
  cyclic FK or a half-created portfolio/opening pair. The enclosing row binds the
  snapshot to its owner and kind; no financial payload is copied between portfolios.
- Opening UUID and revision 1 are immutable. Known nonnegative EUR cash is required;
  empty positions and explicit zero cash are valid. Nonempty declared holdings,
  PRU and provenance are supported. Unknown cash is rejected, never defaulted to zero.
  No transactions or prior returns are manufactured. Instruments must exist and be
  EUR-compatible; deletion of referenced independent-opening instruments is restricted.
- Metadata version is separate from journal version and opening revision. The only
  lifecycle transition implemented is active → archived with expected-version CAS;
  no deletion, reopening, renaming or opening correction API is introduced.
- Internal `PortfolioRegistryService` requires trusted `portfolio:admin` for create
  and archive, and owner-scoped `portfolio:read` for retrieval/listing/opening reads.
  It is not mounted in any Worker, REST route or MCP tool. Archive is registry
  metadata only; V1.1 services do not consult it and are not changed by this slice.
- New domain, port, application service and D1 adapter are isolated additions.
  Existing journal, cost, gain, performance, quote and authorization engines remain
  unchanged. A separate Memory implementation is unnecessary for this slice: tests
  exercise the real D1 adapter and existing domain functions.

## Migration 0008 and historical adoption

`0008_portfolio_registry.sql` creates the registry, index and integrity triggers.
It does not modify migrations 0001–0007 or rewrite existing financial tables,
events, receipts, approvals, identities or canonical inputs.

Adoption is deterministic and uses no hard-coded production UUID or owner:

1. Every existing operational reference contributes its stored portfolio/owner and
   operational opening. This works before the first journal event.
2. Journals without an operational reference retain their exact historical anchor.
3. Existing journal identity must match. Invalid/unresolvable anchors abort the
   migration instead of silently skipping a journal or resetting anything.

Legacy rows use the neutral display name `Historical portfolio`. Their snapshots
remain in the original immutable tables, resolved by explicit ID/revision/owner;
they are not copied into independent opening JSON. A database with only a V1
opening and no stored portfolio UUID cannot be adopted automatically: no UUID or
owner is invented. Any such later adoption needs an explicitly evidenced mapping.

The new registry permits only one portfolio per source/opening-ID/revision tuple;
an inconsistent legacy database that reuses that same anchor across journals is
rejected rather than silently interpreted as independent portfolios.

## Local verification — 21 November 2026

Phases complete: domain/port/service/adapter; additive migration; migration and
compatibility checks; documentation and memory updates.

Commands, using already installed dependencies:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/portfolio-registry.test.ts tests/portfolio-registry-migration.test.ts tests/d1-migrations.test.ts --exclude '**/.wrangler/**'
node node_modules/vitest/vitest.mjs run tests/financial-mcp.test.ts --testNamePattern 'official MCP SDK|requires a separately authorized approver' --exclude '**/.wrangler/**'
git diff --check
```

- 19 targeted registry/migration tests passed: 11 registry cases, 3 V1.1 upgrade
  scenarios and 5 existing official Wrangler local migration cases.
- 2 existing financial compatibility/security cases passed; 19 unrelated cases in
  that file were filtered out. The official MCP SDK path still exposes exactly 18
  tools, no portfolio administration, and preserves historical REST/MCP reads and
  browser-gated financial write/replay. Simulated MCP preparation remains refused.
- Typecheck passed. No full suite, dependency installation or remote operation.
- Registry cases cover several real/simulated portfolios, owner separation,
  pagination, stable unique references, empty/nonempty openings, exact canonical
  decimals, bad currency/cash/references, immutable bindings and archive CAS.
- Upgrade scenarios use native local D1 before/after official migration application:
  operational opening with populated journal; operational opening without events;
  historical-anchor journal with events. Synthetic V1 and operational holdings,
  declared PRU and cash differ. All existing financial table rows compare equal
  before/after, including event IDs/sequences, canonical receipts and proposal
  digests. Prior receipt replay, historical reads and approval requirements survive.
  Repeated migration application preserves both financial tables and registry rows.
- The first sandbox run was blocked by Wrangler log/loopback permissions. After
  explicit runtime permission, two test-fixture mistakes were corrected (strict
  financial-service binding and canonical decimal expectation); final runs passed.

## Rollback and remaining gates

No remote migration or deployment has been performed. Before any future production
application, separately approve the target and verify private recovery evidence and
the actual stored anchor/owner mapping. This local result is not a production gate.

Rollback should initially keep V1.1 code and leave the additive registry unused.
Do not reapply 0007, erase journals, remove migration tracking or assume an automatic
down migration. Once the registry contains new portfolio openings, dropping it would
destroy those references. An independently rehearsed recovery/forward repair needs
separate authorization; native D1 recovery would also rewind unrelated financial data.

V2.0-B remains unimplemented: server portfolio resolution, authorized listing/reads
through REST/MCP and status enforcement. Existing journal SQL accepts only legacy
historical/operational anchors: new independent openings are usable by domain
initialization but are intentionally not wired to financial appends. V2.0-C must
address journal anchor guards and approval routing without changing old receipts or
digests. Independent-opening performance references are not created in V2.0-A.
Keep current real-MCP protections; no simulated writes or paper-trading engine.

V2.0-D remains a separate feasibility study and delivery for hybrid A+B market
providers, adaptive collection and controlled fallback. No provider research or
collector changes were made here.

Local acceptance: **GO** for V2.0-A's registry/opening scope. Production multi-portfolio
use and subsequent slices remain unvalidated and require their own authorization.
