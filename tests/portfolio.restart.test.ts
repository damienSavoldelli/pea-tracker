import { expect, it } from 'vitest';
import { openLocalD1 } from './helpers/d1-local.mjs';
import { startD1ServerProcess } from './helpers/d1-server-process.mjs';
import { openingInput, firstId, secondId } from './helpers/portfolio';
import { openingStateSchema } from '../src/domain/portfolio';
import { assertContractResponse } from './helpers/openapi';

it('recovers complete opening revisions and original outcomes after a real Node/workerd process restart', async () => {
  const local = await openLocalD1();
  await local.dispose();
  let server: Awaited<ReturnType<typeof startD1ServerProcess>> | undefined;
  async function send(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(`${server!.url}/api/v1/portfolio${path}`, { method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await assertContractResponse(method, `/portfolio${path}`, response);
    return response;
  }
  try {
    // Bind the synthetic fixture to real stable instrument IDs before startup.
    const db = await openLocalD1({ directory: local.directory, migrate: false });
    try {
      for (const id of [firstId, secondId]) await db.db.prepare(`INSERT INTO instruments
        (id,name,kind,isin,quote_currency,price_unit,exchange_mic,provider_symbol,active,version,created_at,updated_at)
        VALUES (?,'Synthetic restart instrument','etf',NULL,'EUR','currency_unit',NULL,NULL,1,1,'2026-11-09T00:00:00.000Z','2026-11-09T00:00:00.000Z')`).bind(id).run();
    } finally { await db.dispose(); }
    server = await startD1ServerProcess(local.directory, true);
    const original = openingStateSchema.parse(await (await send('/opening-state', 'POST', openingInput(), { 'If-Match': '"0"', 'Idempotency-Key': 'opening' })).json());
    const correction = { ...openingInput(), positions: [], correction_reason: 'Synthetic complete correction' };
    const revised = openingStateSchema.parse(await (await send('/opening-state', 'POST', correction, { 'If-Match': '"1"', 'Idempotency-Key': 'correction' })).json());
    await server.stop(); server = undefined;
    server = await startD1ServerProcess(local.directory, true);
    expect(await (await send('/opening-state')).json()).toEqual(revised);
    expect(await (await send('/opening-state/revisions/1')).json()).toEqual(original);
    expect(await (await send('/opening-state', 'POST', openingInput(), { 'If-Match': '"0"', 'Idempotency-Key': 'opening' })).json()).toEqual(original);
    expect((await send('/opening-state', 'POST', correction, { 'If-Match': '"1"', 'Idempotency-Key': 'new-stale' })).status).toBe(412);
  } finally { await server?.stop(); await local.cleanup(); }
}, 60000);
