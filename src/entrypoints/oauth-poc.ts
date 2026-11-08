import { z } from 'zod';
import { auth0PocVerifier } from '../adapters/auth/auth0-poc';
import { MemoryInstrumentRepository } from '../adapters/memory/instruments';
import { InstrumentService } from '../application/instruments';
import { instrumentSchema } from '../domain/instruments';
import { createProtectedApp } from '../protected-app';

// Disposable synthetic composition of the same backend. No test token issuer,
// synthetic signing keys, D1, environment files or fixed request principal.
export async function createOAuthPocApp(config: unknown, fetcher: typeof fetch = fetch) {
  const verifier = auth0PocVerifier(config, fetcher);
  const repository = new MemoryInstrumentRepository();
  const record = instrumentSchema.parse({ id: '00000000-0000-4000-8000-000000000001',
    name: 'Synthetic OAuth PoC ETF', kind: 'etf', quote_currency: 'EUR', price_unit: 'currency_unit',
    version: 1, created_at: '2026-11-08T00:00:00.000Z', updated_at: '2026-11-08T00:00:00.000Z' });
  await repository.create(record, { subject: 'bootstrap:synthetic-auth0-poc', key: 'synthetic-seed', canonicalInput: JSON.stringify(record) });
  return createProtectedApp(verifier, new InstrumentService(repository));
}

// Only initialization of local memory is shared. JWKS network work stays inside
// authenticated request handling through the existing bounded provider.
let cached: { config: string; app: ReturnType<typeof createOAuthPocApp> } | undefined;
export default {
  async fetch(request: Request, environment: unknown): Promise<Response> {
    try {
      const { OAUTH_POC_CONFIG: config } = z.object({ OAUTH_POC_CONFIG: z.string().min(1).max(8192) }).parse(environment);
      if (!cached || cached.config !== config) cached = { config, app: createOAuthPocApp(JSON.parse(config)) };
      return await (await cached.app).fetch(request);
    } catch {
      return Response.json({ type: 'about:blank', title: 'Service Unavailable', status: 503, code: 'poc_unavailable' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
  },
};
