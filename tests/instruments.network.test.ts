import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { instrumentSchema } from '../src/domain/instruments';
import { probeLocalRequest, startLocalInstrumentServer, type LocalInstrumentServer } from './helpers/instruments-http-server.mjs';
import { syntheticInput } from './helpers/instruments';
import { assertContractResponse } from './helpers/openapi';

describe('real loopback HTTP instrument workflow', () => {
  const servers: LocalInstrumentServer[] = [];
  let admin: LocalInstrumentServer;
  beforeAll(async () => { admin = await startLocalInstrumentServer({ principal: 'admin' }); servers.push(admin); });
  afterAll(async () => { await Promise.all(servers.map(server => server.close())); });
  const send = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${admin.url}${path}`, { method, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await assertContractResponse(method, path, response.clone());
    return response;
  };

  it('binds IPv4 loopback and validates real create/get/list/update/replay responses against OpenAPI', async () => {
    expect(admin.address.address).toBe('127.0.0.1');
    const created = await send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'network' });
    expect(created.status).toBe(201);
    const record = instrumentSchema.parse(await created.json());
    expect(created.headers.get('Location')).toBe(`/api/v1/instruments/${record.id}`);
    expect(await (await send('GET', `/api/v1/instruments/${record.id}`)).json()).toEqual(record);
    const list = await send('GET', '/api/v1/instruments?limit=1');
    expect(list.status).toBe(200);
    const updated = await send('PATCH', `/api/v1/instruments/${record.id}`, { active: false }, { 'If-Match': '"1"' });
    expect(updated.headers.get('ETag')).toBe('"2"');
    expect((await send('PATCH', `/api/v1/instruments/${record.id}`, { active: true }, { 'If-Match': '"1"' })).status).toBe(412);
    const replay = await send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'network' });
    expect(await replay.json()).toEqual(record);
    expect((await send('POST', '/api/v1/instruments', { ...syntheticInput, name: 'Different synthetic name' }, { 'Idempotency-Key': 'network' })).status).toBe(409);
  });

  it('validates representative negative HTTP responses against the contract', async () => {
    expect((await send('GET', '/api/v1/instruments?limit=0')).status).toBe(400);
    expect((await send('POST', '/api/v1/instruments', { ...syntheticInput, isin: 'ZZ0000000000' }, { 'Idempotency-Key': 'bad-isin' })).status).toBe(422);
    expect((await send('POST', '/api/v1/instruments', syntheticInput)).status).toBe(400);
    expect((await send('POST', '/api/v1/instruments', syntheticInput, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await send('POST', '/api/v1/instruments', { name: 'x'.repeat(17000) }, { 'Idempotency-Key': 'oversized' })).status).toBe(413);
    expect((await send('GET', '/api/v1/instruments', undefined, { Accept: 'text/plain' })).status).toBe(406);
  });

  it('handles concurrent HTTP retries and version conflicts atomically', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'concurrent-http' })));
    const records = await Promise.all(results.map(response => response.json()));
    for (const record of records) expect(record).toEqual(records[0]);
    const record = instrumentSchema.parse(records[0]);
    const updates = await Promise.all([true, false].map(active => send('PATCH', `/api/v1/instruments/${record.id}`, { active }, { 'If-Match': '"1"' })));
    expect(updates.map(response => response.status).sort()).toEqual([200, 412]);
  });

  it('continues bounded pages through real query-string cursors', async () => {
    for (let i = 0; i < 3; i++) await send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': `pagination-${i}` });
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const query = cursor === null ? '?limit=2' : `?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const page = await (await send('GET', `/api/v1/instruments${query}`)).json() as { data: { id: string }[]; page: { next_cursor: string | null } };
      expect(page.data.length).toBeLessThanOrEqual(2);
      ids.push(...page.data.map(record => record.id));
      cursor = page.page.next_cursor;
      if (cursor) expect((await send('GET', `/api/v1/instruments?active=true&cursor=${cursor}`)).status).toBe(400);
      if (ids.length > 20) throw new Error('Pagination did not terminate');
    } while (cursor);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toEqual([...new Set(ids)].sort());
  });

  it('fixes synthetic principals per server; headers cannot elevate anonymous/read/collector fixtures', async () => {
    for (const principal of ['anonymous', 'reader', 'collector'] as const) {
      const server = await startLocalInstrumentServer({ principal }); servers.push(server);
      const response = await fetch(`${server.url}/api/v1/instruments`, { method: 'POST', headers: { Authorization: 'Bearer synthetic-admin', 'X-Role': 'admin', 'X-Principal': 'admin', 'Content-Type': 'application/json', 'Idempotency-Key': 'denied' }, body: JSON.stringify(syntheticInput) });
      await assertContractResponse('POST', '/api/v1/instruments', response.clone());
      expect(response.status).toBe(principal === 'anonymous' ? 401 : 403);
      if (principal === 'anonymous') expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });

  it('blocks browser cross-site requests and untrusted Host headers', async () => {
    for (const headers of [{ Origin: 'https://untrusted.invalid' }, { Host: 'untrusted.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      expect(await probeLocalRequest(`${admin.url}/api/v1/instruments`, headers)).toBe(403);
    }
  });

  it('preserves real HTTP health and official MCP initialization/discovery/ping', async () => {
    const health = await fetch(`${admin.url}/api/v1/health`);
    await assertContractResponse('GET', '/api/v1/health', health.clone());
    expect(await health.json()).toEqual({ status: 'ok', service: 'pea-tracker', version: '0.1.0' });
    const client = new Client({ name: 'synthetic-loopback-test', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', admin.url)));
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['ping']);
      expect((await client.callTool({ name: 'ping' })).structuredContent).toMatchObject({ status: 'ok', service: 'pea-tracker', version: '0.1.0' });
    } finally { await client.close(); }
  });
});
