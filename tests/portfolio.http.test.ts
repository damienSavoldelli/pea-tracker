import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app';
import defaultWorker from '../src/index';
import { ApplicationError } from '../src/application/errors';
import type { Principal } from '../src/application/authorization';
import { openingStateSchema, positionPageSchema } from '../src/domain/portfolio';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse, validateOpenApi } from './helpers/openapi';
import { portfolioFixture, portfolioAdmin, portfolioReader, openingInput } from './helpers/portfolio';

for (const kind of ['memory', 'd1'] as const) describe(`${kind} real loopback portfolio REST/MCP`, () => {
  let f: Awaited<ReturnType<typeof portfolioFixture>>;
  let server: Awaited<ReturnType<typeof startOAuthHttpFixture>>;
  let principal: Principal | null;
  beforeEach(async () => {
    f = await portfolioFixture(kind);
    principal = portfolioAdmin;
    const app = createApp({ portfolio: { service: f.service, authenticate: async () => principal },
      mcp: { service: f.instrumentService, portfolio: f.service, authenticate: async () => {
        if (!principal) throw new ApplicationError(401, 'unauthenticated');
        return principal;
      }, challenge: () => 'Bearer' } });
    server = await startOAuthHttpFixture(app);
  }, 30000);
  afterEach(async () => { await server?.close(); await f?.dispose(); });

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${server.url}/api/v1/portfolio${path}`, init);
    // Unsupported methods share the documented GET error representation.
    await assertContractResponse(init?.method === 'DELETE' ? 'GET' : init?.method ?? 'GET', `/api/v1/portfolio${path}`, response);
    return response;
  }
  const post = (body: unknown = openingInput(), version = '"0"', key = 'http-opening') => request('/opening-state', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': version, 'Idempotency-Key': key }, body: JSON.stringify(body),
  });

  it('implements documented creation, replay, correction, history and paginated reads over HTTP', async () => {
    validateOpenApi();
    expect((await request('/positions')).status).toBe(404);
    const response = await post();
    expect(response.status).toBe(201);
    expect(response.headers.get('ETag')).toBe('"1"');
    const initial = await response.json();
    expect(await (await post()).json()).toEqual(initial);
    expect((await post({ ...openingInput(), cash: null })).status).toBe(409);
    const page = positionPageSchema.parse(await (await request('/positions?limit=1')).json());
    expect(page.data).toHaveLength(1);
    expect((await post({ ...openingInput(), correction_reason: 'Synthetic replacement', positions: [] }, '"1"', 'correction')).status).toBe(201);
    expect(await (await request('/opening-state/revisions/1')).json()).toEqual(initial);
    expect(openingStateSchema.parse(await (await request('/opening-state')).json()).revision).toBe(2);
    expect(positionPageSchema.parse(await (await request('/positions')).json()).data).toEqual([]);
    const next = positionPageSchema.parse(await (await request(`/positions?cursor=${page.page.next_cursor}`)).json());
    expect(next.revision).toBe(1);
    expect(next.data).toHaveLength(1);
    expect((await post({ ...openingInput(), correction_reason: 'Synthetic stale' }, '"1"', 'stale')).status).toBe(412);
  });

  it('enforces HTTP boundaries before business writes and does not return request values in errors', async () => {
    principal = null;
    expect((await request('/opening-state')).status).toBe(401);
    principal = portfolioReader;
    expect((await post()).status).toBe(403);
    principal = { subject: 'synthetic-collector', permissions: ['quotes:ingest'] };
    expect((await request('/positions')).status).toBe(403);
    principal = portfolioAdmin;
    expect((await request('/opening-state', { method: 'DELETE' })).status).toBe(405);
    expect((await request('/opening-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(428);
    expect((await post(openingInput(), 'W/"0"')).status).toBe(400);
    expect((await request('/positions?limit=1&limit=2')).status).toBe(400);
    expect((await request('/positions?limit=101')).status).toBe(400);
    expect((await request('/positions?as_of=2020')).status).toBe(400);
    expect((await request('/opening-state/revisions/01')).status).toBe(400);
    expect((await request('/positions', { headers: { Accept: 'text/html' } })).status).toBe(406);
    expect((await request('/positions', { headers: { Origin: 'https://untrusted.invalid' } })).status).toBe(403);
    const rejected = await post({ ...openingInput(), private_unexpected_field: 'synthetic-sensitive-marker' });
    expect(rejected.status).toBe(422);
    expect(await rejected.text()).not.toContain('synthetic-sensitive-marker');
    for (const [contentType, body, expected] of [['text/plain', '{}', 415], ['application/json', '{', 400], ['application/json', 'x'.repeat(128 * 1024 + 1), 413]] as const) {
      expect((await request('/opening-state', { method: 'POST', headers: { 'If-Match': '"0"', 'Idempotency-Key': 'invalid', 'Content-Type': contentType }, body })).status).toBe(expected);
    }
  });

  it('shares read results with official MCP tools and never exposes a portfolio write tool', async () => {
    await post();
    principal = portfolioReader;
    const client = new Client({ name: 'synthetic-positions-client', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url)));
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map(tool => tool.name)).toContain('get_positions');
      expect(tools.find(tool => tool.name === 'get_positions')?.annotations?.readOnlyHint).toBe(true);
      expect((await client.callTool({ name: 'get_positions', arguments: {} })).structuredContent).toEqual(await (await request('/positions')).json());
      expect((await client.callTool({ name: 'get_opening_state', arguments: { revision: 1 } })).structuredContent).toEqual(await (await request('/opening-state/revisions/1')).json());
      expect((await client.callTool({ name: 'append_opening_state', arguments: {} })).isError).toBe(true);
      principal = { subject: 'synthetic-limited', permissions: ['instruments:read'] };
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('get_positions');
      expect((await client.callTool({ name: 'get_positions', arguments: {} })).isError).toBe(true);
    } finally { await client.close(); }
  });
});

describe('default Worker isolation', () => {
  it('keeps new portfolio routes absent from the deployed diagnostic composition', async () => {
    for (const path of ['/api/v1/portfolio/positions', '/api/v1/portfolio/opening-state']) {
      expect((await defaultWorker.request(path)).status).toBe(404);
      expect((await defaultWorker.request(path, { method: 'POST' })).status).toBe(404);
    }
  });
});
