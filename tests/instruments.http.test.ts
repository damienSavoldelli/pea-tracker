import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { instrumentSchema } from '../src/domain/instruments';
import { admin, fixture, missingId, reader, syntheticInput } from './helpers/instruments';

function setup(principal = admin) {
  const data = fixture();
  const app = createApp({ instruments: { service: data.service, authenticate: () => principal } });
  const request = (method = 'GET', path = '', body?: unknown, headers: Record<string, string> = {}) => app.request(`http://localhost/api/v1/instruments${path}`, {
    method, headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ...data, app, request };
}

describe('instrument REST adapter', () => {
  it('implements create/list/get/PATCH, original replay, ETag and Location', async () => {
    const { request } = setup();
    const created = await request('POST', '', syntheticInput, { 'Idempotency-Key': 'http' });
    expect(created.status).toBe(201);
    const record = instrumentSchema.parse(await created.json());
    expect(created.headers.get('Location')).toBe(`/api/v1/instruments/${record.id}`);
    expect(created.headers.get('ETag')).toBe('"1"');
    const got = await request('GET', `/${record.id}`);
    expect(await got.json()).toEqual(record);
    const updated = await request('PATCH', `/${record.id}`, { active: false }, { 'If-Match': '"1"' });
    expect(updated.status).toBe(200);
    expect(updated.headers.get('ETag')).toBe('"2"');
    expect(await updated.json()).toMatchObject({ active: false, version: 2 });
    const replay = await request('POST', '', syntheticInput, { 'Idempotency-Key': 'http' });
    expect(await replay.json()).toEqual(record);
    expect(replay.headers.get('ETag')).toBe('"1"');
    expect(await (await request('GET', '?active=true')).json()).toEqual({ data: [], page: { next_cursor: null } });
    expect((await (await request()).json()).data).toHaveLength(1);
    for (const response of [created, got, updated, replay]) {
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    }
  });

  it.each(['?unknown=1', '?limit=0', '?limit=101', '?limit=1.5', '?limit=01', '?limit=1&limit=2', '?active=1', '?cursor=', '?cursor=invalid'])('rejects invalid queries %s', async query => {
    const response = await setup().request('GET', query);
    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
  });

  it('rejects missing keys, immutable fields, invalid IDs and malformed JSON', async () => {
    const { request, app } = setup();
    expect((await request('POST', '', syntheticInput)).status).toBe(400);
    expect((await request('POST', '', { ...syntheticInput, quantity: '1' }, { 'Idempotency-Key': 'invalid' })).status).toBe(422);
    expect((await request('GET', '/invalid')).status).toBe(400);
    expect((await request('GET', `/${missingId}`)).status).toBe(404);
    const invalid = await app.request('http://localhost/api/v1/instruments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(invalid.status).toBe(400);
    const invalidUtf8 = await app.request('http://localhost/api/v1/instruments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new Uint8Array([0xff]) });
    expect(invalidUtf8.status).toBe(400);
  });

  it('enforces strong version preconditions and rejects empty/identity PATCH', async () => {
    const { request } = setup();
    const created = await request('POST', '', syntheticInput, { 'Idempotency-Key': 'patch' });
    const record = instrumentSchema.parse(await created.json());
    expect((await request('PATCH', `/${record.id}`, { active: false })).status).toBe(428);
    for (const match of ['*', 'W/"1"', '"1", "2"', '1', '"01"', '"9007199254740992"']) {
      expect((await request('PATCH', `/${record.id}`, { active: false }, { 'If-Match': match })).status).toBe(400);
    }
    for (const patch of [{}, { isin: null }, { quote_currency: 'GBP' }, { provider_symbol: 'CHANGED' }]) {
      expect((await request('PATCH', `/${record.id}`, patch, { 'If-Match': '"1"' })).status).toBe(422);
    }
    expect((await request('PATCH', `/${record.id}`, { active: false }, { 'If-Match': '"2"' })).status).toBe(412);
    expect((await request('PATCH', `/${missingId}`, { active: false }, { 'If-Match': '"1"' })).status).toBe(404);
  });

  it('enforces JSON negotiation, origin, unsupported methods and bounded streaming bodies', async () => {
    const { app, request } = setup();
    for (const accept of ['text/plain', 'application/json;q=0', 'application/json;q=0, */*;q=1']) {
      expect((await request('GET', '', undefined, { Accept: accept })).status).toBe(406);
    }
    for (const accept of ['application/json', '*/*', 'application/*', 'text/plain, application/json;q=0.5']) {
      expect((await request('GET', '', undefined, { Accept: accept })).status).toBe(200);
    }
    expect((await request('POST', '', syntheticInput, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await request('GET', '', undefined, { Origin: 'https://untrusted.invalid' })).status).toBe(403);
    for (const method of ['DELETE', 'PUT', 'OPTIONS', 'HEAD']) {
      const response = await request(method);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, POST');
      const readOnly = await setup(reader).request(method);
      expect(readOnly.status).toBe(405);
      expect(readOnly.headers.get('Allow')).toBe('GET, POST');
    }
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(17000)); controller.close(); } });
    const init = Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream }, { duplex: 'half' });
    const oversized = await app.request(new Request('http://localhost/api/v1/instruments', init));
    expect(oversized.status).toBe(413);
  });

  it('denies read-only writes and masks internal/authentication failures', async () => {
    expect((await setup(reader).request('POST', '', syntheticInput, { 'Idempotency-Key': 'denied' })).status).toBe(403);
    const { service, request } = setup();
    vi.spyOn(service, 'get').mockRejectedValue(new Error('synthetic private diagnostic must not leak'));
    const response = await request('GET', `/${missingId}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'internal_error', request_id: expect.any(String) });
    const app = createApp({ instruments: { service, authenticate: () => { throw new Error('verifier unavailable'); } } });
    expect((await app.request('/api/v1/instruments')).status).toBe(500);
  });
});
