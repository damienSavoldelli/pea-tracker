import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = new URL('http://127.0.0.1:8787');
const health = await fetch(new URL('/api/v1/health', endpoint), {
  signal: AbortSignal.timeout(10_000),
});
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), {
  status: 'ok', service: 'pea-tracker', version: '0.1.0',
});

const client = new Client({ name: 'local-container-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL('/mcp', endpoint), {
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
});

try {
  await client.connect(transport);
  assert.deepEqual(client.getServerVersion(), { name: 'pea-tracker', version: '0.1.0' });
  assert.equal(transport.sessionId, undefined);
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['ping']);
  const result = await client.callTool({ name: 'ping', arguments: {} });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    status: 'ok', service: 'pea-tracker', version: '0.1.0',
    timestamp: result.structuredContent?.timestamp,
  });
  assert.equal(new Date(result.structuredContent.timestamp).toISOString(), result.structuredContent.timestamp);
  console.log('REST health, MCP initialization, tools/list and ping passed against 127.0.0.1:8787.');
} finally {
  await client.close();
}
