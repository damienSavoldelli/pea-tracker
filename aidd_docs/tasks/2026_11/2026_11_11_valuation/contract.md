# Current valuation — synthetic local contract

[Owner decisions / plan](plan.md). Read-only derived projection, calculation version 1.

GET /api/v1/portfolio/valuation and MCP get_portfolio_valuation require both
portfolio:read and quotes:read. Query/input requires provider, price_kind
(last_trade/session_close) and adjustment: unadjusted. No fallback provider/kind.
Optional revision selects an immutable opening-state revision, not a historical
valuation as_of. Missing opening state returns 404; empty initialized state is valid.

Read the opening state once and retain ID/revision/effective_at/provenance and each
declared quantity/PRU/currency. Evaluate all selected quotation statuses at one UTC
evaluation time. Each line retains full quote identity, source price, unit, currency,
provenance, market/fetch/record timestamps, last attempt and calculated freshness.
Responses explicitly identify opening-state-only holdings; no trades are projected.

Each supported EUR line returns exact market value and half-even display value
(2 decimal places). Divide by 100 only for hundredth_currency_unit. No monetary
JS Number/SQLite REAL, rounding of intermediate values or fee/cost reconstruction.
No PRU arithmetic, gain/performance calculation or implicit FX.

Missing/failure-only quotes, non-EUR position or quote currencies, incompatible
currencies, or inconsistent future clocks return null amounts with reasons.
Delayed/stale/unknown quotes remain usable estimates with explicit warnings;
last completed sessions remain labelled. Quotes predating opening state are also
labelled. All results are estimates, realtime_guaranteed false. Clock inconsistency
does not become an ordinary stale estimate.

Coverage counts valued/excluded positions with per-line reasons. securities_subtotal
contains only valued EUR lines (null if none of a nonempty portfolio can be valued);
securities_total exists only with complete position coverage. portfolio_total exists
only with complete position coverage AND known EUR cash. known_assets_subtotal
includes valued securities plus known cash; unknown cash is never zero-filled.
Empty initialized holdings have a known zero securities total. Monetary fields use
{exact, display, currency: EUR}; output metadata states scale, rounding, calculation
version and temporal consistency. Display is not re-used as a calculation input.

Existing Memory/D1 persistence is read through shared services. A response pins one
immutable opening revision and reports the exact quotation IDs selected. Reads across
instruments are not one database transaction: no atomic whole-portfolio market
snapshot, persisted snapshot, historical valuation or remote durability is claimed.
An evaluation timestamp fixes freshness, not the set of concurrently arriving rows.

Only explicit trusted injection mounts the endpoint/tool; deployed compositions
remain unchanged. Existing JSON/Origin/no-store/structured-error rules apply;
unknown/duplicate query fields and mutations are rejected. No ingestion/admin grant
is inferred. Tests bind loopback with synthetic principals and native local D1 only.

## Local manual use

The existing ID-free local D1 fixture enables valuation only when both source
capabilities are explicitly enabled. After applying the four existing migrations
and seeding synthetic instruments/opening state/quotes with the separate permitted
fixtures, run:

```sh
node scripts/dev-instruments-d1.mjs --principal reader --port 8788 --portfolio true --quotations true
curl 'http://127.0.0.1:8788/api/v1/portfolio/valuation?provider=synthetic&price_kind=last_trade&adjustment=unadjusted'
```

The same loopback app exposes get_portfolio_valuation. Fixed startup principals,
Host/Origin guards and shutdown/persistence conventions are inherited. Never publish
or tunnel this fixture. Its real calendar is unknown; valuation reports that warning.
The existing MCP baseline also requires instruments:read; no OAuth/Access mappings
are expanded. New reads do not mutate state, so no new idempotency/CAS mechanism is
needed. Existing source write/concurrency/rollback tests remain applicable.
