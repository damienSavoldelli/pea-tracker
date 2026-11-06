import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import app from '../src/index';

const clients: Client[] = [];
const origin = 'http://localhost:8787';
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

async function connectClient() {
  const client = new Client({ name: 'synthetic-test', version: '1.0.0' });
  clients.push(client);
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', origin), {
    fetch: async (input, init) => app.request(new Request(input, init)),
  });
  await client.connect(transport);
  return { client, transport };
}

async function rpc(method: string, params?: unknown) {
  return app.request(`${origin}/mcp`, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()));
});

describe('REST health', () => {
  it('returns exactly the public service metadata', async () => {
    const response = await app.request(`${origin}/api/v1/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'pea-tracker', version: '0.1.0' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('rejects %s', async method => {
    const response = await app.request(`${origin}/api/v1/health`, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });
});

describe('MCP Streamable HTTP', () => {
  it('initializes using the official SDK client without creating a session', async () => {
    const { client, transport } = await connectClient();
    expect(client.getServerVersion()).toEqual({ name: 'pea-tracker', version: '0.1.0' });
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    expect(transport.sessionId).toBeUndefined();
    await expect(client.ping()).resolves.toEqual({});
  });

  it('discovers only the parameterless ping tool', async () => {
    const { client } = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).toEqual(['ping']);
    expect(tools[0]?.inputSchema).toMatchObject({ type: 'object', properties: {}, additionalProperties: false });
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
  });

  it('invokes ping and returns structured diagnostics and matching text', async () => {
    const { client } = await connectClient();
    const result = await client.callTool({ name: 'ping', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      status: 'ok', service: 'pea-tracker', version: '0.1.0', timestamp: expect.any(String),
    });
    const diagnostic = z.object({ timestamp: z.string().datetime() }).parse(result.structuredContent);
    expect(new Date(diagnostic.timestamp).toISOString()).toBe(diagnostic.timestamp);
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }]);
  });

  it('returns an SDK tool error for an unknown tool', async () => {
    const { client } = await connectClient();
    const result = await client.callTool({ name: 'unknown', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text', text: expect.stringMatching(/not found/i) })]));
  });

  it('rejects unexpected ping arguments rather than silently ignoring them', async () => {
    const { client } = await connectClient();
    const result = await client.callTool({ name: 'ping', arguments: { unexpected: true } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it('isolates concurrent clients and requests', async () => {
    const connections = await Promise.all([connectClient(), connectClient()]);
    const results = await Promise.all(connections.map(({ client }) => client.callTool({ name: 'ping' })));
    for (const result of results) expect(result.structuredContent).toMatchObject({ status: 'ok' });
  });

  it('returns JSON-RPC method-not-found for an unknown protocol method', async () => {
    const response = await rpc('unknown/method');
    expect(await response.json()).toMatchObject({ jsonrpc: '2.0', id: 1, error: { code: -32601 } });
  });

  it.each(['{', JSON.stringify({ invalid: true })])('rejects invalid JSON or envelopes safely: %s', async body => {
    const response = await app.request(`${origin}/mcp`, { method: 'POST', headers, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ jsonrpc: '2.0', error: { code: expect.any(Number) } });
  });

  it.each(['GET', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'])('rejects unsupported %s without opening a stream', async method => {
    const response = await app.request(`${origin}/mcp`, { method });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('rejects cross-origin browser requests', async () => {
    const response = await app.request(`${origin}/mcp`, {
      method: 'POST', headers: { ...headers, Origin: 'https://untrusted.invalid' }, body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('rejects incompatible Accept and Content-Type headers', async () => {
    const unacceptable = await app.request(`${origin}/mcp`, { method: 'POST', headers: { ...headers, Accept: 'text/plain' }, body: '{}' });
    expect(unacceptable.status).toBe(406);
    const unsupported = await app.request(`${origin}/mcp`, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' });
    expect(unsupported.status).toBe(415);
  });

  it('bounds request bodies', async () => {
    const response = await app.request(`${origin}/mcp`, { method: 'POST', headers, body: ' '.repeat(65 * 1024) });
    expect(response.status).toBe(413);
  });
});
