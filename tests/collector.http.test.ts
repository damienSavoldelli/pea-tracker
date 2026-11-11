import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCollectorApp } from '../src/collector-app';
import { QuotationService } from '../src/application/quotations';
import { authFixture } from './helpers/auth-fixtures';
import { quotationFixture, selector, unavailable } from './helpers/quotations';
import { firstId, secondId } from './helpers/portfolio';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse } from './helpers/openapi';
import { collectorPythonAvailable, collectorProcess } from './helpers/collector-process.mjs';

for (const kind of ['memory', 'd1'] as const) describe.skipIf(!collectorPythonAvailable)(`${kind} Python collector to JWT-protected Hono ingestion`, () => {
  let f: Awaited<ReturnType<typeof quotationFixture>>;
  let auth: Awaited<ReturnType<typeof authFixture>>;
  let server: Awaited<ReturnType<typeof startOAuthHttpFixture>>;
  let process: Awaited<ReturnType<typeof collectorProcess>>;
  let service: QuotationService;
  beforeEach(async () => {
    f = await quotationFixture(kind); auth = await authFixture();
    process = await collectorProcess();
    service = new QuotationService(f.repository, f.instruments, [{ subject: 'collector:synthetic', provider: 'yahoo', instrument_ids: [firstId, secondId] }]);
    const app = createCollectorApp(auth.verifier, service);
    // Assert the actual existing OpenAPI contract before returning to Python.
    const request = app.request.bind(app);
    server = await startOAuthHttpFixture({ request: async (req: Request) => {
      const response = await request(req);
      if (new URL(req.url).pathname === '/api/v1/quotation-batches') await assertContractResponse(req.method, '/api/v1/quotation-batches', response);
      return response;
    } });
  }, 30000);
  afterEach(async () => { await server?.close(); await f?.dispose(); await process?.close(); });
  const machine = () => auth.token({ sub: 'synthetic-machine', aud: auth.policy.collector.audience, azp: 'synthetic-collector', scope: 'quotes:ingest' });
  function execute(token: string, cycle = 'synthetic-cross-language') {
    return process.execute(token, server.url, cycle);
  }
  it('normalizes synthetic prices through Python, verifies machine JWT and replays original persisted outcomes', async () => {
    const token = await machine();
    const first = await execute(token); const replay = await execute(token);
    expect(first.code).toBe(0); expect(replay.code).toBe(0);
    expect(first.stderr).toBe(''); expect(first.stdout).not.toContain(token);
    for (const path of ['/api/v1/quotation-status', '/api/v1/quotations', '/api/v1/portfolio/positions', '/api/v1/instruments']) {
      expect((await fetch(server.url + path, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
    }
    const status = await service.status({ subject: 'synthetic-reader', permissions: ['quotes:read'] }, { ...selector, provider: 'yahoo' });
    expect(status.quote).toMatchObject({ price: '12.34', source_price: '12.3400', provider: 'yahoo', currency: 'EUR', price_unit: 'currency_unit' });
    expect(status.freshness.status).toBe('unknown');
    const original = status.quote;
    await service.ingest({ subject: 'collector:synthetic', permissions: ['quotes:ingest'] }, { observations: [unavailable({ provider: 'yahoo', fetched_at: new Date().toISOString() })] }, 'synthetic-provider-failure');
    expect((await service.status({ subject: 'synthetic-reader', permissions: ['quotes:read'] }, { ...selector, provider: 'yahoo' })).quote).toEqual(original);
    expect((await execute(token)).code).toBe(0);
    if (f.local) expect((await f.local.db.prepare('SELECT count(*) n FROM quotation_observations WHERE outcome = ?').bind('success').first('n'))).toBe(2);
  });
  it('rejects interactive REST/MCP tokens and machine subject/scope escalation without creating quotations', async () => {
    const tokens = [await auth.token(), await auth.token({ aud: auth.policy.mcp.audience, azp: 'synthetic-mcp', scope: 'mcp:read portfolio:read' }),
      await auth.token({ aud: auth.policy.collector.audience, azp: 'synthetic-collector', scope: 'quotes:ingest' }),
      await auth.token({ aud: auth.policy.collector.audience, sub: 'synthetic-machine', azp: 'synthetic-collector', scope: 'portfolio:admin' }),
      await auth.token({ aud: auth.policy.collector.audience, sub: 'synthetic-machine', azp: 'synthetic-collector', scope: 'quotes:ingest', exp: Math.floor(1794146400000 / 1000) - 60 })];
    for (const token of tokens) {
      const result = await execute(token);
      expect(result.code).toBe(1); expect(result.stderr).toBe(''); expect(result.stdout).not.toContain(token);
    }
    expect((await f.repository.snapshot({ ...selector, provider: 'yahoo' })).quote).toBeNull();
  });
});
