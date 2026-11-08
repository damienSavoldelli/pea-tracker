import { afterEach, describe, expect, it, vi } from 'vitest';
import { authFixture, issuer, now, origin } from './helpers/auth-fixtures';
import { createJwksProvider } from '../src/adapters/auth/token-verifier';

afterEach(() => { vi.useRealTimers(); });
describe('JWT verification and resource binding', () => {
  it('validates a signature and stable owner identity; bearer tokens may be reused', async () => {
    const f = await authFixture();
    const request = f.request(await f.token());
    const first = await f.verifier.authenticate(request, 'rest');
    expect(first.permissions).toEqual(['instruments:read', 'instruments:admin']);
    expect(await f.verifier.authenticate(request, 'rest')).toEqual(first);
    f.setTime(now + 331000);
    await expect(f.verifier.authenticate(request, 'rest')).rejects.toMatchObject({ status: 401 });
  });
  it.each([
    { iss: 'https://other.example.invalid/' }, { aud: `${origin}/mcp` },
    { aud: [`${origin}/api/v1`, `${origin}/mcp`] }, { aud: 'synthetic-admin' },
    { exp: Math.floor(now / 1000) - 31 }, { nbf: Math.floor(now / 1000) + 31 },
    { iat: Math.floor(now / 1000) + 31 }, { exp: Math.floor(now / 1000) + 301 },
    { scope: '' }, { scope: 'portfolio:*' }, { scope: 'portfolio:read\tportfolio:admin' },
    { sub: 'synthetic-intruder' }, { azp: 'unknown-client' },
    { scope: 'unrelated', permissions: ['portfolio:admin', 'portfolio:read'] },
    { client_id: 'different-client' },
  ])('rejects invalid or unauthorized claims %j', async claims => {
    const f = await authFixture();
    const status = 'sub' in claims || 'azp' in claims || claims.scope === 'portfolio:*' || claims.scope === 'unrelated' ? 403 : 401;
    await expect(f.verifier.authenticate(f.request(await f.token(claims)), 'rest')).rejects.toMatchObject({ status });
  });
  it.each([
    { kid: 'unknown' }, { kid: '' }, { typ: 'id+jwt' },
    { jku: 'https://untrusted.invalid/keys' }, { x5u: 'https://untrusted.invalid/cert' },
    { jwk: { kty: 'oct', k: 'not-a-key' } },
  ])('rejects unsafe key/profile headers %j', async header => {
    const f = await authFixture();
    await expect(f.verifier.authenticate(f.request(await f.token({}, header)), 'rest')).rejects.toMatchObject({ status: 401 });
  });
  it('rejects invalid signatures using a known kid', async () => {
    const f = await authFixture();
    await expect(f.verifier.authenticate(f.request(await f.token({}, { kid: 'synthetic-key-1' }, true)), 'rest')).rejects.toMatchObject({ status: 401 });
  });
  it.each(['', 'Bearer bad', 'Basic synthetic', 'Bearer a.b.c, Bearer a.b.c', `Bearer ${'a'.repeat(8193)}`, 'Bearer eyJhbGciOiJub25lIn0.e30.'])('rejects ambiguous/oversized credentials', async authorization => {
    const f = await authFixture();
    await expect(f.verifier.authenticate(new Request(origin, { headers: { Authorization: authorization } }), 'rest')).rejects.toMatchObject({ status: 401 });
  });
  it('rejects missing credentials, missing claims and query access tokens', async () => {
    const f = await authFixture();
    await expect(f.verifier.authenticate(new Request(origin), 'rest')).rejects.toMatchObject({ status: 401 });
    const claims = {};
    Object.defineProperty(claims, 'exp', { value: undefined, enumerable: true });
    await expect(f.verifier.authenticate(f.request(await f.token(claims)), 'rest')).rejects.toMatchObject({ status: 401 });
    await expect(f.verifier.authenticate(f.request(await f.token(), '/api/v1/instruments?access_token=synthetic'), 'rest')).rejects.toMatchObject({ status: 401 });
  });
  it('enforces machine subjects and distinct MCP audience/scopes', async () => {
    const f = await authFixture();
    const mcp = await f.token({ aud: f.policy.mcp.audience, azp: 'synthetic-mcp', scope: 'mcp:read portfolio:read portfolio:admin' });
    expect((await f.verifier.authenticate(f.request(mcp), 'mcp')).permissions).toEqual(['instruments:read']);
    await expect(f.verifier.authenticate(f.request(mcp), 'rest')).rejects.toMatchObject({ status: 401 });
    const machine = await f.token({ sub: 'synthetic-machine', aud: f.policy.collector.audience, azp: 'synthetic-collector', scope: 'quotes:ingest' });
    expect((await f.verifier.authenticate(f.request(machine), 'collector')).permissions).toEqual(['quotes:ingest']);
    await expect(f.verifier.authenticate(f.request(machine), 'mcp')).rejects.toMatchObject({ status: 401 });
  });
});

describe('bounded configurable remote JWKS', () => {
  it('caches keys, cools down unknown kids and discovers rotated keys', async () => {
    const f = await authFixture();
    vi.useFakeTimers(); vi.setSystemTime(now);
    let rotated = false;
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ keys: rotated ? [f.key.firstPublic, f.key.secondPublic] : [f.key.firstPublic] }));
    const verifier = f.remote(fetcher, { cooldownMs: 1000, cacheMs: 5000 });
    const first = f.request(await f.token());
    await verifier.authenticate(first, 'rest');
    for (let i = 0; i < 6; i++) await expect(verifier.authenticate(f.request(await f.token({}, { kid: `missing-${i}` })), 'rest')).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    rotated = true; vi.setSystemTime(now + 1001);
    await verifier.authenticate(f.request(await f.token({}, {}, true)), 'rest');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${issuer}jwks`);
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
  it('fails closed after cache expiry/outage and limits failed fetch retries', async () => {
    const f = await authFixture();
    vi.useFakeTimers(); vi.setSystemTime(now);
    let down = false;
    const fetcher = vi.fn<typeof fetch>(async () => {
      if (down) throw new Error('synthetic upstream failure');
      return Response.json({ keys: [f.key.firstPublic] });
    });
    const verifier = f.remote(fetcher, { cooldownMs: 1000, cacheMs: 2000 });
    const request = f.request(await f.token());
    await verifier.authenticate(request, 'rest');
    down = true;
    await verifier.authenticate(request, 'rest');
    vi.setSystemTime(now + 2001);
    await expect(verifier.authenticate(request, 'rest')).rejects.toMatchObject({ status: 503, code: 'authentication_unavailable' });
    await expect(verifier.authenticate(request, 'rest')).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['redirect', 'large', 'malformed', 'too-many', 'empty'])('bounds untrusted JWKS responses: %s', async scenario => {
    const f = await authFixture();
    const fetcher: typeof fetch = async () => scenario === 'redirect' ? new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/private' } }) :
      scenario === 'large' ? new Response('x'.repeat(65537), { headers: { 'Content-Type': 'application/json' } }) :
      scenario === 'malformed' ? new Response('{', { headers: { 'Content-Type': 'application/json' } }) :
      Response.json({ keys: scenario === 'empty' ? [] : Array.from({ length: 17 }, () => f.key.firstPublic) });
    await expect(f.remote(fetcher).authenticate(f.request(await f.token()), 'rest')).rejects.toMatchObject({ status: 503 });
  });
  it('times out stalled response bodies without leaking upstream errors', async () => {
    const f = await authFixture();
    const fetcher: typeof fetch = async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } });
    await expect(f.remote(fetcher, { timeoutMs: 20 }).authenticate(f.request(await f.token()), 'rest')).rejects.toMatchObject({ status: 503, message: 'authentication_unavailable' });
  });
  it('rejects unsafe trusted endpoint/configuration at construction', () => {
    expect(() => createJwksProvider({ url: 'http://127.0.0.1/keys' })).toThrow();
    expect(() => createJwksProvider({ url: `${issuer}jwks`, cacheMs: Infinity })).toThrow();
  });
});
