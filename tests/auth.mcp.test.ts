import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProtectedApp } from '../src/protected-app';
import { InstrumentService } from '../src/application/instruments';
import { MemoryInstrumentRepository } from '../src/adapters/memory/instruments';
import { authFixture } from './helpers/auth-fixtures';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { syntheticInput } from './helpers/instruments';
import { admin } from './helpers/instruments';

describe('protected MCP signed-token workflow', () => {
  let f: Awaited<ReturnType<typeof authFixture>>;
  let server: Awaited<ReturnType<typeof startOAuthHttpFixture>>;
  let token: string;
  const repository = new MemoryInstrumentRepository();
  const service = new InstrumentService(repository);
  beforeAll(async () => {
    f = await authFixture();
    token = await f.token({ aud: f.policy.mcp.audience, azp: 'synthetic-mcp', scope: 'mcp:read portfolio:read' });
    await service.create(admin, syntheticInput, 'mcp-seed');
    server = await startOAuthHttpFixture(createProtectedApp(f.verifier, service));
  });
  afterAll(async () => { await server?.close(); });
  async function connect(bearer = token) {
    const client = new Client({ name: 'synthetic-oauth-test', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
    return client;
  }
  it('challenges the whole transport before protocol processing, including GET and notifications', async () => {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const response = await fetch(`${server.url}/mcp`, { method });
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toContain('/oauth-protected-resource/mcp');
    }
  });
  it('uses official SDK initialize/list/read/ping without registering mutation tools', async () => {
    const client = await connect();
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map(tool => tool.name).sort()).toEqual(['get_instrument', 'list_instruments', 'ping']);
      expect(tools.find(tool => tool.name === 'list_instruments')?._meta).toMatchObject({ securitySchemes: [{ type: 'oauth2', scopes: ['mcp:read', 'portfolio:read'] }] });
      expect((await client.callTool({ name: 'list_instruments', arguments: {} })).structuredContent).toMatchObject({ data: [{ name: syntheticInput.name }] });
      expect((await client.callTool({ name: 'ping' })).structuredContent).toMatchObject({ status: 'ok', service: 'pea-tracker' });
      expect((await client.callTool({ name: 'create_instrument', arguments: syntheticInput })).isError).toBe(true);
    } finally { await client.close(); }
  });
  it('denies REST admin tokens and missing MCP scopes, with no read service access', async () => {
    const list = vi.spyOn(repository, 'list');
    for (const bearer of [await f.token(), await f.token({ aud: f.policy.mcp.audience, azp: 'synthetic-mcp', scope: 'portfolio:read' })]) {
      const response = await fetch(`${server.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: '{}' });
      expect([401, 403]).toContain(response.status);
    }
    expect(list).not.toHaveBeenCalled(); list.mockRestore();
  });
  it('isolates concurrent authorized calls from invalid or admin-only clients', async () => {
    const good = await connect();
    try {
      const [allowed, denied] = await Promise.all([
        good.callTool({ name: 'list_instruments', arguments: {} }),
        fetch(`${server.url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${await f.token()}` }, body: '{}' }),
      ]);
      expect(allowed.isError).not.toBe(true);
      expect(denied.status).toBe(401);
    } finally { await good.close(); }
  });
});
