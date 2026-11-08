import type { AccessPolicy, ResourceKind } from '../../application/authorization';

export interface ResourcePolicy extends AccessPolicy { readonly audience: string }
export type ResourcePolicies = Readonly<Record<ResourceKind, ResourcePolicy>>;

export function trustedHttps(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.href !== value) {
    throw new Error('Invalid trusted authentication URL');
  }
  return value;
}

// Configuration is validated once and copied so later caller mutations cannot
// change an already constructed verifier's owner or grant ceilings.
export function resourcePolicies(input: ResourcePolicies): ResourcePolicies {
  const copy = structuredClone(input);
  const audiences = new Set<string>();
  for (const kind of ['mcp', 'rest', 'collector'] as const) {
    const policy = copy[kind];
    trustedHttps(policy.audience);
    if (policy.kind !== kind || audiences.has(policy.audience) || !policy.owner.subject ||
        !policy.owner.internalId || policy.owner.internalId.length > 128) throw new Error('Invalid resource policy');
    audiences.add(policy.audience);
    const ids = new Set<string>();
    const allowed = kind === 'mcp' ? ['mcp:read', 'portfolio:read'] : kind === 'rest' ? ['portfolio:read', 'portfolio:admin'] : ['quotes:ingest'];
    for (const client of policy.clients) {
      if (!client.id || ids.has(client.id) || client.scopes.length === 0 || client.scopes.some(scope => !allowed.includes(scope)) ||
          (kind === 'collector' && (!client.subject || !client.internalId || client.internalId.length > 128))) throw new Error('Invalid client grant');
      ids.add(client.id);
      Object.freeze(client.scopes); Object.freeze(client);
    }
    Object.freeze(policy.clients); Object.freeze(policy.owner); Object.freeze(policy);
  }
  return Object.freeze(copy);
}
