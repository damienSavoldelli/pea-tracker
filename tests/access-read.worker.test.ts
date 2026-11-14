import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker, { createAccessReadApp, createAccessReadWorker } from '../src/entrypoints/access-read';
import { ApplicationError } from '../src/application/errors';
import { accessConfig, accessFixture } from './helpers/access-fixtures';
import { quotationFixture, quotationCollector, observation, selector } from './helpers/quotations';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse, validateOpenApi } from './helpers/openapi';

describe('owner-only D1 quotation reader', () => {
  let f: Awaited<ReturnType<typeof quotationFixture>>;
  let auth: Awaited<ReturnType<typeof accessFixture>>;
  let env: Parameters<typeof createAccessReadWorker>[0];
  let app: ReturnType<typeof createAccessReadWorker>;
  const query = new URLSearchParams(selector).toString();
  const statusPath = `/api/v1/quotation-status?${query}`;
  const historyInput = { ...selector, from: '2026-11-09T00:00:00.000Z', to: '2026-11-09T23:59:59.000Z' };

  beforeAll(async () => {
    f = await quotationFixture('d1');
    await f.service.ingest(quotationCollector, { observations: [observation()] }, 'synthetic-read-seed');
    auth = await accessFixture();
    env = { INSTRUMENTS_DB: f.local!.db, ACCESS_TEAM_DOMAIN: accessConfig.issuer,
      ACCESS_READ_AUD: accessConfig.audience, ACCESS_OWNER_SUB: accessConfig.ownerSubject, ACCESS_READ_ENABLED: 'true' };
    app = createAccessReadWorker(env, { fetch: auth.keys });
  }, 30000);
  afterAll(async () => { await f?.dispose(); });

  async function request(path: string, assertion?: string, method = 'GET') {
    return app.fetch(new Request(`https://synthetic-read.invalid${path}`, { method,
      headers: assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {} }));
  }

  it('serves native D1 catalog, quote status and history with existing REST contracts', async () => {
    validateOpenApi();
    const token = await auth.token();
    for (const path of ['/api/v1/instruments', `/api/v1/instruments/${selector.instrument_id}`, statusPath,
      `/api/v1/quotations?${new URLSearchParams(historyInput)}`]) {
      const response = await request(path, token);
      expect(response.status).toBe(200);
      await assertContractResponse('GET', path, response);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(await (await request(statusPath, token)).json()).toMatchObject({
      selector, availability: 'available', quote: { price: '9007199254740993.12', source_price: observation().price,
        currency: 'EUR', price_unit: 'currency_unit', market_timestamp: observation().market_timestamp,
        fetched_at: observation().fetched_at, provenance: observation().provenance },
      market_context: { phase: 'unknown' }, freshness: { realtime_guaranteed: false },
    });
  });

  it('reads the persisted quote through the official MCP SDK over real loopback HTTP', async () => {
    const server = await startOAuthHttpFixture(app);
    const client = new Client({ name: 'synthetic-d1-owner-reader', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url), {
        requestInit: { headers: { 'Cf-Access-Jwt-Assertion': await auth.token({ scope: 'quotes:ingest instruments:admin' }) } },
      }));
      const tools = (await client.listTools()).tools;
      expect(tools.map(tool => tool.name).sort()).toEqual(['get_instrument', 'get_quotation_status', 'list_instruments', 'list_quotations', 'ping']);
      expect(tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
      expect((await client.callTool({ name: 'get_quotation_status', arguments: selector })).structuredContent)
        .toMatchObject({ quote: { price: '9007199254740993.12' }, selector });
      expect((await client.callTool({ name: 'list_quotations', arguments: historyInput })).structuredContent)
        .toMatchObject({ data: [{ instrument_id: selector.instrument_id, price: '9007199254740993.12' }], page: { next_cursor: null } });
      expect((await client.callTool({ name: 'ingest_quotations', arguments: {} })).isError).toBe(true);
    } finally { await client.close(); await server.close(); }
  });

  it('denies absent, wrong-issuer, wrong-audience, expired, forged and non-owner assertions before D1 access', async () => {
    const prepare = vi.spyOn(f.local!.db, 'prepare');
    try {
      const assertions = [undefined, await auth.token({ iss: 'https://other.cloudflareaccess.com' }),
        await auth.token({ aud: 'b'.repeat(64) }), await auth.token({ exp: 1 }),
        await auth.token({}, { kid: 'synthetic-key-1' }, true), await auth.token({ sub: 'synthetic-other-owner' }),
        await auth.token({ sub: '', common_name: 'synthetic-machine.access' })];
      for (const token of assertions) {
        for (const path of [statusPath, '/api/v1/instruments', '/mcp']) {
          expect([401, 403]).toContain((await request(path, token, path === '/mcp' ? 'POST' : 'GET')).status);
        }
      }
      expect(prepare).not.toHaveBeenCalled();
    } finally { prepare.mockRestore(); }
  });

  it('does not mount ingestion, administration, portfolio, health or OAuth token routes', async () => {
    const token = await auth.token({ scope: 'quotes:ingest instruments:admin portfolio:admin' });
    for (const [path, method] of [['/api/v1/quotation-batches', 'POST'], ['/api/v1/instruments', 'POST'],
      [`/api/v1/instruments/${selector.instrument_id}`, 'PATCH'], ['/api/v1/portfolio/positions', 'GET'],
      ['/api/v1/health', 'GET'], ['/oauth/token', 'POST']] as const) {
      expect((await request(path, token, method)).status).toBe(404);
    }
    expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(1);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_batch_outcomes').first('n')).toBe(1);
  });

  it('requires quotes:read at the REST service and MCP tool boundary', async () => {
    const limited = createAccessReadApp(f.instrumentService, f.service, async () => ({ subject: 'synthetic-limited', permissions: ['instruments:read'] }));
    const denied = await limited.fetch(new Request(`https://synthetic-read.invalid${statusPath}`));
    expect(denied.status).toBe(403);
    await assertContractResponse('GET', statusPath, denied);
    const server = await startOAuthHttpFixture(limited);
    const client = new Client({ name: 'synthetic-limited-reader', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url)));
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('get_quotation_status');
      expect((await client.callTool({ name: 'get_quotation_status', arguments: selector })).isError).toBe(true);
    } finally { await client.close(); await server.close(); }
    await expect(f.service.status(null, selector)).rejects.toBeInstanceOf(ApplicationError);
  });

  it.each([{}, { ACCESS_READ_AUD: 'invalid' }, { ACCESS_OWNER_SUB: '' }, { ACCESS_TEAM_DOMAIN: 'http://untrusted.invalid' },
    { ACCESS_READ_ENABLED: 'false' }, { INSTRUMENTS_DB: undefined }])('fails closed for absent, invalid or disabled configuration %j', async patch => {
    const broken = Object.keys(patch).length ? { ...env, ...patch } : {};
    for (const path of ['/mcp', statusPath, '/api/v1/health']) {
      const response = await worker.fetch(new Request(`https://synthetic-read.invalid${path}`), broken as typeof env);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: 'read_unavailable' });
    }
  });

  it('reuses the JWKS cache within one environment and isolates authorization settings between environments', async () => {
    const keys = vi.fn(auth.keys);
    vi.stubGlobal('fetch', keys);
    try {
      const read = (environment: typeof env) => worker.fetch(new Request(`https://synthetic-read.invalid${statusPath}`,
        { headers: { 'Cf-Access-Jwt-Assertion': token } }), environment);
      const token = await auth.token();
      expect((await read(env)).status).toBe(200);
      expect((await read(env)).status).toBe(200);
      expect(keys).toHaveBeenCalledTimes(1);
      expect((await read({ ...env, ACCESS_READ_AUD: 'b'.repeat(64) })).status).toBe(401);
      expect((await read({ ...env, ACCESS_OWNER_SUB: 'synthetic-other-owner' })).status).toBe(403);
    } finally { vi.unstubAllGlobals(); }
  });
});
