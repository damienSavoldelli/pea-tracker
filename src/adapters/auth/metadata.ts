import { ApplicationError } from '../../application/errors';
import type { TokenVerifier } from './token-verifier';

export const mcpScopes = ['mcp:read', 'portfolio:read'] as const;
export function protectedResourceMetadata(verifier: TokenVerifier) {
  return Object.freeze({ resource: verifier.policies.mcp.audience, authorization_servers: [verifier.issuer],
    scopes_supported: [...mcpScopes], bearer_methods_supported: ['header'] });
}

export function bearerChallenge(metadataUrl: string, scopes: readonly string[], status: 401 | 403): string {
  const error = status === 403 ? 'insufficient_scope' : 'invalid_token';
  return `Bearer error="${error}", resource_metadata="${metadataUrl}", scope="${scopes.join(' ')}"`;
}

export function authenticationFailure(error: unknown, challenge: (status: 401 | 403) => string): Response {
  const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
  const status = [401, 403, 503].includes(failure.status) ? failure.status : 500;
  const title = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 503 ? 'Service Unavailable' : 'Internal Server Error';
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/problem+json' });
  if (status === 401 || status === 403) headers.set('WWW-Authenticate', challenge(status));
  return Response.json({ type: 'about:blank', title, status, code: status === 500 ? 'internal_error' : failure.code, request_id: crypto.randomUUID() }, { status, headers });
}
