# Cost and operating assumptions

Status: dated estimate, not a quote or authorization to spend. Research reused from
the completed official-source investigations dated 2026-11-08. No tenant, bill or
cloud account settings were accessed. USD catalogue prices are not euro/tax totals.

Phase-3 preparation: no tenant or entitlement evidence yet; no resources or charges
introduced. The closed PoC template has no D1/KV binding. Public hosting remains
blocked on approval of actual Free entitlements, abuse controls and a traffic budget;
the estimates below have not become observed costs. See [interop-evidence.md](interop-evidence.md).

## Expected usage

INSTALL's baseline is one owner, 20–100 REST/MCP requests/day, roughly 18 quotation
cycles/trading day and 20 instruments. Assume two hosted AI read clients, one
separate admin client, one future collector machine client, occasional reconnects
and tests. Request counts include discovery, auth failures and abuse, not just tool
calls. Collector implementation remains outside this milestone.

At one machine token per cycle, 18 cycles × 22 trading days is approximately 396
tokens/month; 23 days is 414. Hourly all-month scheduling can reach 744. One daily
run is about 31. Five-minute independent runs would reach 8,928 in a 31-day month.
These are estimates of token issuance, not instrument count or user MAU. Reserve
headroom for retries/tests; do not persist long-lived tokens insecurely to save quota.

## Provider costs and feature constraints

| Candidate | Documented catalogue position | Project-specific conditions |
| --- | --- | --- |
| Auth0 Free | $0/month; 25,000 MAU; 1,000 M2M tokens/month; Auth for MCP, passkeys and five Actions listed | Confirm tenant entitlements, grant controls, resource profile, owner recovery and chosen client authentication |
| Auth0 paid | Displayed starting B2C Essentials $35/month; Professional $240/month; private_key_jwt is Enterprise-only | Pro MFA/role management are not assumed Free; any required paid feature needs a new budget decision |
| Workers OAuth Provider | No separately priced hosted identity product established by library | Count Worker/KV and upstream identity; integration, consent, recovery and upgrades remain owner work |

Source: [Auth0 pricing and comparison](https://auth0.com/pricing). Do not require a
custom login domain, card verification or Early Access merely for this PoC. Verify
actual plan terms before selection; no subscription is activated by this document.

Cloudflare's documented Free limits include 100,000 Worker requests/day and 10 ms
CPU/HTTP request. KV includes 100,000 reads/day, 1,000 writes/day, 1,000 deletes/day,
1,000 lists/day and 1 GB; same-key writes are limited to one/second. These limits
are account-shared, and exhausted KV operation types fail. Actual auth-flow operation
counts and crypto CPU must be measured rather than inferred from one user.
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[KV pricing](https://developers.cloudflare.com/kv/platform/pricing/),
[KV limits](https://developers.cloudflare.com/kv/platform/limits/).

## Feasible budget envelope

- **Auth0 first:** $0 recurring auth/backend infrastructure is plausible for the
  baseline if the required controls are available on Free and measured Workers
  usage fits. JWT verification alone needs no OAUTH_KV or extra identity database.
- **Provider fallback:** $0 infrastructure may be plausible at baseline volume, but
  upstream identity and any stronger consistency mechanism must also fit. Lower
  hosting charges do not imply lower maintenance or security cost.
- Excluded: existing ChatGPT/Claude subscriptions, optional email/SMS delivery,
  domain purchase, taxes/exchange rates, owner engineering time and any future
  strong revocation/backup infrastructure. Hosted-client account eligibility is a
  prerequisite, not an auth-backend price guarantee.
- Immediate access revocation, stronger MFA requirements or an unavailable Free
  feature can invalidate the zero-cost estimate. Stop for a new cost/security
  decision; never trade away required checks to meet €0.

## Operations and maintenance

Proposed steady-state target remains the baseline's 1–2 hours/month after
stabilization; this is a target, not measured evidence. Auth0 reduces login/recovery
code but retains tenant configuration, vendor outage, issuer/grant review, recovery
and usage monitoring. Provider additionally requires consent/upstream identity code,
KV lifecycle analysis and release/security maintenance. No numeric maintenance
saving is claimed without operating experience.

Before exposure, record measured warm/cold verification CPU and p95 latency, JWKS
cache misses/unknown-kid fetches, auth requests, issuance/refresh/M2M counts and error
rates. Use counts/request IDs only, no token/financial payload logging. Set proposed
warning thresholds at 50% and 80% of relevant quotas, with manual review before
capacity changes. Verify how alerts/rate controls are available on the chosen plans;
these thresholds do not claim a monitoring service has been configured.

Document tenant/issuer/client/audience configuration without secrets, key rotation
and outage behavior, recovery ownership, and rollback to diagnostic-only composition.
Separate dev/PoC and later production grants/data. Do not assume a shared free tenant
is adequate isolation or that an extra tenant is entitled: confirm the chosen setup.
