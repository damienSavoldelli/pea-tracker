import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startOAuthWorker } from './helpers/oauth-workerd.mjs';
import { syntheticInput } from './helpers/instruments';
import { assertContractResponse } from './helpers/openapi';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

describe('native workerd OAuth security composition', () => {
  let worker: Awaited<ReturnType<typeof startOAuthWorker>>;
  beforeAll(async () => { worker = await startOAuthWorker(); }, 30000);
  afterAll(async () => { await worker?.close(); });
  async function token(kind: 'admin' | 'mcp') {
    return (await (await fetch(`${worker.url}/__synthetic/${kind}-token`)).json() as { token: string }).token;
  }
  it('verifies RS256 signatures/JWKS in real Worker runtime and denies unauthorized HTTP', async () => {
    const denied = await fetch(`${worker.url}/api/v1/instruments`);
    expect(denied.status).toBe(401);
    await assertContractResponse('GET', '/api/v1/instruments', denied);
    const admin = await token('admin');
    const created = await fetch(`${worker.url}/api/v1/instruments`, { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'native-oauth' }, body: JSON.stringify(syntheticInput) });
    expect(created.status).toBe(201);
    await assertContractResponse('POST', '/api/v1/instruments', created);
    const crossed = await fetch(`${worker.url}/api/v1/instruments`, { method: 'POST', headers: { Authorization: `Bearer ${await token('mcp')}` }, body: '{}' });
    expect(crossed.status).toBe(401);
    const parts = admin.split('.');
    parts[2] = `${parts[2]?.[0] === 'A' ? 'B' : 'A'}${parts[2]?.slice(1)}`;
    expect((await fetch(`${worker.url}/api/v1/instruments`, { headers: { Authorization: `Bearer ${parts.join('.')}` } })).status).toBe(401);
  });
  it('runs protected official MCP SDK initialization, read tools and diagnostic ping in workerd', async () => {
    const client = new Client({ name: 'native-oauth-fixture', version: '1.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', worker.url), { requestInit: { headers: { Authorization: `Bearer ${await token('mcp')}` } } }));
      expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual(['get_instrument', 'list_instruments', 'ping']);
      expect((await client.callTool({ name: 'list_instruments', arguments: {} })).isError).not.toBe(true);
      expect((await client.callTool({ name: 'ping' })).structuredContent).toMatchObject({ status: 'ok' });
    } finally { await client.close(); }
    expect((await fetch(`${worker.url}/api/v1/health`)).status).toBe(200);
  });
});
