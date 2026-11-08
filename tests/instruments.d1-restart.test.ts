import { describe, expect, it } from 'vitest';
import { openLocalD1 } from './helpers/d1-local.mjs';
import { startD1ServerProcess } from './helpers/d1-server-process.mjs';
import { instrumentSchema } from '../src/domain/instruments';
import { syntheticInput } from './helpers/instruments';
import { assertContractResponse } from './helpers/openapi';

describe('local D1 process restart durability', () => {
  it('recovers current versions, cursors and original create outcomes in a new Node/workerd process', async () => {
    const local = await openLocalD1();
    await local.dispose();
    let server: Awaited<ReturnType<typeof startD1ServerProcess>> | undefined;
    const send = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const response = await fetch(`${server!.url}${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      await assertContractResponse(method, path, response.clone());
      return response;
    };
    try {
      server = await startD1ServerProcess(local.directory);
      const created = await send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'restart' });
      const original = instrumentSchema.parse(await created.json());
      const location = created.headers.get('Location');
      const updated = instrumentSchema.parse(await (await send('PATCH', location!, { name: 'Synthetic persisted update', active: false }, { 'If-Match': '"1"' })).json());
      // Deliberately discard the acknowledged response, simulating a caller that
      // cannot use the result and retries only after a complete process restart.
      await send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'discarded-result' });
      const beforeRestart = await (await send('GET', '/api/v1/instruments')).json() as { data: unknown[] };
      const discardedOriginal = beforeRestart.data.map(value => instrumentSchema.parse(value)).find(value => value.id !== original.id);
      expect(discardedOriginal).toBeDefined();
      const page = await (await send('GET', '/api/v1/instruments?limit=1')).json() as { page: { next_cursor: string } };
      expect(page.page.next_cursor).toBeTypeOf('string');
      await server.stop(); server = undefined;
      server = await startD1ServerProcess(local.directory);
      expect(await (await send('GET', location!)).json()).toEqual(updated);
      const replay = await send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'restart' });
      expect(replay.status).toBe(201);
      expect(replay.headers.get('Location')).toBe(location);
      expect(replay.headers.get('ETag')).toBe('"1"');
      expect(await replay.json()).toEqual(original);
      expect((await send('PATCH', location!, { active: true }, { 'If-Match': '"1"' })).status).toBe(412);
      expect((await send('POST', '/api/v1/instruments', { ...syntheticInput, name: 'Synthetic changed input' }, { 'Idempotency-Key': 'restart' })).status).toBe(409);
      const recovered = await send('POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'discarded-result' });
      expect(recovered.status).toBe(201);
      expect(instrumentSchema.parse(await recovered.json())).toEqual(discardedOriginal);
      const all = await (await send('GET', '/api/v1/instruments')).json() as { data: unknown[] };
      expect(all.data).toHaveLength(2);
      const continuation = await (await send('GET', `/api/v1/instruments?limit=1&cursor=${page.page.next_cursor}`)).json() as { data: unknown[] };
      expect(continuation.data).toHaveLength(1);
    } finally {
      await server?.stop();
      await local.cleanup();
    }
  }, 60000);
});
