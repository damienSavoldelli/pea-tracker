# Local synthetic quotation contract

Authority: [implementation plan](plan.md), [OpenAPI](../../../api/openapi.json),
[approved PRD](../2026_11_08-financial-backend-prd.md). One shared QuotationService
implements the rules for both adapters; repository ports remain transport-independent.

## Provider declarations and exact values

Each observation is selected by instrument UUID, provider, `price_kind`
(`last_trade` or `session_close`) and `adjustment: unadjusted`. There is no automatic
feed choice or corporate-action adjustment. Successful observations contain:

- Positive `price`, currency and quotation unit matching instrument metadata.
- `market_timestamp` (provider's observation time), `fetched_at` (retrieval time),
  provider-declared `session_date` and optional known `provider_delay_seconds`.
- Provenance `{source, reference}`. Record fields add immutable UUID, server
  `recorded_at`, exact lexical `source_price` and `value_origin: provider_declared`.

Prices are decimal strings/SQL TEXT with at most 30 significant digits and 12
fractional digits. Canonical normalization removes representational zeros without
rounding or numeric coercion; source_price retains the original declaration's scale.
No converted, adjusted or calculated financial price is returned. Currency-unit and
hundredth-currency-unit remain distinct; no implicit division by 100 or FX occurs.

All timestamps are UTC and normalized for ordering. Require market time <= fetch
time <= record time. A successful session date is a valid calendar date supplied
by the source; it is not derived by guessing the exchange time zone. Provider delay
is an explicit integer 0..86400 seconds or null (unknown), not inferred from an
illiquid last-trade time. Provenance/provider strings are bounded; arbitrary raw
provider error text is never stored as the public error code.

An unavailable observation has explicit null quote fields and a bounded reason:
provider_unavailable, rate_limited or invalid_provider_data. It cannot supply a fake
price, currency or market timestamp. A known instrument with no observation returns
`availability: missing`, quote null and null ages; failure-only history returns
unavailable. Failure after success retains the quote and successful-fetch time,
while last_attempt exposes the failed retrieval separately. Unknown instrument is 404.

## Freshness policy v1

Freshness is calculated metadata, separate from the immutable provider declaration.
It includes collection age, market age, declared provider delay, delivery label,
reason and policy version. `realtime_guaranteed` is always false in this slice.

| Trusted context | Result |
| --- | --- |
| No usable quote | unavailable; no fabricated zero age or price |
| Clock inconsistent with stored fetch/market time | unknown, clock_inconsistent; no clamping to a fresh age |
| Calendar/expected session unknown | unknown, market_calendar_unknown |
| Expected session missing | stale, expected_session_missing, even if an old close was just fetched |
| Market closed and observation belongs to expected completed session | last_completed_session; preserve its declared trade/close kind, never call it a realtime price |
| Market coverage with matching session and collection age <=2700 s | within_target |
| Collection age >2700 s through 3600 s | warning |
| Collection age >3600 s | stale |

Delivery is independently delayed (known positive delay), no_delay_declared (zero),
or unknown. An old trade alone does not diagnose collector failure. quote.fetched_at
describes that declaration; last_successful_fetch_at describes the newest successful
retrieval for the selector. A later retrieval of an older market observation never
replaces a newer market observation. Failures cannot advance successful freshness.

The calendar context is injected server-side and returned as market_context.
HTTP callers cannot override it. Default composition reports unknown; exchange
calendars/holidays/DST and live providers are not implemented or inferred here.

## REST and authorization

| Operation | Capability | Behavior |
| --- | --- | --- |
| POST /api/v1/quotation-batches | quotes:ingest plus exact subject/provider/instrument grant | Atomic immutable batch, <=50 observations, <=128 KiB; 201 or original replay |
| GET /api/v1/quotation-status | quotes:read | Explicit full selector; latest usable quote, last attempt, successful fetch, freshness/context |
| GET /api/v1/quotations | quotes:read | Successful observations in an inclusive market-time window <=366 days; default limit 50, max 100 |

POST requires Idempotency-Key. Full-body validation precedes storage; exact
subject/operation/key/canonical-v1 request replays the immutable original outcome.
Changed input is 409. Source precision/provenance is part of the declaration, so
changing it is not treated as an identical payload. Reordering a batch is canonicalized.
Unknown/missing/extra fields, duplicate batch identities, unsupported units,
nonpositive prices, excess precision and invalid/future clocks are rejected.

Observation identity is selector + fetched_at. Exact duplicates across keys reuse
original IDs; a different declaration for the same retrieval conflicts (409).
Later retrievals remain separate immutable declarations, including provider changes
to the same market timestamp. No old row is overwritten. History orders by market
timestamp, fetch timestamp, then UUID. Cursor binds normalized selector/window and
continuation tuple; concurrent backfills do not form a frozen multi-page snapshot.

Authentication and capability checks precede storage. An administrative or MCP read
grant never implies ingestion. Ingestion defaults to deny without configured grants;
it does not require access to holdings. Only explicit local trusted composition
mounts these routes and the read-only MCP tools `get_quotation_status` and
`list_quotations`. There is no MCP ingestion tool. Access/JWT mappings, deployed
entrypoints, health and ping remain unchanged. HTTP errors reuse safe problem+json,
no-store/nosniff, Host/Origin and bounded body/query conventions; no payload echo.

## Persistence and local operation

Migration 0004 adds indexed immutable quotation observations and original batch
outcomes, with instrument FK and decimal TEXT constraints. Native D1 batch commits
all observations and receipt together. Conflicting declarations, failed FK or failed
receipt insertion roll back the entire batch, without reserving a failed key.
SQL guards make replay skips safe for dependent writes. UPDATE/DELETE is rejected;
no automatic deletion/receipt TTL or remote database is introduced. Memory provides
equivalent isolated application behavior; tests use the native local D1 binding.

After applying the four migrations through the existing local-only fixture, the
existing loopback launcher accepts `--quotations true`. Seed synthetic catalog
records using the admin fixture first; then use separate reader/collector runs:

```sh
node scripts/dev-instruments-d1.mjs --principal reader --port 8788 --quotations true
node scripts/dev-instruments-d1.mjs --principal collector --port 8789 --quotations true
```

Only the synthetic provider is allowed; the collector gets a bounded startup
allowlist of the first 100 existing catalog IDs. It cannot read quotations or
portfolio positions. No request header selects the principal. The fixed fixture
binds loopback with Host/Origin guards; never publish, tunnel or use real data with
it. Runtime calendar remains unknown. Source fetching/automation comes later.
