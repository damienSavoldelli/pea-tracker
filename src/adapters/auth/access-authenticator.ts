import { z } from 'zod';
import type { Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { AccessJwtVerifier, accessJwtConfiguration, type AccessJwtOptions } from './access-jwt';

export const accessConfiguration = accessJwtConfiguration.extend({
  ownerSubject: z.string().min(1).max(256).regex(/^[\x21-\x7E]+$/),
}).strict();

export class AccessAuthenticator {
  private readonly config: z.output<typeof accessConfiguration>;
  private readonly verifier: AccessJwtVerifier;

  constructor(config: unknown, options: AccessJwtOptions = {}) {
    this.config = Object.freeze(accessConfiguration.parse(config));
    this.verifier = new AccessJwtVerifier({ issuer: this.config.issuer, audience: this.config.audience }, options);
  }

  async authenticate(request: Request): Promise<Principal> {
    const payload = await this.verifier.verify(request);
    if (!payload.sub) throw new ApplicationError(401, 'invalid_token');
    if (payload.sub !== this.config.ownerSubject) throw new ApplicationError(403, 'access_denied');
    // Existing owner-only MCP reads stay independent of machine grants/scopes.
    return Object.freeze({ subject: 'owner:synthetic-access-poc', permissions: Object.freeze(['instruments:read'] as const) });
  }
}
