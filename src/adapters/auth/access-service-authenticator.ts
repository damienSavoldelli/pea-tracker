import { z } from 'zod';
import type { Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { AccessJwtVerifier, reportAccessDiagnostic, accessJwtConfiguration, type AccessJwtOptions } from './access-jwt';

export const collectorSubject = 'collector:github-actions';
export const accessServiceConfiguration = accessJwtConfiguration.extend({
  enabled: z.boolean(),
  serviceClientIds: z.array(z.string().max(160).regex(/^[A-Za-z0-9_-]+\.access$/)).min(1).max(2)
    .refine(values => new Set(values).size === values.length),
}).strict();

export class AccessServiceAuthenticator {
  private readonly enabled: boolean;
  private readonly clients: ReadonlySet<string>;
  private readonly verifier: AccessJwtVerifier;

  constructor(config: unknown, private readonly options: AccessJwtOptions = {}) {
    const parsed = accessServiceConfiguration.parse(config);
    this.enabled = parsed.enabled;
    this.clients = new Set(parsed.serviceClientIds);
    this.verifier = new AccessJwtVerifier({ issuer: parsed.issuer, audience: parsed.audience }, options);
  }

  async authenticate(request: Request): Promise<Principal> {
    const payload = await this.verifier.verify(request);
    // Service-token application JWTs have an empty sub and signed common_name.
    // Never accept the interactive owner, raw CF-Access-Client-Id, scope or azp.
    if (payload.sub !== '' || typeof payload.common_name !== 'string' || !this.clients.has(payload.common_name)) {
      reportAccessDiagnostic(this.options, 'machine_identity_rejected');
      throw new ApplicationError(403, 'access_denied');
    }
    if (payload.exp! - payload.iat! > 300) {
      reportAccessDiagnostic(this.options, 'assertion_lifetime_exceeded');
      throw new ApplicationError(401, 'invalid_token');
    }
    if (!this.enabled) throw new ApplicationError(503, 'ingestion_disabled');
    return Object.freeze({ subject: collectorSubject, permissions: Object.freeze(['quotes:ingest'] as const) });
  }
}
