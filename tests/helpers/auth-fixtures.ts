import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { createJwksProvider, TokenVerifier } from '../../src/adapters/auth/token-verifier';
import type { ResourcePolicies } from '../../src/adapters/auth/resource-policy';

export const issuer = 'https://synthetic-issuer.example.invalid/';
export const origin = 'https://synthetic-pea.example.invalid';
export const now = 1794146400000;
export function policies(): ResourcePolicies {
  const owner = { subject: 'synthetic-external-owner', internalId: 'owner:synthetic-owner-id' };
  return {
    mcp: { kind: 'mcp', audience: `${origin}/mcp`, owner, clients: [{ id: 'synthetic-mcp', scopes: ['mcp:read', 'portfolio:read'] }] },
    rest: { kind: 'rest', audience: `${origin}/api/v1`, owner, clients: [
      { id: 'synthetic-reader', scopes: ['portfolio:read'] },
      { id: 'synthetic-admin', scopes: ['portfolio:read', 'portfolio:admin'] },
    ] },
    collector: { kind: 'collector', audience: `${origin}/api/v1/quotations/ingest`, owner,
      clients: [{ id: 'synthetic-collector', subject: 'synthetic-machine', internalId: 'collector:synthetic', scopes: ['quotes:ingest'] }] },
  };
}

async function keys() {
  const first = await generateKeyPair('RS256');
  const second = await generateKeyPair('RS256');
  return { first, second,
    firstPublic: { ...await exportJWK(first.publicKey), kid: 'synthetic-key-1', alg: 'RS256', use: 'sig' },
    secondPublic: { ...await exportJWK(second.publicKey), kid: 'synthetic-key-2', alg: 'RS256', use: 'sig' } };
}
let keyPromise: ReturnType<typeof keys> | undefined;
export async function authFixture() {
  const key = await (keyPromise ??= keys());
  let time = now;
  const policy = policies();
  const verifier = new TokenVerifier({ issuer, policies: policy, jwks: createLocalJWKSet({ keys: [key.firstPublic] }), clock: () => time });
  const token = (claims: JWTPayload = {}, header: Record<string, unknown> = {}, second = false) =>
    new SignJWT({ iss: issuer, sub: policy.rest.owner.subject, aud: policy.rest.audience, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 300,
      azp: 'synthetic-admin', scope: 'portfolio:read portfolio:admin', ...claims })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: second ? 'synthetic-key-2' : 'synthetic-key-1', ...header }).sign(second ? key.second.privateKey : key.first.privateKey);
  const request = (bearer: string, path = '/api/v1/instruments', method = 'GET') => new Request(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${bearer}` } });
  return { key, verifier, policy, token, request, setTime: (value: number) => { time = value; },
    remote: (fetcher: typeof fetch, options: { cooldownMs?: number; cacheMs?: number; timeoutMs?: number } = {}) => new TokenVerifier({ issuer, policies: policy,
      jwks: createJwksProvider({ url: `${issuer}jwks`, fetch: fetcher, ...options }), clock: () => time }),
  };
}
