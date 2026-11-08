import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { authorizeAccess, type Principal, type ResourceKind } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { resourcePolicies, trustedHttps, type ResourcePolicies } from './resource-policy';

export interface JwksOptions {
  url: string;
  fetch?: typeof fetch;
  cooldownMs?: number;
  cacheMs?: number;
  timeoutMs?: number;
}

export function createJwksProvider(options: JwksOptions): JWTVerifyGetKey {
  const url = new URL(trustedHttps(options.url));
  const timeout = options.timeoutMs ?? 2000;
  const cooldown = options.cooldownMs ?? 30000;
  const cache = options.cacheMs ?? 300000;
  if (![timeout, cooldown, cache].every(value => Number.isInteger(value) && value > 0) || timeout > 5000 || cooldown > 300000 || cache > 300000) {
    throw new Error('Invalid JWKS limits');
  }
  const fetcher = options.fetch ?? fetch;
  let retryAfter = 0;
  let fetching = false;
  const keys = createRemoteJWKSet(url, {
    timeoutDuration: timeout, cooldownDuration: cooldown, cacheMaxAge: cache,
    [customFetch]: async (target, init) => {
      // Fail closed during an in-flight cold fetch or failure cooldown; never share
      // cross-request network I/O in workerd or create a random-kid fetch storm.
      if (target !== url.href || fetching || Date.now() < retryAfter) throw new ApplicationError(503, 'authentication_unavailable');
      fetching = true;
      const signal = AbortSignal.any([init.signal, AbortSignal.timeout(timeout)]);
      let abortRead: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        abortRead = () => reject(new Error('Key timeout'));
        if (signal.aborted) abortRead();
        else signal.addEventListener('abort', abortRead, { once: true });
      });
      // Observe even when fetch fails before any stream read.
      void aborted.catch(() => {});
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await Promise.race([fetcher(target, { ...init, signal, redirect: 'manual' }), aborted]);
        if (response.status !== 200 || response.redirected || !['application/json', 'application/jwk-set+json'].includes(response.headers.get('Content-Type')?.split(';')[0]?.trim() ?? '')) throw new Error('Unavailable keys');
        reader = response.body?.getReader();
        if (!reader) throw new Error('Missing keys');
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const next = await Promise.race([reader.read(), aborted]);
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 65536) throw new Error('Keys too large');
          chunks.push(next.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const document: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!document || typeof document !== 'object' || !('keys' in document) || !Array.isArray(document.keys) || document.keys.length === 0 || document.keys.length > 16) throw new Error('Invalid keys');
        return Response.json(document);
      } catch {
        retryAfter = Date.now() + cooldown;
        throw new ApplicationError(503, 'authentication_unavailable');
      } finally {
        if (abortRead) signal.removeEventListener('abort', abortRead);
        void reader?.cancel().catch(() => {});
        fetching = false;
      }
    },
  });
  return async (header, token) => {
    try { return await keys(header, token); }
    catch (error) {
      if (error instanceof errors.JWKSNoMatchingKey) throw error;
      throw new ApplicationError(503, 'authentication_unavailable');
    }
  };
}

export interface TokenVerifierOptions {
  issuer: string;
  policies: ResourcePolicies;
  jwks: JWTVerifyGetKey;
  clientClaim?: 'azp' | 'client_id';
  clock?: () => number;
}

export class TokenVerifier {
  readonly issuer: string;
  readonly policies: ResourcePolicies;
  private readonly key: JWTVerifyGetKey;
  private readonly clock: () => number;
  private readonly clientClaim: 'azp' | 'client_id';
  constructor(options: TokenVerifierOptions) {
    this.issuer = trustedHttps(options.issuer);
    this.policies = resourcePolicies(options.policies);
    this.key = options.jwks;
    this.clock = options.clock ?? Date.now;
    this.clientClaim = options.clientClaim ?? 'azp';
  }

  async authenticate(request: Request, resource: ResourceKind): Promise<Principal> {
    const authorization = request.headers.get('Authorization');
    if (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(authorization) ||
        new URL(request.url).searchParams.has('access_token')) throw new ApplicationError(401, 'invalid_token');
    const policy = this.policies[resource];
    const now = this.clock();
    let payload;
    try {
      const verified = await jwtVerify(authorization.slice(7), async (header, token) => {
        if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0 || header.kid.length > 128 ||
            (header.typ !== 'JWT' && header.typ !== 'at+jwt') || header.jku !== undefined || header.x5u !== undefined || header.jwk !== undefined) {
          throw new ApplicationError(401, 'invalid_token');
        }
        return this.key(header, token);
      }, { algorithms: ['RS256'], issuer: this.issuer, audience: policy.audience, clockTolerance: 30,
        currentDate: new Date(now), requiredClaims: ['sub', 'iat', 'exp', 'scope', this.clientClaim] });
      payload = verified.payload;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(401, 'invalid_token');
    }
    const audiences = typeof payload.aud === 'string' ? [payload.aud] : payload.aud;
    const client = payload[this.clientClaim];
    if (!audiences || audiences.length !== 1 || audiences[0] !== policy.audience ||
        typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256 ||
        typeof client !== 'string' || !client || client.length > 256 ||
        typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) || typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) ||
        payload.exp <= payload.iat || payload.exp - payload.iat > 300 || payload.iat > now / 1000 + 30 ||
        (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf >= payload.exp)) ||
        typeof payload.scope !== 'string' || payload.scope.length > 2048 || !/^[\x21\x23-\x5B\x5D-\x7E]+(?: [\x21\x23-\x5B\x5D-\x7E]+)*$/.test(payload.scope) ||
        (payload.azp !== undefined && payload.client_id !== undefined && payload.azp !== payload.client_id)) throw new ApplicationError(401, 'invalid_token');
    return authorizeAccess({ subject: payload.sub, clientId: client, scopes: payload.scope.split(' ') }, policy);
  }
}
