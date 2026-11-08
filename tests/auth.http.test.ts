import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProtectedApp } from '../src/protected-app';
import { InstrumentService } from '../src/application/instruments';
import { MemoryInstrumentRepository } from '../src/adapters/memory/instruments';
import { authFixture } from './helpers/auth-fixtures';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { syntheticInput } from './helpers/instruments';
import { assertContractResponse } from './helpers/openapi';
import { instrumentSchema } from '../src/domain/instruments';
import { requirePermission } from '../src/application/authorization';
import { authenticationFailure } from '../src/adapters/auth/metadata';

describe('signed-token REST over guarded loopback HTTP', () => {
  let f: Awaited<ReturnType<typeof authFixture>>;
  let server: Awaited<ReturnType<typeof startOAuthHttpFixture>>;
  const repository = new MemoryInstrumentRepository();
  beforeAll(async () => {
    f = await authFixture();
    const app = createProtectedApp(f.verifier, new InstrumentService(repository));
    // Test-only policy sentinel. No quotation ingestion route or business feature.
    app.post('/__synthetic/ingestion-policy', async context => {
      try {
        requirePermission(await f.verifier.authenticate(context.req.raw, 'collector'), 'quotes:ingest');
        return context.json({ accepted: true });
      } catch (error) { return authenticationFailure(error, () => 'Bearer'); }
    });
    server = await startOAuthHttpFixture(app);
  });
  afterAll(async () => { await server?.close(); });
  const send = async (method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${server.url}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await assertContractResponse(method, path, response.clone());
    return response;
  };
  it('authenticates real create/read/update/replay with stable owner subject', async () => {
    expect(server.address.address).toBe('127.0.0.1');
    const token = await f.token();
    const created = await send('POST', '/api/v1/instruments', token, syntheticInput, { 'Idempotency-Key': 'oauth-http' });
    expect(created.status).toBe(201);
    const record = instrumentSchema.parse(await created.json());
    const path = `/api/v1/instruments/${record.id}`;
    expect((await send('GET', path, token)).status).toBe(200);
    expect((await send('PATCH', path, token, { active: false }, { 'If-Match': '"1"' })).status).toBe(200);
    expect((await send('PATCH', path, token, { active: true }, { 'If-Match': '"1"' })).status).toBe(412);
    expect(await (await send('POST', '/api/v1/instruments', token, syntheticInput, { 'Idempotency-Key': 'oauth-http' })).json()).toEqual(record);
  });
  it('denies read-only mutations before repository access despite broad permissions', async () => {
    const create = vi.spyOn(repository, 'create');
    const reader = await f.token({ azp: 'synthetic-reader', scope: 'portfolio:read', permissions: ['portfolio:admin'] });
    expect((await send('GET', '/api/v1/instruments', reader)).status).toBe(200);
    const response = await send('POST', '/api/v1/instruments', reader, syntheticInput, { 'Idempotency-Key': 'denied' });
    expect(response.status).toBe(403);
    expect(response.headers.get('WWW-Authenticate')).toContain('scope="portfolio:admin"');
    expect(create).not.toHaveBeenCalled(); create.mockRestore();
  });
  it('rejects missing/foreign audience and collector/MCP tokens on REST before storage', async () => {
    const list = vi.spyOn(repository, 'list');
    expect((await send('GET', '/api/v1/instruments')).status).toBe(401);
    for (const claims of [
      { aud: f.policy.mcp.audience, azp: 'synthetic-mcp', scope: 'mcp:read portfolio:read portfolio:admin' },
      { aud: f.policy.collector.audience, azp: 'synthetic-collector', sub: 'synthetic-machine', scope: 'quotes:ingest' },
    ]) expect((await send('GET', '/api/v1/instruments', await f.token(claims))).status).toBe(401);
    expect(list).not.toHaveBeenCalled(); list.mockRestore();
  });
  it('keeps health public and publishes separate minimal resource metadata', async () => {
    expect(await (await send('GET', '/api/v1/health')).json()).toEqual({ status: 'ok', service: 'pea-tracker', version: '0.1.0' });
    const metadata = await fetch(`${server.url}/.well-known/oauth-protected-resource/mcp`);
    await assertContractResponse('GET', '/.well-known/oauth-protected-resource/mcp', metadata.clone());
    const mcp = await metadata.json() as { scopes_supported: string[] };
    expect(mcp.scopes_supported).toEqual(['mcp:read', 'portfolio:read']);
    const rest = await (await fetch(`${server.url}/.well-known/oauth-protected-resource/api/v1`)).json() as { resource: string };
    expect(rest.resource).toBe(f.policy.rest.audience);
    const response = await send('GET', '/api/v1/instruments');
    expect(response.headers.get('WWW-Authenticate')).toContain('/oauth-protected-resource/api/v1');
  });
  it('returns contract-valid sanitized 503 on unavailable trusted keys', async () => {
    const down = await startOAuthHttpFixture(createProtectedApp(f.remote(async () => { throw new Error('synthetic private upstream detail'); }), new InstrumentService(repository)));
    try {
      const response = await fetch(`${down.url}/api/v1/instruments`, { headers: { Authorization: `Bearer ${await f.token()}` } });
      expect(response.status).toBe(503);
      await assertContractResponse('GET', '/api/v1/instruments', response.clone());
      expect(await response.text()).not.toMatch(/private upstream|Bearer|SELECT|synthetic-admin/);
    } finally { await down.close(); }
  });
  it('accepts only the pinned machine identity at the isolated ingestion-policy sentinel', async () => {
    const machine = await f.token({ sub: 'synthetic-machine', aud: f.policy.collector.audience, azp: 'synthetic-collector', scope: 'quotes:ingest' });
    const headers = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });
    expect((await fetch(`${server.url}/__synthetic/ingestion-policy`, { method: 'POST', headers: headers(machine) })).status).toBe(200);
    expect((await fetch(`${server.url}/__synthetic/ingestion-policy`, { method: 'POST', headers: headers(await f.token()) })).status).toBe(401);
    const wrongSubject = await f.token({ aud: f.policy.collector.audience, azp: 'synthetic-collector', scope: 'quotes:ingest' });
    expect((await fetch(`${server.url}/__synthetic/ingestion-policy`, { method: 'POST', headers: headers(wrongSubject) })).status).toBe(403);
  });
});
