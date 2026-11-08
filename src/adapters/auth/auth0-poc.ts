import { z } from 'zod';
import { resourcePolicies, trustedHttps } from './resource-policy';
import { createJwksProvider, TokenVerifier } from './token-verifier';

const identity = z.string().min(1).max(128).regex(/^[A-Za-z0-9|:_-]+$/);
// Signed client identifiers can be opaque IDs or HTTPS CIMD identifiers. They
// are compared exactly, never fetched or interpreted as an endpoint here.
const clients = z.array(z.string().min(1).max(256).regex(/^[\x21-\x7E]+$/))
  .max(8).refine(value => new Set(value).size === value.length);
const configuration = z.object({
  issuer: z.string(),
  origin: z.string(),
  syntheticOwnerSubject: identity,
  mcpClientIds: clients.min(1),
  restReadClientIds: clients,
  restAdminClientIds: clients,
  clientClaim: z.enum(['azp', 'client_id']),
}).strict();

// Trusted operator configuration only. Nothing is inferred from an incoming token,
// Host header or discovery URL. Custom Auth0 domains require a separate review.
export function auth0PocConfiguration(input: unknown) {
  const config = configuration.parse(input);
  const issuer = new URL(trustedHttps(config.issuer));
  const origin = new URL(trustedHttps(config.origin));
  if (issuer.pathname !== '/' || issuer.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.auth0\.com$/.test(issuer.hostname) ||
      origin.href !== `${origin.origin}/` || origin.port || origin.origin === issuer.origin) throw new Error('Invalid PoC origins');
  const restClients = new Set([...config.restReadClientIds, ...config.restAdminClientIds]);
  if (config.mcpClientIds.some(id => restClients.has(id))) throw new Error('MCP and REST clients must be separate');
  const owner = { subject: config.syntheticOwnerSubject, internalId: 'owner:synthetic-auth0-poc' };
  const policies = resourcePolicies({
    mcp: { kind: 'mcp', audience: `${origin.origin}/mcp`, owner,
      clients: config.mcpClientIds.map(id => ({ id, scopes: ['mcp:read', 'portfolio:read'] })) },
    rest: { kind: 'rest', audience: `${origin.origin}/api/v1`, owner,
      clients: [...restClients].map(id => ({ id, scopes: [
        ...(config.restReadClientIds.includes(id) ? ['portfolio:read'] : []),
        ...(config.restAdminClientIds.includes(id) ? ['portfolio:admin'] : []),
      ] })) },
    // Ingestion is deferred: no machine grant or endpoint in this PoC.
    collector: { kind: 'collector', audience: `${origin.origin}/api/v1/quotations/ingest`, owner, clients: [] },
  });
  return { issuer: issuer.href, origin: origin.origin, clientClaim: config.clientClaim,
    jwksUrl: `${issuer.origin}/.well-known/jwks.json`, policies };
}

export function auth0PocVerifier(input: unknown, fetcher: typeof fetch = fetch) {
  const config = auth0PocConfiguration(input);
  return new TokenVerifier({ issuer: config.issuer, policies: config.policies, clientClaim: config.clientClaim,
    jwks: createJwksProvider({ url: config.jwksUrl, fetch: fetcher }) });
}

// Assess an operator-obtained public OIDC document. This does not prove tenant
// grants, PKCE enforcement, resource handling, token shape or actual client login.
export function assessAuth0Discovery(input: unknown, document: unknown) {
  const config = auth0PocConfiguration(input);
  const metadata = z.object({
    issuer: z.literal(config.issuer),
    jwks_uri: z.literal(config.jwksUrl),
    authorization_endpoint: z.literal(`${config.issuer}authorize`),
    token_endpoint: z.literal(`${config.issuer}oauth/token`),
    response_types_supported: z.array(z.string()).refine(values => values.includes('code')),
    code_challenge_methods_supported: z.array(z.string()).refine(values => values.includes('S256')),
    grant_types_supported: z.array(z.string()).refine(values => values.includes('authorization_code')),
    authorization_response_iss_parameter_supported: z.boolean().optional(),
    registration_endpoint: z.string().optional(),
  }).parse(document);
  return { discovery: 'compatible' as const,
    issuerCallbackProtection: metadata.authorization_response_iss_parameter_supported === true ? 'advertised' : 'unverified',
    registration: metadata.registration_endpoint ? 'advertised-unverified' : 'manual-registration-required',
    liveTokenProfile: 'unverified', resourceCompatibility: 'unverified', grants: 'unverified' };
}
