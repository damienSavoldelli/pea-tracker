import { describe, expect, it } from 'vitest';
import { admin, fixture, reader, syntheticInput, syntheticIsin } from './helpers/instruments';

describe('memory repository acceptance', () => {
  it('atomically replays canonical input and retains original outcome after updates', async () => {
    const { service } = fixture();
    const results = await Promise.all(Array.from({ length: 10 }, () => service.create(admin, syntheticInput, 'same')));
    for (const result of results) expect(result).toEqual(results[0]);
    const original = results[0]!;
    await service.update(admin, original.id, { active: false }, 1);
    expect(await service.create(admin, { ...syntheticInput, active: true, isin: null, provider_symbol: null, exchange_mic: null }, 'same')).toEqual(original);
    await expect(service.create(admin, { ...syntheticInput, name: 'Different' }, 'same')).rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    expect((await service.list(reader, {})).data).toHaveLength(1);
  });

  it('scopes keys by subject; allows null ISINs but preserves inactive non-null identity uniqueness', async () => {
    const { service } = fixture();
    const first = await service.create(admin, { ...syntheticInput, isin: syntheticIsin }, 'first');
    await service.update(admin, first.id, { active: false }, 1);
    await expect(service.create(admin, { ...syntheticInput, isin: syntheticIsin }, 'second')).rejects.toMatchObject({ status: 409, code: 'duplicate_isin' });
    const pair = await Promise.all([service.create(admin, syntheticInput, 'null'), service.create({ ...admin, subject: 'synthetic-other' }, syntheticInput, 'null')]);
    expect(pair[0]!.id).not.toBe(pair[1]!.id);
    expect((await service.list(reader, {})).data).toHaveLength(3);
  });

  it('allows only one concurrent duplicate ISIN or versioned update', async () => {
    const { service } = fixture();
    const creates = await Promise.allSettled(['a', 'b'].map(key => service.create(admin, { ...syntheticInput, isin: syntheticIsin }, key)));
    expect(creates.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const record = (await service.list(reader, {})).data[0]!;
    const updates = await Promise.allSettled([true, false].map(active => service.update(admin, record.id, { active }, 1)));
    expect(updates.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await service.get(reader, record.id)).version).toBe(2);
  });

  it('copies inputs/outputs and isolates application instances', async () => {
    const { service, repository } = fixture();
    const record = await service.create(admin, syntheticInput, 'copy');
    record.name = 'Changed outside repository';
    const returned = (await repository.list({ limit: 10, active: null, after: null }))[0]!;
    returned.name = 'Another outside mutation';
    expect((await service.get(reader, record.id)).name).toBe(syntheticInput.name);
    expect((await fixture().service.list(reader, {})).data).toEqual([]);
  });
});
