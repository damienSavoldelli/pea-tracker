import { describe, expect, it, vi } from 'vitest';
import { createInstrumentSchema, updateInstrumentSchema, validIsin } from '../src/domain/instruments';
import { admin, collector, fixture, missingId, reader, syntheticInput, syntheticIsin } from './helpers/instruments';

describe('instrument domain', () => {
  it('supports synthetic stock/ETF, defaults, uppercase codes and checksum without claiming allocation', () => {
    expect(validIsin(syntheticIsin)).toBe(true);
    expect(createInstrumentSchema.parse(syntheticInput)).toMatchObject({ active: true, isin: null, exchange_mic: null, provider_symbol: null });
    expect(createInstrumentSchema.parse({ ...syntheticInput, kind: 'stock', isin: syntheticIsin, exchange_mic: 'XXXX', provider_symbol: 'SYNTH-A' }).kind).toBe('stock');
  });

  it.each([
    { name: '' }, { name: ' padded' }, { name: 'padded ' }, { name: 'a\n' }, { name: 'a\u2028' }, { name: 'a\u0085b' },
    { name: 'x'.repeat(161) }, { kind: 'bond' }, { quote_currency: 'eur' }, { quote_currency: 'EURO' },
    { price_unit: 1 }, { exchange_mic: 'xpar' }, { provider_symbol: 'has space' }, { provider_symbol: 'x'.repeat(65) },
    { active: 'true' }, { isin: 'ZZ0000000000' }, { isin: syntheticIsin.toLowerCase() }, { quantity: '1' }, { id: missingId }, { version: 1 },
  ])('rejects invalid or server-owned input %j', patch => {
    expect(createInstrumentSchema.safeParse({ ...syntheticInput, ...patch }).success).toBe(false);
  });

  it('counts Unicode code points and rejects empty/identity patches', () => {
    expect(createInstrumentSchema.safeParse({ ...syntheticInput, name: '😀'.repeat(160) }).success).toBe(true);
    expect(createInstrumentSchema.safeParse({ ...syntheticInput, name: '😀'.repeat(161) }).success).toBe(false);
    for (const input of [{}, { name: undefined }, { isin: null }, { kind: 'stock' }, { provider_symbol: null }]) {
      expect(updateInstrumentSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe('shared instrument services', () => {
  it('creates, reads, updates and deactivates with stable metadata', async () => {
    const { service } = fixture();
    const record = await service.create(admin, syntheticInput, 'create');
    expect(record.version).toBe(1);
    expect(await service.get(reader, record.id)).toEqual(record);
    const updated = await service.update(admin, record.id, { name: 'Synthetic ETF renamed', active: false }, 1);
    expect(updated).toEqual({ ...record, name: 'Synthetic ETF renamed', active: false, version: 2 });
    expect((await service.list(reader, { active: true })).data).toEqual([]);
    expect((await service.list(reader, {})).data).toEqual([updated]);
    await expect(service.get(reader, missingId)).rejects.toMatchObject({ status: 404 });
  });

  it('denies operations before validation or repository access', async () => {
    const { service, repository } = fixture();
    const get = vi.spyOn(repository, 'get');
    const create = vi.spyOn(repository, 'create');
    for (const principal of [null, collector]) {
      await expect(service.get(principal, 'bad-id')).rejects.toMatchObject({ status: principal ? 403 : 401 });
    }
    for (const principal of [reader, collector, { subject: 'synthetic-mcp', permissions: ['instruments:read'] as const }]) {
      await expect(service.create(principal, {}, '')).rejects.toMatchObject({ status: 403 });
      await expect(service.update(principal, missingId, {}, 1)).rejects.toMatchObject({ status: 403 });
    }
    const adminOnly = { subject: 'synthetic-admin-only', permissions: ['instruments:admin'] as const };
    await expect(service.list(adminOnly, {})).rejects.toMatchObject({ status: 403 });
    expect(get).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not reserve an idempotency key on validation failure', async () => {
    const { service } = fixture();
    await expect(service.create(admin, { ...syntheticInput, quantity: '1' }, 'retry')).rejects.toMatchObject({ status: 422 });
    expect((await service.create(admin, syntheticInput, 'retry')).version).toBe(1);
    await expect(service.create(admin, syntheticInput, 'bad key')).rejects.toMatchObject({ status: 400 });
  });

  it('paginates without losing stable order; binds filter and rejects noncanonical cursors', async () => {
    const { service } = fixture();
    for (let i = 0; i < 5; i++) await service.create(admin, { ...syntheticInput, active: i % 2 === 0 }, `key-${i}`);
    const first = await service.list(reader, { limit: 2 });
    const second = await service.list(reader, { limit: 2, cursor: first.page.next_cursor });
    const third = await service.list(reader, { limit: 2, cursor: second.page.next_cursor });
    expect([...first.data, ...second.data, ...third.data].map(record => record.id)).toEqual((await service.list(reader, {})).data.map(record => record.id));
    expect(third.page.next_cursor).toBeNull();
    await expect(service.list(reader, { cursor: first.page.next_cursor, active: true })).rejects.toMatchObject({ status: 400 });
    for (const cursor of ['=', 'x'.repeat(257), btoa('{}'), `${first.page.next_cursor}=`]) {
      await expect(service.list(reader, { cursor })).rejects.toMatchObject({ status: 400 });
    }
    for (const limit of [0, 101, 1.5]) await expect(service.list(reader, { limit })).rejects.toMatchObject({ status: 400 });
    expect((await fixture().service.list(reader, {})).page.next_cursor).toBeNull();
  });
});
