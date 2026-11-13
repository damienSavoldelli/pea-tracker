import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { ApplicationError } from '../../application/errors';
import { createJwksProvider } from './token-verifier';

export const accessJwtConfiguration = z.object({
  issuer: z.string().refine(value => {
    try {
      const url = new URL(value);
      return value === url.origin && url.protocol === 'https:' && !url.port &&
        /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(url.hostname);
    } catch { return false; }
  }),
  audience: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type AccessDiagnosticCode = 'assertion_missing_or_malformed' | 'header_rejected' |
  'signature_invalid' | 'key_not_found' | 'jwks_unavailable' | 'issuer_rejected' |
  'audience_rejected' | 'expired' | 'not_before_rejected' | 'issued_at_rejected' |
  'expiration_rejected' | 'subject_rejected' | 'token_type_rejected' |
  'claims_rejected' | 'jwt_rejected' | 'machine_identity_rejected' | 'assertion_lifetime_exceeded';

export interface AccessJwtOptions {
  keys?: JWTVerifyGetKey; fetch?: typeof fetch; clock?: () => number;
  /** Internal fixed-code sink; never receives tokens, claim values, or exceptions. */
  onDiagnostic?: (code: AccessDiagnosticCode) => void;
}

/** A diagnostic sink must never affect an authorization decision. */
export function reportAccessDiagnostic(options: AccessJwtOptions, code: AccessDiagnosticCode): void {
  try { options.onDiagnostic?.(code); } catch { /* Preserve the original rejection. */ }
}

// Common cryptographic boundary only. Owner and machine authorization policies
// interpret the verified claims separately; client-supplied headers are not identity.
export class AccessJwtVerifier {
  private readonly config: z.output<typeof accessJwtConfiguration>;
  private readonly keys: JWTVerifyGetKey;
  private readonly clock: () => number;

  constructor(config: unknown, private readonly options: AccessJwtOptions = {}) {
    this.config = Object.freeze(accessJwtConfiguration.parse(config));
    this.keys = options.keys ?? createJwksProvider({ url: `${this.config.issuer}/cdn-cgi/access/certs`,
      ...(options.fetch ? { fetch: options.fetch } : {}) });
    this.clock = options.clock ?? Date.now;
  }

  async verify(request: Request) {
    const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!assertion || assertion.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion)) {
      this.reject('assertion_missing_or_malformed');
    }
    const now = this.clock();
    let payload;
    try {
      ({ payload } = await jwtVerify(assertion, async (header, token) => {
        if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 128 ||
            header.jku !== undefined || header.x5u !== undefined || header.jwk !== undefined) this.reject('header_rejected');
        return this.keys(header, token);
      }, { algorithms: ['RS256'], issuer: this.config.issuer, audience: this.config.audience,
        requiredClaims: ['sub', 'iat', 'exp', 'type'], currentDate: new Date(now), clockTolerance: 30 }));
    } catch (error) {
      if (error instanceof ApplicationError) {
        if (error.code === 'authentication_unavailable') reportAccessDiagnostic(this.options, 'jwks_unavailable');
        throw error;
      }
      if (error instanceof errors.JWTExpired) this.reject('expired');
      if (error instanceof errors.JWTClaimValidationFailed) {
        const reason: AccessDiagnosticCode = error.claim === 'iss' ? 'issuer_rejected' :
          error.claim === 'aud' ? 'audience_rejected' : error.claim === 'nbf' ? 'not_before_rejected' :
          error.claim === 'iat' ? 'issued_at_rejected' : error.claim === 'exp' ? 'expiration_rejected' :
          error.claim === 'sub' ? 'subject_rejected' : error.claim === 'type' ? 'token_type_rejected' : 'claims_rejected';
        this.reject(reason);
      }
      if (error instanceof errors.JWKSNoMatchingKey) this.reject('key_not_found');
      if (error instanceof errors.JWSSignatureVerificationFailed) this.reject('signature_invalid');
      if (error instanceof errors.JOSEAlgNotAllowed) this.reject('header_rejected');
      this.reject('jwt_rejected');
    }
    const audiences = typeof payload.aud === 'string' ? [payload.aud] : payload.aud;
    if (!audiences || audiences.length !== 1 || audiences[0] !== this.config.audience) this.reject('audience_rejected');
    if (payload.type !== 'app') this.reject('token_type_rejected');
    if (typeof payload.sub !== 'string' || payload.sub.length > 256) this.reject('subject_rejected');
    if (!Number.isSafeInteger(payload.iat) || payload.iat! > now / 1000 + 30) this.reject('issued_at_rejected');
    if (!Number.isSafeInteger(payload.exp) || payload.exp! <= payload.iat!) this.reject('expiration_rejected');
    if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf >= payload.exp!)) this.reject('not_before_rejected');
    return payload;
  }

  private reject(code: AccessDiagnosticCode): never {
    reportAccessDiagnostic(this.options, code);
    throw new ApplicationError(401, 'invalid_token');
  }
}
