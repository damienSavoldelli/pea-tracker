import { createApp } from './app';
import type { InstrumentService } from './application/instruments';
import { bearerChallenge, mcpScopes, protectedResourceMetadata } from './adapters/auth/metadata';
import type { TokenVerifier } from './adapters/auth/token-verifier';

// Explicit opt-in composition. The deployed entrypoint imports neither this
// composition nor synthetic credentials, keys, owner IDs or financial repositories.
export function createProtectedApp(verifier: TokenVerifier, service: InstrumentService) {
  const resource = new URL(verifier.policies.mcp.audience);
  if (resource.pathname !== '/mcp') throw new Error('MCP resource must use /mcp');
  const restResource = new URL(verifier.policies.rest.audience);
  if (restResource.origin !== resource.origin || restResource.pathname !== '/api/v1') throw new Error('REST resource must use the same origin and /api/v1');
  const metadataUrl = `${resource.origin}/.well-known/oauth-protected-resource/mcp`;
  const restMetadataUrl = `${resource.origin}/.well-known/oauth-protected-resource/api/v1`;
  return createApp({
    instruments: {
      service, authenticate: request => verifier.authenticate(request, 'rest'),
      challenge: (status, request) => bearerChallenge(restMetadataUrl, [request.method === 'GET' ? 'portfolio:read' : 'portfolio:admin'], status),
    },
    mcp: {
      service, authenticate: request => verifier.authenticate(request, 'mcp'),
      metadata: protectedResourceMetadata(verifier),
      restMetadata: { resource: verifier.policies.rest.audience, authorization_servers: [verifier.issuer], scopes_supported: ['portfolio:read', 'portfolio:admin'], bearer_methods_supported: ['header'] },
      challenge: status => bearerChallenge(metadataUrl, mcpScopes, status),
    },
  });
}
