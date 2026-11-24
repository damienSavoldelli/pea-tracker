import { z } from 'zod';
import { AccessJwtVerifier, accessJwtConfiguration, type AccessJwtOptions } from './access-jwt';
import { ApplicationError } from '../../application/errors';
import type { Principal, Permission } from '../../application/authorization';

const configSchema = accessJwtConfiguration.extend({
  browserAudience: accessJwtConfiguration.shape.audience,
  ownerSubject: z.string().min(1).max(256), internalSubject: z.string().min(1).max(128),
  financialWritesEnabled: z.boolean(),
  readOnlyMixedAudienceEnabled: z.boolean().default(false),
  mcpKnownAudiencePairEnabled: z.boolean().default(false),
}).strict().refine(value => value.audience !== value.browserAudience, 'Browser approval must have a distinct Access audience')
  .refine(value => !value.financialWritesEnabled || !value.readOnlyMixedAudienceEnabled,
    'Read-only audience recovery requires financial writes to be disabled');

/** Opt-in financial permissions. Existing read authenticator/ingestion grants are untouched. */
export class FinancialAccessAuthenticator {
  private readonly config: z.output<typeof configSchema>;
  private readonly mcp: AccessJwtVerifier;
  private readonly browser: AccessJwtVerifier;
  constructor(config: unknown, options: AccessJwtOptions = {}) {
    this.config = configSchema.parse(config);
    this.mcp = new AccessJwtVerifier({ issuer: this.config.issuer, audience: this.config.audience },
      { ...options, diagnosticOtherAudience: this.config.browserAudience,
        permittedCompanionAudience: this.config.readOnlyMixedAudienceEnabled || this.config.mcpKnownAudiencePairEnabled
          ? this.config.browserAudience : undefined });
    this.browser = new AccessJwtVerifier({ issuer: this.config.issuer, audience: this.config.browserAudience },
      { ...options, diagnosticOtherAudience: this.config.audience, permittedCompanionAudience: undefined });
  }
  private owner(subject: string | undefined, permissions: readonly Permission[]): Principal {
    if (subject !== this.config.ownerSubject) throw new ApplicationError(403, 'access_denied');
    return Object.freeze({ subject: this.config.internalSubject, permissions: Object.freeze([...permissions]) });
  }
  async authenticateMcp(request: Request) {
    const claims = await this.mcp.verify(request);
    return this.owner(claims.sub, ['instruments:read', 'quotes:read', 'portfolio:read',
      ...(this.config.financialWritesEnabled ? ['portfolio:write' as const] : [])]);
  }
  /** Identity-only verification for a read-only diagnostic. Grants no permission. */
  async verifyBrowserIdentity(request: Request): Promise<void> {
    // Browser-only paths must reject OAuth/service credentials and verify their own signed AUD.
    if (request.headers.has('Authorization') || request.headers.has('CF-Access-Client-Id') || request.headers.has('CF-Access-Client-Secret')) throw new ApplicationError(403, 'browser_confirmation_required');
    const claims = await this.browser.verify(request);
    this.owner(claims.sub, []);
  }
  async authenticateBrowser(request: Request) {
    if (!this.config.financialWritesEnabled) throw new ApplicationError(403, 'financial_writes_disabled');
    await this.verifyBrowserIdentity(request);
    return this.owner(this.config.ownerSubject, ['portfolio:read', 'portfolio:approve']);
  }
}
