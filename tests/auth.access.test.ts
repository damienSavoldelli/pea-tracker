import { describe, expect, it, vi } from 'vitest';
import { AccessAuthenticator } from '../src/adapters/auth/access-authenticator';
import { accessConfig, accessFixture } from './helpers/access-fixtures';
import worker, { createAccessPocApp } from '../src/entrypoints/access-poc';
import { requirePermission } from '../src/application/authorization';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startOAuthWorker } from './helpers/oauth-workerd.mjs';

describe('Access signed assertions and fixed MCP read grant', () => {
  it('cryptographically verifies the assertion and ignores claimed admin/ingestion scopes', async () => {
    const f = await accessFixture();
    const principal = await f.authenticator.authenticate(f.request(await f.token({ scope: 'portfolio:admin quotes:ingest', permissions: ['instruments:admin'] })));
    expect(principal.permissions).toEqual(['instruments:read']);
    expect(Object.isFrozen(principal)).toBe(true); expect(Object.isFrozen(principal.permissions)).toBe(true);
    expect(() => requirePermission(principal, 'instruments:admin')).toThrow('forbidden');
    expect(() => requirePermission(principal, 'quotes:ingest')).toThrow('forbidden');
  });
  it('accepts no delegated scope or azp requirement in an Access assertion', async () => {
    const f = await accessFixture();
    expect((await f.authenticator.authenticate(f.request(await f.token({ scope: undefined, azp: undefined })))).permissions).toEqual(['instruments:read']);
  });
  it.each([
    { iss: 'https://untrusted.cloudflareaccess.com' }, { aud: 'b'.repeat(64) },
    { aud: [accessConfig.audience, 'b'.repeat(64)] }, { type: 'org' }, { sub: '' },
    { iat: 99999999999 }, { exp: 1 }, { nbf: 99999999999 }, { exp: undefined }, { iat: undefined },
  ])('rejects invalid signed claims %j', async claims => {
    const f = await accessFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token(claims)))).rejects.toMatchObject({ status: 401 });
  });
  it('denies a valid non-owner regardless of forged matching email headers', async () => {
    const f = await accessFixture();
    const request = f.request(await f.token({ sub: 'synthetic-other-owner' }));
    request.headers.set('Cf-Access-Authenticated-User-Email', 'synthetic-owner@example.invalid');
    await expect(f.authenticator.authenticate(request)).rejects.toMatchObject({ status: 403 });
  });
  it.each([{ kid: '' }, { kid: 'unknown' }, { jku: 'https://untrusted.invalid/keys' }, { jwk: {} }])('rejects unsafe/unknown keys %j', async header => {
    const f = await accessFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token({}, header)))).rejects.toMatchObject({ status: 401 });
  });
  it('rejects forged signatures with a known key ID', async () => {
    const f = await accessFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token({}, { kid: 'synthetic-key-1' }, true)))).rejects.toMatchObject({ status: 401 });
  });
  it.each([undefined, '', 'oauth:synthetic-opaque-token', 'a.b.c, a.b.c', 'a'.repeat(8193)])('rejects missing/malformed/oversized assertion', async assertion => {
    const f = await accessFixture();
    await expect(f.authenticator.authenticate(f.request(assertion))).rejects.toMatchObject({ status: 401 });
  });
  it('never authenticates from Authorization alone or fetches a token-selected issuer', async () => {
    const f = await accessFixture();
    const fetcher = vi.fn(f.keys);
    const authenticator = new AccessAuthenticator(accessConfig, { fetch: fetcher });
    const request = f.request(); request.headers.set('Authorization', `Bearer ${await f.token()}`);
    await expect(authenticator.authenticate(request)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
    await authenticator.authenticate(f.request(await f.token()));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${accessConfig.issuer}/cdn-cgi/access/certs`);
  });
  it('fails closed when trusted JWKS cannot be loaded', async () => {
    const f = await accessFixture();
    const authenticator = new AccessAuthenticator(accessConfig, { fetch: async () => { throw new Error('synthetic private upstream'); } });
    await expect(authenticator.authenticate(f.request(await f.token()))).rejects.toMatchObject({ status: 503, message: 'authentication_unavailable' });
  });
  it.each([
    {}, { ...accessConfig, issuer: 'http://127.0.0.1' }, { ...accessConfig, issuer: `${accessConfig.issuer}/` },
    { ...accessConfig, issuer: `${accessConfig.issuer}.untrusted.invalid` }, { ...accessConfig, audience: 'not-an-aud-tag' },
    { ...accessConfig, ownerSubject: '' },
  ])('rejects incomplete/untrusted operator configuration', config => {
    expect(() => new AccessAuthenticator(config)).toThrow();
  });
});

describe('Access PoC HTTP and SDK isolation', () => {
  it('verifies Access assertions with native workerd crypto and runs MCP reads', async () => {
    const native = await startOAuthWorker('access');
    const client = new Client({ name: 'synthetic-native-access', version: '1.0' });
    try {
      expect((await fetch(`${native.url}/mcp`, { method: 'POST' })).status).toBe(401);
      const { assertion } = await (await fetch(`${native.url}/__test/assertion`)).json() as { assertion: string };
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', native.url), { requestInit: { headers: { 'Cf-Access-Jwt-Assertion': assertion } } }));
      expect((await client.callTool({ name: 'list_instruments', arguments: {} })).structuredContent).toMatchObject({ data: [{ name: 'Synthetic Access PoC ETF' }] });
      const parts = assertion.split('.'); parts[2] = `${parts[2]?.[0] === 'A' ? 'B' : 'A'}${parts[2]?.slice(1)}`;
      expect((await fetch(`${native.url}/mcp`, { headers: { 'Cf-Access-Jwt-Assertion': parts.join('.') } })).status).toBe(401);
      expect((await fetch(`${native.url}/api/v1/instruments`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': assertion } })).status).toBe(404);
    } finally { await client.close(); await native.close(); }
  }, 30000);
  it('protects the whole MCP transport; never mounts REST financial or token routes', async () => {
    const f = await accessFixture();
    const server = await startOAuthHttpFixture(await createAccessPocApp(f.authenticator));
    const client = new Client({ name: 'synthetic-access-client', version: '1.0' });
    try {
      for (const method of ['POST', 'GET', 'DELETE']) expect((await fetch(`${server.url}/mcp`, { method })).status).toBe(401);
      const assertion = await f.token();
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url), { requestInit: { headers: { 'Cf-Access-Jwt-Assertion': assertion, Authorization: 'Bearer oauth:synthetic-opaque' } } }));
      expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual(['get_instrument', 'list_instruments', 'ping']);
      expect((await client.listTools()).tools.find(tool => tool.name === 'list_instruments')?._meta).toMatchObject({ securitySchemes: [{ type: 'oauth2', scopes: [] }] });
      expect((await client.callTool({ name: 'list_instruments', arguments: {} })).structuredContent).toMatchObject({ data: [{ name: 'Synthetic Access PoC ETF' }] });
      expect((await client.callTool({ name: 'get_instrument', arguments: { id: '00000000-0000-4000-8000-000000000001' } })).structuredContent).toMatchObject({ name: 'Synthetic Access PoC ETF' });
      expect((await client.callTool({ name: 'create_instrument', arguments: {} })).isError).toBe(true);
      for (const path of ['/api/v1/instruments', '/api/v1/quotations/ingest', '/__synthetic/admin-token', '/.well-known/oauth-protected-resource/mcp']) {
        for (const method of ['GET', 'POST', 'PATCH']) expect((await fetch(`${server.url}${path}`, { method, headers: { 'Cf-Access-Jwt-Assertion': assertion } })).status).toBe(404);
      }
      const denied = await fetch(`${server.url}/mcp`, { headers: { 'Cf-Access-Jwt-Assertion': await f.token({ sub: 'synthetic-other-owner' }) } });
      expect(denied.status).toBe(403); expect(await denied.text()).not.toMatch(/synthetic-other|stack|upstream/);
      expect((await fetch(`${server.url}/api/v1/health`)).status).toBe(200);
    } finally { await client.close(); await server.close(); }
  });
  it('fails closed on absent configuration without falling back to diagnostic MCP', async () => {
    for (const env of [{}, { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ACCESS_OWNER_SUB: '' }]) {
      for (const path of ['/mcp', '/api/v1/instruments', '/api/v1/health', '/.well-known/oauth-authorization-server']) {
        for (const method of ['GET', 'POST']) {
          const response = await worker.fetch(new Request(`https://synthetic-poc.example.invalid${path}`, { method }), env);
          expect(response.status).toBe(503);
          expect(response.headers.get('Cache-Control')).toBe('no-store');
          expect(await response.text()).not.toMatch(/Zod|ACCESS_OWNER|stack|Synthetic Access PoC ETF/);
        }
      }
    }
  });
});
