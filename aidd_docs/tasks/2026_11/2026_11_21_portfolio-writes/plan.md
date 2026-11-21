---
status: implemented
---

# V2.0-C — Isolated financial writes and confirmation circuits

## Authority and delivery

The owner's inline C plan authorizes local development/tests for N real/simulated
portfolios: independent browser approval for real operations and explicit MCP
confirmation for simulated operations. No commit, push, deployment, production
event or Access/OAuth change. Base: `681c18e9d6041fa6b562ec9e9bc7d1bb5a070ee3`,
branch `feat/v2.0c-portfolio-writes`.

Reuses [A evidence](../2026_11_21_portfolio-registry/plan.md),
[B evidence](../2026_11_21_portfolio-reads/plan.md), the conversational spike,
reference documents already consulted in this session and the
[V1.1 confirmation contract](../2026_11_21_financial-mcp/contract.md).
No repeated audit or provider study. All local steps completed: shared resolution,
additive guards, versioned orchestration, MCP/browser integration, tests and memory.

## Architecture and security

- `PortfolioContextService` centralizes B/C ownership, permission, nature, status
  and immutable opening/binding resolution. Read accepts active/archived portfolios;
  write/approval requires active status and the corresponding server permission.
- `PortfolioFinancialService` privately constructs the existing `TransactionService`
  and `FinancialMcpService`. Exact EUR trades, cash, fees, dividends, reversals and
  PRU calculations are reused. No new operation type, user, sharing or trading engine.
- Real operations require an expiring proposal, independent `portfolio:approve`
  browser consent under the existing separate signed audience, single consumption
  and idempotent append. The page displays escaped server-resolved name, UUID and
  real nature; existing CSRF, origin, expiry and CSP protections remain.
- Simulated operations require explicit `portfolio:write` and owner/kind checks,
  preparation and a separate voluntary MCP confirmation. Preparing never changes
  the journal. The approval adapter's new transition accepts only version-2
  simulated records with exact subject/digest and valid lifetime. Here `approved_at`
  records explicit MCP confirmation, not browser approval; consumption remains CAS.
- Both circuits expire after five minutes. Confirmation rechecks owner/permission,
  active status, kind/circuit, opening, digest and expected version. Stale V2
  proposals are refused before consumption. SQL guards close the archive/append
  race for first and subsequent journal events. Archived proposals cannot confirm.

## Versioning and historical compatibility

V1.1 intents have no explicit `version`/`kind` fields. Their accepted schema,
serialized field order, SHA-256 formula and canonical receipt format are retained.
Nothing rewrites stored proposals, summaries, events, receipts or identities.
V2 intents add `version: 2` and server-derived kind; their hash binds subject,
portfolio, kind, normalized operation, opening, expected version, key and lifetime.
V1/V2 instances and real/simulated instances reject each other's proposal formats.

The six historical preparation tools already require a portfolio UUID; they remain
bound to the configured real PEA. `confirm_financial_operation` still accepts only
operation ID/digest and V1 proposals. Browser dispatch uses the stored proposal's
version and portfolio, never client routing hints. The Worker adds active registry
checks to that legacy chain without changing old digest/receipt formats. Eligible
previously issued V1 proposals remain approvable and confirmable after migration.

## MCP contract

| Tool | Input | Effect |
| --- | --- | --- |
| `prepare_real_portfolio_operation` | `portfolio_id`, existing strict transaction `input` | V2 real proposal/browser URL; no journal append |
| `confirm_real_portfolio_operation` | `portfolio_id`, `operation_id`, `digest` | Exact browser-approved real append or original receipt |
| `prepare_simulated_portfolio_operation` | `portfolio_id`, existing strict transaction `input` | V2 simulated proposal; no browser URL/journal append |
| `confirm_simulated_portfolio_operation` | `portfolio_id`, `operation_id`, `digest` | Explicit simulated authorization, exact append/replay |

All require read/write permission; client owner/kind/consent overrides are refused.
Confirmation portfolio UUID must match the stored proposal. No new financial REST
write route, administration MCP tool or OAuth scope. Full catalogue: **26 tools**
(18 legacy, 4 B reads, 4 C operations). The existing write-disable flag hides all
write tools and refuses browser approval. Ingestion/diagnostic Workers are unchanged.

## Migration and recovery

`0009_portfolio_writes.sql` replaces only the journal anchor trigger and adds an
event-append guard. Registered portfolios must match owner/kind/opening/revision
and active status. Existing CAS, sequence, event immutability, reversal and receipt
constraints remain. No table replacement, reset or historical row update; migrations
0001–0008 are unchanged. Legacy anchor fallback remains for unregistered standalone
compositions, but financial entrypoint writes require registry resolution. Future
production activation must verify 0008 adoption before applying/using C.

Upgrade on native local D1 preserves a populated B journal, operational opening,
canonical receipt and pending V1 proposal. All old table rows compare equal across
0009; the V1 hash is independently recomputed from its frozen formula before the
old proposal is approved and confirmed without a portfolio argument after upgrade.

Rollback is not automatic. Keep guards/data and disable writes pending separately
authorized forward repair/recovery. Old application code cannot handle V2 proposals;
do not silently roll it back with pending V2 operations. Never reapply 0007, erase
journals or restore D1 simply to rewind valid events.

## Local validation — 21 November 2026

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/portfolio-financial.test.ts tests/portfolio-financial.worker.test.ts tests/portfolio-writes-migration.test.ts tests/financial-mcp.test.ts tests/d1-migrations.test.ts tests/portfolio-reads.test.ts --exclude '**/.wrangler/**'
git diff --check
```

**55 targeted tests passed**, plus typecheck and whitespace check:

- 16 financial C cases: two real/two simulated portfolios, exact cash/holdings/PRU,
  all existing operations, owner/permission/status checks, archive races on empty/
  populated journals, circuit/ID separation, expiry, concurrent consumption/replay,
  key conflict, stale version, valid-hash/wrong-anchor refusal and escaped identity.
- 1 signed Worker/official SDK case: two complete real browser journeys, two
  simulated MCP journeys, disabled writes, archive refusal, unchanged legacy
  targeting and no administration/ingestion exposure.
- 1 native D1 populated B→C upgrade/V1 proposal and receipt compatibility case.
- 21 existing financial/browser cases, 5 official local migration cases, 11 B reads.

Only synthetic data, identities and local D1 were used. No full suite, dependency
installation, cloud mutation, private-data inspection, commit or deployment.
An initial test-array type needed annotation; no invariant was relaxed to pass tests.

## Limits and D handoff

- Local **GO**, not production validation. Hosted Access/latency/CPU, actual browser
  UX and a natural real transaction remain separate operational acceptance work.
- Consumption precedes journal append. An archive/CAS/storage race can leave a
  consumed proposal without a receipt: reconcile, never auto-rearm or blindly
  duplicate. This conservative V1.1 behavior is retained. Confirmation/replay through
  these tools remains bounded by expiry and active status; durable receipts remain.
- Simulated writes are an isolated financial ledger, not market simulation,
  automated orders, Trading Lab strategies or user sharing. Existing caps remain.
- C does not create/change performance references. D remains a separate feasibility
  study for hybrid A+B providers, adaptive collection and controlled fallback;
  coverage, freshness, quotas, licences and costs are unassessed here. No provider
  research or collector implementation was started.
