---
type: spike
status: inconclusive
source: "Owner OAuth architecture evaluation and resume request, 2026-11-08"
related_to:
  - aidd_docs/tasks/2026_11/2026_11_08_oauth-authentication/plan.md
---

# Spike: oauth-provider-selection

## Question

Can Workers OAuth Provider or Auth0 meet this single-owner application's security,
connector, maintenance and zero-recurring-cost requirements without changing its
single-Worker application architecture?

## Decision

Which provider should enter the synthetic proof of concept first, and what must
be demonstrated before selecting it for private financial access?

## Bounds

- Reuse the completed official-source research and repository inspection from the
  interrupted run. The resumed run found no saved OAuth artifacts and a clean tree
  at commit 7668ad9. No duplicated provider research was needed.
- Stop at a documented recommendation and testable gates. No credentials, remote
  configuration, implementation, cloud resources, deployment or Git writes.
- Documentation evidence can rank candidates; it cannot prove tenant entitlements,
  actual ChatGPT/Claude linking, distributed replay safety or production recovery.

## Investigation

| Attempt | Evidence | Result |
| --- | --- | --- |
| Inspect code and existing architecture | Repository findings in the evaluation | Shared instrument permission checks are reusable; no token verifier exists |
| Completed Cloudflare research | Official provider source/docs and KV guarantees | Same Worker feasible; project owns identity/consent; atomic replay protection remains a gate |
| Completed Auth0 research | Current MCP, registration, token and pricing documentation | Lower identity maintenance; native resource support; Free feature eligibility needs confirmation |
| Client/specification research | Current OpenAI, Anthropic and MCP documentation | Discovery/PKCE/client registration supported in principle; deployed ping is not OAuth evidence |

## Outcome

- **Provisional recommendation: Auth0 first**, with the Worker remaining the
  REST/MCP resource server. Keep Workers OAuth Provider as an evaluated fallback.
- Confidence: high in the architectural fit and responsibility comparison; limited
  in runtime/client compatibility and total cost because no tenant or live OAuth
  connection was tested.
- Status is inconclusive for final selection: scope grants, owner assurance/recovery,
  revocation window, client interoperability, entitlements and CPU remain gates.
- See the [technical evaluation](../../tasks/2026_11/2026_11_08_oauth-authentication/evaluation.md),
  [cost assessment](../../tasks/2026_11/2026_11_08_oauth-authentication/costs.md) and
  [acceptance criteria](../../tasks/2026_11/2026_11_08_oauth-authentication/acceptance.md).

## Follow-up

Phases 1/2 now implement local JWT verification; phase-3 local preparation adds a
dedicated fail-closed synthetic composition and configuration/discovery checks.
See [interop evidence](../../tasks/2026_11/2026_11_08_oauth-authentication/interop-evidence.md).
No actual tenant entitlement, Auth0-issued token or hosted client result is available;
the final provider-selection outcome remains inconclusive.

Review the pending implementation plan. Approval of documentation does not authorize
tenant changes, dependencies, provisioning, deployment or changing the connected MCP.
Resume the spike with actual approved PoC evidence before making a final selection.
No parent baseline, memory or product artifact was changed by this evaluation.
