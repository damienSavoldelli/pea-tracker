# V2.0 integration evidence — 25 November 2026

## Assembly and local validation

Owner authorized a separate integration branch and bounded synthetic Linux CI.
Base `cc0b54b` preserves main V1.1.5. Plan commit `e0899eb`; D merge `42bfe1f`
contains A/B/C/D through `763d9f9`; E merge `e9ebda7` incorporates `b827a3c`.
No changes to main or its independent worktree, deployment or remote data.

The initial combined SDK regression failed at initialization (HTTP 500): both
financial and registry adapters registered `list_portfolios`. Composition now
selects registry discovery when available, retaining the legacy adapter's default
otherwise. No rename, swallowed exception or financial authorization change.
A registry-backed response intentionally has richer metadata; the signed Worker
case compares it exactly with REST V2 and retains the common envelope assertions.
Legacy discovery cases still enforce the exact minimal V1.1.5 response.

Before E, TypeScript passed and this targeted command passed **58 cases**:

```sh
node node_modules/vitest/vitest.mjs run tests/v2-integration.test.ts tests/financial-mcp.test.ts tests/portfolio-reads.test.ts tests/portfolio-financial.worker.test.ts tests/portfolio-registry-migration.test.ts tests/portfolio-writes-migration.test.ts --testTimeout=15000
```

After E, TypeScript passed; **28 cases** passed (the discovery regression is one
intentional rerun to verify E composition, so **85 distinct local cases** overall):

```sh
node node_modules/vitest/vitest.mjs run tests/v2-integration.test.ts tests/portfolio-financial.test.ts tests/portfolio-registry.test.ts --testTimeout=15000
```

Existing native populated upgrade cases exercise migrations 0008/0009 with old
financial proposals/hashes/receipts and owner/anchor/archive guards; their source
migrations are unchanged. Existing signed Worker journeys exercise independent
browser audience/Origin/CSRF, confirmation and replay. Synthetic fixtures only.
D's unchanged 80+55 checks and E's acquired Mac checks were not rerun wholesale.

## Linux validation setup

Separate `v2-integration-validation.yml`: integration-branch push only, two standard
Ubuntu 24.04 jobs, 20-minute timeout each; Node 22, Python 3.14, existing npm/uv
locks. Checkout/setup action v6 SHAs verified from their official Git repositories
on 25 November. No cache/artifact uploads, operational environment, production
secret, supplier campaign, dispatch, deploy or remote D1 command.

Repository API confirms public visibility. [GitHub's official billing rules](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
make standard public-repository runners free independently of account allowance.
The billing-summary API was unavailable to current credentials; no additional
scope was requested. No paid runner or storage product is needed. Forty job-minutes
is the timeout ceiling, not measured usage. Documentation-only pushes skip CI.

Linux results are pending; no Linux success or production readiness is claimed.
The platform reruns are justified by new native libcurl/process/Worker execution,
not a repeat of the real Yahoo campaign. Native network fixtures are loopback;
E2's actual library uses blocked exits and mocked HTTP. No vendor key supplied.

## Retained limits and later rollout gates

- Yahoo primary; EODHD observation only, 19/20 coverage, TNO ISIN conflict excluded.
- Prior EODHD campaign 17/20 units; bonus 500 intact then; no new supplier call.
- EODHD equivalence with unadjusted last trade remains unproven.
- Cadence default 30 minutes, optional 15 remains inactive; closing/freshness policy
  preserved. Shared-session optimization is experimental, not active collection.
- Private Yahoo receipt and its exhausted campaign claim remain untouched.
- Local/CI passes cannot prove hosted Access protection of V2 routes, populated
  real-anchor adoption/recovery, remote billed writes/storage/runtime headroom,
  retention, recovery or controlled rollout/rollback. These require separate gates.
- No main merge, tag/release, remote migration, fallback or deployment authorized
  by integration acceptance.
