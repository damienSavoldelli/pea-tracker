import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { createJwksProvider } from './token-verifier';

export const accessConfiguration = z.object({
  issuer: z.string().refine(value => {
    try {
      const url = new URL(value);
      return value === url.origin && url.protocol === 'https:' && !url.port &&
        /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(url.hostname);
    } catch { return false; }
  }),
  audience: z.string().regex(/^[a-f0-9]{64}$/),
  ownerSubject: z.string().min(1).max(256).regex(/^[\x21-\x7E]+$/),
}).strict();

export class AccessAuthenticator {
  private readonly config: z.output<typeof accessConfiguration>;
  private readonly keys: JWTVerifyGetKey;
  private readonly clock: () => number;

  constructor(config: unknown, options: { keys?: JWTVerifyGetKey; fetch?: typeof fetch; clock?: () => number } = {}) {
    this.config = Object.freeze(accessConfiguration.parse(config));
    this.keys = options.keys ?? createJwksProvider({ url: `${this.config.issuer}/cdn-cgi/access/certs`,
      ...(options.fetch ? { fetch: options.fetch } : {}) });
    this.clock = options.clock ?? Date.now;
  }

  async authenticate(request: Request): Promise<Principal> {
    // Access resolves the client's opaque OAuth token. Never treat the original
    // Authorization header, email headers or query parameters as an identity.
    const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!assertion || assertion.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion)) {
      throw new ApplicationError(401, 'invalid_token');
    }
    const now = this.clock();
    let payload;
    try {
      ({ payload } = await jwtVerify(assertion, async (header, token) => {
        if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 128 ||
            header.jku !== undefined || header.x5u !== undefined || header.jwk !== undefined) throw new ApplicationError(401, 'invalid_token');
        return this.keys(header, token);
      }, { algorithms: ['RS256'], issuer: this.config.issuer, audience: this.config.audience,
        requiredClaims: ['sub', 'iat', 'exp', 'type'], currentDate: new Date(now), clockTolerance: 30 }));
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(401, 'invalid_token');
    }
    const audiences = typeof payload.aud === 'string' ? [payload.aud] : payload.aud;
    if (!audiences || audiences.length !== 1 || audiences[0] !== this.config.audience || payload.type !== 'app' ||
        typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256 ||
        !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
        payload.exp! <= payload.iat! || payload.iat! > now / 1000 + 30 ||
        (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf >= payload.exp!))) {
      throw new ApplicationError(401, 'invalid_token');
    }
    if (payload.sub !== this.config.ownerSubject) throw new ApplicationError(403, 'access_denied');
    // This Access application grants owner-only MCP reads, not OAuth delegated
    // scopes/client identity. Never pass it to REST administration or ingestion.
    return Object.freeze({ subject: 'owner:synthetic-access-poc', permissions: Object.freeze(['instruments:read'] as const) });
  }
}
