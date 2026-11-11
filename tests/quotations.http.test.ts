import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app';
import diagnosticWorker from '../src/index';
import { ApplicationError } from '../src/application/errors';
import type { Principal } from '../src/application/authorization';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse, validateOpenApi } from './helpers/openapi';
import { quotationFixture, quotationReader, quotationCollector, observation, unavailable, selector } from './helpers/quotations';

const query = new URLSearchParams(selector).toString();
const history = `/quotations?${query}&from=2026-11-09T00:00:00.000Z&to=2026-11-09T23:59:59.000Z`;
for (const kind of ['memory', 'd1'] as const) describe(`${kind} quotation REST/MCP over loopback`, () => {
  let f: Awaited<ReturnType<typeof quotationFixture>>;
  let server: Awaited<ReturnType<typeof startOAuthHttpFixture>>;
  let principal: Principal | null;
  beforeEach(async () => {
    f = await quotationFixture(kind); principal = quotationReader;
    server = await startOAuthHttpFixture(createApp({ quotations: { service: f.service, authenticate: async () => principal },
      mcp: { service: f.instrumentService, quotations: f.service, oauthScopes: [], authenticate: async () => {
        if (!principal) throw new ApplicationError(401, 'unauthenticated');
        return principal;
      }, challenge: () => 'Bearer' } }));
  }, 30000);
  afterEach(async () => { await server?.close(); await f?.dispose(); });
  async function send(path: string, init?: RequestInit) {
    const response = await fetch(`${server.url}/api/v1${path}`, init);
    const method = init?.method ?? 'GET';
    await assertContractResponse(method === 'DELETE' ? 'GET' : method, path, response);
    return response;
  }
  const ingest = (body: unknown = { observations: [observation()] }, key = 'http-batch') => send('/quotation-batches', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
  });

  it('validates OpenAPI and serves declared prices, statuses, failures and bounded history', async () => {
    validateOpenApi();
    const missing = await send(`/quotation-status?${query}`);
    expect(await missing.json()).toMatchObject({ quote: null, availability: 'missing' });
    principal = quotationCollector;
    const created = await ingest();
    expect(created.status).toBe(201);
    const original = await created.json();
    expect(await (await ingest()).json()).toEqual(original);
    expect((await ingest({ observations: [observation({ price: '1' })] })).status).toBe(409);
    await ingest({ observations: [unavailable()] }, 'failure');
    principal = quotationReader;
    const status = await send(`/quotation-status?${query}`);
    expect(await status.json()).toMatchObject({ quote: { price: '9007199254740993.12', source_price: '9007199254740993.1200' },
      last_attempt: { outcome: 'unavailable' }, last_successful_fetch_at: observation().fetched_at,
      freshness: { delivery: 'delayed', realtime_guaranteed: false } });
    expect(await (await send(history)).json()).toMatchObject({ data: [{ outcome: 'success' }], page: { next_cursor: null } });
  });

  it('enforces ingestion/read separation, strict queries and structured bounded errors', async () => {
    principal = null;
    expect((await send(`/quotation-status?${query}`)).status).toBe(401);
    principal = quotationReader;
    expect((await ingest()).status).toBe(403);
    principal = { subject: 'synthetic-admin', permissions: ['instruments:admin', 'portfolio:admin'] };
    expect((await ingest()).status).toBe(403);
    principal = quotationCollector;
    expect((await send(`/quotation-status?${query}`)).status).toBe(403);
    expect((await ingest({ observations: [observation({ provider: 'unapproved' })] })).status).toBe(403);
    expect((await ingest({ observations: [observation({ price: '0' })] })).status).toBe(422);
    expect((await send('/quotation-batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(400);
    const error = await ingest({ observations: [observation()], unknown: 'synthetic-private-marker' });
    expect(await error.text()).not.toContain('synthetic-private-marker');
    for (const [contentType, body, status] of [['text/plain', '{}', 415], ['application/json', '{', 400], ['application/json', 'x'.repeat(128 * 1024 + 1), 413]] as const) {
      expect((await send('/quotation-batches', { method: 'POST', headers: { 'Idempotency-Key': 'invalid', 'Content-Type': contentType }, body })).status).toBe(status);
    }
    principal = quotationReader;
    expect((await send(`/quotation-status?${query}`, { method: 'DELETE' })).status).toBe(405);
    expect((await send(`/quotation-status?${query}&provider=other`)).status).toBe(400);
    expect((await send(`/quotation-status?${query}&market_phase=open`)).status).toBe(400);
    expect((await send('/quotation-status')).status).toBe(400);
    expect((await send(history + '&limit=101')).status).toBe(400);
    expect((await send(`/quotation-status?${query}`, { headers: { Accept: 'text/html' } })).status).toBe(406);
    expect((await send(`/quotation-status?${query}`, { headers: { Origin: 'https://untrusted.invalid' } })).status).toBe(403);
  });

  it('uses the same services through official read-only MCP tools without ingestion tools', async () => {
    principal = quotationCollector; await ingest(); principal = quotationReader;
    const client = new Client({ name: 'synthetic-quotation-client', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url)));
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.find(tool => tool.name === 'get_quotation_status')?.annotations?.readOnlyHint).toBe(true);
      expect(tools.map(tool => tool.name)).not.toContain('ingest_quotations');
      expect((await client.callTool({ name: 'get_quotation_status', arguments: selector })).structuredContent).toEqual(await (await send(`/quotation-status?${query}`)).json());
      expect((await client.callTool({ name: 'list_quotations', arguments: { ...selector, from: '2026-11-09T00:00:00.000Z', to: '2026-11-09T23:59:59.000Z' } })).structuredContent).toEqual(await (await send(history)).json());
      expect((await client.callTool({ name: 'ingest_quotations', arguments: {} })).isError).toBe(true);
      principal = { subject: 'synthetic-limited', permissions: ['instruments:read'] };
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('get_quotation_status');
      expect((await client.callTool({ name: 'get_quotation_status', arguments: selector })).isError).toBe(true);
    } finally { await client.close(); }
  });
});

it('does not mount quotation routes in the diagnostic Worker', async () => {
  for (const path of ['/quotations', '/quotation-status', '/quotation-batches']) for (const method of ['GET', 'POST']) {
    expect((await diagnosticWorker.request(`/api/v1${path}`, { method })).status).toBe(404);
  }
});
