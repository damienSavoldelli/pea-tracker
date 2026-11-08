import { ApplicationError } from './errors';

export type Permission = 'instruments:read' | 'instruments:admin' | 'quotes:ingest';
export interface Principal {
  readonly subject: string;
  readonly permissions: readonly Permission[];
}

// Only a trusted server-side verifier/composition may create this context.
// It is not a parser for HTTP headers, roles or client-supplied scopes.
export function requirePrincipal(principal: Principal | null): asserts principal is Principal {
  if (!principal || !principal.subject || principal.subject.length > 128) {
    throw new ApplicationError(401, 'unauthenticated');
  }
}

export function requirePermission(principal: Principal | null, permission: Permission): asserts principal is Principal {
  requirePrincipal(principal);
  if (!principal.permissions.includes(permission)) throw new ApplicationError(403, 'forbidden');
}

export type ResourceKind = 'mcp' | 'rest' | 'collector';
export interface AccessIdentity {
  readonly subject: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
}
export interface ClientGrant {
  readonly id: string;
  readonly scopes: readonly string[];
  // Machine subjects must be bound independently of the human owner.
  readonly subject?: string;
  readonly internalId?: string;
}
export interface AccessPolicy {
  readonly kind: ResourceKind;
  readonly clients: readonly ClientGrant[];
  readonly owner: { readonly subject: string; readonly internalId: string };
}

// Receives only a cryptographically verified identity from trusted composition.
// OAuth claims/roles are not copied into service permissions.
export function authorizeAccess(identity: AccessIdentity, policy: AccessPolicy): Principal {
  const client = policy.clients.find(item => item.id === identity.clientId);
  if (!client) throw new ApplicationError(403, 'access_denied');
  const machine = policy.kind === 'collector';
  const expected = machine ? client.subject : policy.owner.subject;
  const internalId = machine ? client.internalId : policy.owner.internalId;
  if (!expected || identity.subject !== expected || !internalId || internalId.length > 128) {
    throw new ApplicationError(403, 'access_denied');
  }
  const has = (scope: string) => identity.scopes.includes(scope) && client.scopes.includes(scope);
  const permissions: Permission[] = [];
  if (policy.kind === 'mcp') {
    if (has('mcp:read') && has('portfolio:read')) permissions.push('instruments:read');
  } else if (machine) {
    if (has('quotes:ingest')) permissions.push('quotes:ingest');
  } else {
    if (has('portfolio:read')) permissions.push('instruments:read');
    if (has('portfolio:admin')) permissions.push('instruments:admin');
  }
  if (permissions.length === 0) throw new ApplicationError(403, 'insufficient_scope');
  return Object.freeze({ subject: internalId, permissions: Object.freeze(permissions) });
}
