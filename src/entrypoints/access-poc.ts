import { z } from 'zod';
import { AccessAuthenticator } from '../adapters/auth/access-authenticator';
import { MemoryInstrumentRepository } from '../adapters/memory/instruments';
import { InstrumentService } from '../application/instruments';
import { instrumentSchema } from '../domain/instruments';
import { createApp } from '../app';

export async function createAccessPocApp(authenticator: AccessAuthenticator) {
  const repository = new MemoryInstrumentRepository();
  const record = instrumentSchema.parse({ id: '00000000-0000-4000-8000-000000000001',
    name: 'Synthetic Access PoC ETF', kind: 'etf', quote_currency: 'EUR', price_unit: 'currency_unit',
    version: 1, created_at: '2026-11-09T00:00:00.000Z', updated_at: '2026-11-09T00:00:00.000Z' });
  await repository.create(record, { subject: 'bootstrap:synthetic-access-poc', key: 'synthetic-seed', canonicalInput: JSON.stringify(record) });
  return createApp({ mcp: { service: new InstrumentService(repository),
    authenticate: request => authenticator.authenticate(request), challenge: () => 'Bearer', oauthScopes: [] } });
}

const environmentSchema = z.object({
  ACCESS_TEAM_DOMAIN: z.string().min(1), ACCESS_AUD: z.string().min(1), ACCESS_OWNER_SUB: z.string().min(1),
});
let cached: { key: string; app: ReturnType<typeof createAccessPocApp> } | undefined;
export default {
  async fetch(request: Request, environment: unknown): Promise<Response> {
    try {
      const env = environmentSchema.parse(environment);
      const key = JSON.stringify(env);
      if (!cached || cached.key !== key) cached = { key, app: createAccessPocApp(new AccessAuthenticator({
        issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD, ownerSubject: env.ACCESS_OWNER_SUB,
      })) };
      return await (await cached.app).fetch(request);
    } catch {
      return Response.json({ type: 'about:blank', title: 'Service Unavailable', status: 503, code: 'poc_unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
  },
};
