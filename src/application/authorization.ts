import { ApplicationError } from './errors';

export type Permission = 'instruments:read' | 'instruments:admin';
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
