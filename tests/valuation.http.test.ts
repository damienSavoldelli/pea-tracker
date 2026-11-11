import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app';
import diagnosticWorker from '../src/index';
import { ApplicationError } from '../src/application/errors';
import type { Principal } from '../src/application/authorization';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse, validateOpenApi } from './helpers/openapi';
import { valuationFixture, valuationReader, valuationSelection } from './helpers/valuation';
import { quotationCollector } from './helpers/quotations';

const path = '/api/v1/portfolio/valuation';
const query = new URLSearchParams(valuationSelection).toString();
for (const kind of ['memory', 'd1'] as const) describe(`${kind} valuation real HTTP and SDK`, () => {
  let f: Awaited<ReturnType<typeof valuationFixture>>;
  let server: Awaited<ReturnType<typeof startOAuthHttpFixture>>;
  let principal: Principal | null;
  beforeEach(async () => {
    f = await valuationFixture(kind); principal = valuationReader;
    server = await startOAuthHttpFixture(createApp({ portfolio: { service: f.portfolio, authenticate: () => principal },
      valuation: { service: f.valuation, authenticate: () => principal },
      mcp: { service: f.instrumentService, valuation: f.valuation, oauthScopes: [], authenticate: async () => {
        if (!principal) throw new ApplicationError(401, 'unauthenticated');
        return principal;
      }, challenge: () => 'Bearer' } }));
  }, 30000);
  afterEach(async () => { await server?.close(); await f?.dispose(); });
  async function get(suffix = `?${query}`, init?: RequestInit) {
    const response = await fetch(server.url + path + suffix, init);
    await assertContractResponse('GET', path, response);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    return response;
  }

  it('validates the OpenAPI response for missing, partial, full and unknown-cash coverage', async () => {
    validateOpenApi();
    expect(await (await get()).json()).toMatchObject({ portfolio_total: null, coverage: { not_valued: 2 } });
    await f.seed();
    const response = await get(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ portfolio_total: { exact: '12.31', display: '12.31' }, estimate: true, realtime_guaranteed: false });
    await f.portfolio.append({ subject: 'synthetic-admin', permissions: ['portfolio:admin'] }, { ...f.input, cash: null, correction_reason: 'Synthetic unknown cash' }, 1, 'http-cash');
    expect(await (await get()).json()).toMatchObject({ portfolio_total: null, cash: { status: 'unknown' } });
    expect(await (await get(`?${query}&revision=1`)).json()).toMatchObject({ portfolio_total: { exact: '12.31' } });
  });
  it('denies unauthorized reads/mutations and rejects malformed selectors without leaking input', async () => {
    principal = null; const anonymous = await get(); expect(anonymous.status).toBe(401); expect(anonymous.headers.get('WWW-Authenticate')).toBe('Bearer');
    for (const denied of [quotationCollector, { subject: 'synthetic-admin', permissions: ['portfolio:admin'] }, { subject: 'synthetic-read', permissions: ['portfolio:read'] }]) {
      principal = denied as Principal; expect((await get()).status).toBe(403);
    }
    principal = valuationReader;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await get(`?${query}`, { method }); expect(response.status).toBe(405); expect(response.headers.get('Allow')).toBe('GET');
    }
    for (const suffix of ['', '?provider=synthetic', `?${query}&provider=other`, `?${query}&revision=0`, `?${query}&revision=9007199254740992`, `?${query}&as_of=2026-11-09`, `?${query}&market_phase=open`]) expect((await get(suffix)).status).toBe(400);
    expect((await get(`?${query}&revision=999`)).status).toBe(404);
    expect((await get(`?${query}`, { headers: { Accept: 'text/html' } })).status).toBe(406);
    expect((await get(`?${query}`, { headers: { Origin: 'https://synthetic-untrusted.invalid' } })).status).toBe(403);
    expect(await (await get(`?${query}&private_marker=synthetic-no-echo`)).text()).not.toContain('synthetic-no-echo');
  });
  it('returns the same calculation through official MCP SDK, with read-only policy and no mutations', async () => {
    await f.seed();
    const client = new Client({ name: 'synthetic-valuation-client', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url)));
    try {
      const tool = (await client.listTools()).tools.find(tool => tool.name === 'get_portfolio_valuation');
      expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect((await client.callTool({ name: 'get_portfolio_valuation', arguments: valuationSelection })).structuredContent).toEqual(await (await get()).json());
      expect((await client.callTool({ name: 'get_portfolio_valuation', arguments: { ...valuationSelection, as_of: 'rejected' } })).isError).toBe(true);
      principal = { subject: 'synthetic-instruments-only', permissions: ['instruments:read', 'portfolio:read'] };
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('get_portfolio_valuation');
      expect((await client.callTool({ name: 'get_portfolio_valuation', arguments: valuationSelection })).isError).toBe(true);
    } finally { await client.close(); }
  });
});

it('keeps the diagnostic Worker without valuation routes or tools', async () => {
  for (const method of ['GET', 'POST']) expect((await diagnosticWorker.request(`${path}?${query}`, { method })).status).toBe(404);
});

it('distinguishes uninitialized holdings from a known empty portfolio', async () => {
  const f = await valuationFixture('memory', false);
  try { await expect(f.valuation.get(valuationReader, valuationSelection)).rejects.toMatchObject({ status: 404, code: 'opening_state_not_found' }); }
  finally { await f.dispose(); }
});
