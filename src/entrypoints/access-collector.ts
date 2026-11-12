import { z } from 'zod';
import { D1InstrumentRepository } from '../adapters/d1/instruments';
import { D1QuotationRepository } from '../adapters/d1/quotations';
import { AccessServiceAuthenticator, accessServiceConfiguration, collectorSubject } from '../adapters/auth/access-service-authenticator';
import type { AccessJwtOptions } from '../adapters/auth/access-jwt';
import { instrumentIdSchema } from '../domain/instruments';
import { createAccessCollectorApp } from '../collector-app';
import { QuotationService } from '../application/quotations';

const providerSchema = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/);
const grantSchema = z.array(z.object({
  provider: providerSchema,
  instrument_ids: z.array(instrumentIdSchema).min(1).max(20),
}).strict()).max(20).superRefine((grants, context) => {
  const seen = new Set<string>();
  for (const grant of grants) {
    for (const instrumentId of grant.instrument_ids) {
      if (seen.has(instrumentId)) context.addIssue({ code: 'custom', message: 'Duplicate instrument grant' });
      seen.add(instrumentId);
    }
  }
});

const runtimeSchema = z.object({
  INSTRUMENTS_DB: z.custom<D1Database>(value => value !== null && typeof value === 'object' && 'prepare' in value),
  ACCESS_TEAM_DOMAIN: accessServiceConfiguration.shape.issuer,
  ACCESS_INGESTION_AUD: accessServiceConfiguration.shape.audience,
  ACCESS_INGESTION_ENABLED: z.enum(['true', 'false']),
  ACCESS_SERVICE_CLIENT_IDS: z.string().min(2).max(1024),
  COLLECTOR_INGESTION_GRANTS: z.string().min(2).max(8192),
}).strict();

function parseJson<T>(value: string, schema: z.ZodType<T>): T {
  try { return schema.parse(JSON.parse(value)); }
  catch { throw new Error('Invalid collector configuration'); }
}

type AccessCollectorEnv = D1LocalEnv & Record<string, unknown>;

/** Builds the dedicated machine-ingestion composition from one Worker environment.
 * @param env - Wrangler-generated bindings and non-secret settings for this Worker.
 * @param options - Optional JWKS transport injection for synthetic tests.
 * @returns A Hono application exposing only the protected quote-batch ingestion route.
 * @throws {Error} If a required binding or security setting is missing or invalid.
 * @remarks Provider and instrument grants are configuration-bound; the authenticated subject is always supplied by AccessServiceAuthenticator.
 */
export function createAccessCollectorWorker(env: AccessCollectorEnv, options: AccessJwtOptions = {}) {
  const config = runtimeSchema.parse(env);
  const serviceClientIds = parseJson(config.ACCESS_SERVICE_CLIENT_IDS, accessServiceConfiguration.shape.serviceClientIds);
  const configuredGrants = parseJson(config.COLLECTOR_INGESTION_GRANTS, grantSchema);
  const authenticator = new AccessServiceAuthenticator({
    issuer: config.ACCESS_TEAM_DOMAIN,
    audience: config.ACCESS_INGESTION_AUD,
    enabled: config.ACCESS_INGESTION_ENABLED === 'true',
    serviceClientIds,
  }, options);
  const instruments = new D1InstrumentRepository(config.INSTRUMENTS_DB);
  const quotations = new D1QuotationRepository(config.INSTRUMENTS_DB);
  const grants = configuredGrants.map(grant => ({ ...grant, subject: collectorSubject }));
  const service = new QuotationService(quotations, instruments, grants);
  return createAccessCollectorApp(authenticator, service);
}

const applications = new WeakMap<object, ReturnType<typeof createAccessCollectorWorker>>();
function unavailable(): Response {
  return Response.json({ type: 'about:blank', title: 'Service Unavailable', status: 503, code: 'ingestion_unavailable' }, {
    status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export default {
  async fetch(request: Request, env: AccessCollectorEnv): Promise<Response> {
    try {
      let app = applications.get(env);
      if (!app) {
        app = createAccessCollectorWorker(env);
        applications.set(env, app);
      }
      return await app.fetch(request);
    } catch {
      return unavailable();
    }
  },
} satisfies ExportedHandler<AccessCollectorEnv>;
