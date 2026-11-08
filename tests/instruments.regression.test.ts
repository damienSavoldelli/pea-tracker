import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { createApp } from '../src/app';

describe('default Worker remains diagnostic-only', () => {
  it.each(['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource/api/v1'])('does not mount protected-composition metadata at %s', async path => {
    expect((await app.request(`http://localhost${path}`)).status).toBe(404);
  });
  it.each(['GET', 'POST', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('never mounts instruments for %s despite claimed identity', async method => {
    for (const path of ['/api/v1/instruments', '/api/v1/instruments/00000000-0000-4000-8000-000000000001']) {
      const response = await app.request(`http://localhost${path}`, { method, headers: { Authorization: 'Bearer synthetic-admin', 'X-Principal': 'admin', 'X-Role': 'admin' } });
      expect(response.status).toBe(404);
    }
  });

  it('omits instrument routes without both trusted dependencies', async () => {
    const incomplete = createApp({
      // @ts-expect-error Deliberate runtime partial-composition test.
      instruments: { authenticate: () => null },
    });
    expect((await incomplete.request('/api/v1/instruments')).status).toBe(404);
  });
});
