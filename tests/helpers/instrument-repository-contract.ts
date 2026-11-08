import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstrumentService } from '../../src/application/instruments';
import { createInstrumentSchema, type Instrument } from '../../src/domain/instruments';
import type { InstrumentRepository } from '../../src/ports/instruments';
import { admin, missingId, syntheticInput, syntheticIsin } from './instruments';

export interface InstrumentRepositoryContractHarness {
  repository: InstrumentRepository;
  peer: InstrumentRepository;
  // Storage-boundary fixture setup, not production create() acceptance.
  seedBoundary(record: Instrument): Promise<void>;
  dispose(): Promise<void>;
}

const initialTime = '2026-11-08T10:00:00.000Z';
const laterTime = '2026-11-08T10:01:00.000Z';
const listAll = { limit: 101, active: null, after: null };

function id(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function record(sequence: number, fields: Partial<Instrument> = {}): Instrument {
  return {
    id: id(sequence),
    ...createInstrumentSchema.parse(syntheticInput),
    version: 1,
    created_at: initialTime,
    updated_at: initialTime,
    ...fields,
  };
}

function canonicalInput(value: Instrument): string {
  return JSON.stringify(createInstrumentSchema.parse({
    name: value.name, kind: value.kind, isin: value.isin,
    quote_currency: value.quote_currency, price_unit: value.price_unit,
    exchange_mic: value.exchange_mic, provider_symbol: value.provider_symbol, active: value.active,
  }));
}

function create(repository: InstrumentRepository, value: Instrument, key: string) {
  return repository.create(value, { subject: admin.subject, key, canonicalInput: canonicalInput(value) });
}

/** The same valid-input acceptance suite runs against each storage adapter. */
export function instrumentRepositoryContract(
  name: string,
  factory: () => Promise<InstrumentRepositoryContractHarness>,
): void {
  describe(name, () => {
    let harness: InstrumentRepositoryContractHarness | undefined;
    let repository: InstrumentRepository;
    let peer: InstrumentRepository;
    let service: InstrumentService;
    let peerService: InstrumentService;

    beforeEach(async () => {
      harness = await factory();
      repository = harness.repository;
      peer = harness.peer;
      // A shared stream prevents false ID collisions between independent clients.
      let sequence = 0;
      const generateId = () => id(++sequence);
      service = new InstrumentService(repository, () => initialTime, generateId);
      peerService = new InstrumentService(peer, () => laterTime, generateId);
    }, 30000);

    afterEach(async () => {
      vi.restoreAllMocks();
      const current = harness;
      harness = undefined;
      await current?.dispose();
    });

    it('returns null and empty pages for missing records', async () => {
      expect(await repository.get(missingId)).toBeNull();
      expect(await repository.list(listAll)).toEqual([]);
      expect(await peer.get(missingId)).toBeNull();
    });

    it('round trips Unicode, optional nulls, false and quotation metadata without coercion', async () => {
      const value = record(1, {
        name: 'Synthetic Café e\u0301 😀', kind: 'stock', quote_currency: 'GBP',
        price_unit: 'hundredth_currency_unit', exchange_mic: 'XXXX', provider_symbol: 'SYNTH-A', active: false,
      });
      expect(await create(repository, value, 'metadata')).toEqual(value);
      expect(await peer.get(value.id)).toEqual(value);
      expect(await peer.list({ ...listAll, active: false })).toEqual([value]);
      expect(await repository.list({ ...listAll, active: true })).toEqual([]);
    });

    it('uses binary ascending IDs, exclusive continuation and an independent active filter', async () => {
      const values = [record(3), record(1, { active: false }), record(2)];
      for (const value of values) await create(repository, value, `order-${value.id}`);
      expect((await peer.list(listAll)).map(value => value.id)).toEqual([id(1), id(2), id(3)]);
      expect((await repository.list({ limit: 1, active: null, after: id(1) })).map(value => value.id)).toEqual([id(2)]);
      expect((await peer.list({ ...listAll, active: true, after: id(1) })).map(value => value.id)).toEqual([id(2), id(3)]);
      expect(await repository.list({ ...listAll, after: id(3) })).toEqual([]);
    });

    it('honors the internal 101-row lookahead limit', async () => {
      // Pagination setup is deterministic; dedicated cases below test races.
      for (let index = 0; index < 102; index++) {
        const value = record(index + 1);
        await create(index % 2 === 0 ? repository : peer, value, `limit-${index}`);
      }
      const page = await repository.list(listAll);
      expect(page).toHaveLength(101);
      expect(page[0]?.id).toBe(id(1));
      expect(page.at(-1)?.id).toBe(id(101));
      expect((await peer.list({ ...listAll, after: id(101) })).map(value => value.id)).toEqual([id(102)]);
    });

    it('copies caller input and all returned values instead of exposing storage references', async () => {
      const value = record(1);
      const expected = structuredClone(value);
      const result = await create(repository, value, 'copies');
      value.name = 'Changed caller input';
      result.name = 'Changed create result';
      const got = (await peer.get(expected.id))!;
      got.name = 'Changed get result';
      const listed = (await repository.list(listAll))[0]!;
      listed.name = 'Changed list result';
      expect(await peer.get(expected.id)).toEqual(expected);
      const replay = await create(peer, expected, 'copies');
      replay.name = 'Changed replay result';
      expect(await create(repository, expected, 'copies')).toEqual(expected);
    });

    it('freezes service canonical input v1, including ordered defaults and explicit nulls', async () => {
      const spy = vi.spyOn(repository, 'create');
      await service.create(admin, syntheticInput, 'canonical-v1');
      expect(spy.mock.calls[0]?.[1].canonicalInput).toBe(
        '{"name":"Synthetic ETF A","kind":"etf","isin":null,"quote_currency":"EUR","price_unit":"currency_unit","exchange_mic":null,"provider_symbol":null,"active":true}',
      );
    });

    it('replays the exact original outcome after PATCH despite equivalent explicit defaults and a new candidate', async () => {
      const original = await service.create(admin, syntheticInput, 'original');
      await peerService.update(admin, original.id, { name: 'Synthetic renamed', active: false }, 1);
      const replay = await peerService.create(admin, {
        active: true, provider_symbol: null, exchange_mic: null, isin: null, ...syntheticInput,
      }, 'original');
      expect(replay).toEqual(original);
      expect(replay.version).toBe(1);
      expect(await repository.get(original.id)).toEqual({ ...original, name: 'Synthetic renamed', active: false, version: 2, updated_at: laterTime });
      expect(await peer.list(listAll)).toHaveLength(1);
    });

    it('rejects changed canonical input under the same key without adding a record', async () => {
      const original = await service.create(admin, syntheticInput, 'changed');
      await expect(peerService.create(admin, { ...syntheticInput, name: 'Different synthetic name' }, 'changed'))
        .rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
      expect(await repository.list(listAll)).toEqual([original]);
    });

    it('scopes keys by subject and permits multiple null ISINs', async () => {
      const first = await service.create(admin, syntheticInput, 'subject-key');
      const second = await peerService.create({ ...admin, subject: 'synthetic-other-subject' }, syntheticInput, 'subject-key');
      const third = await service.create(admin, syntheticInput, 'different-key');
      expect(new Set([first.id, second.id, third.id]).size).toBe(3);
      expect(await peer.list(listAll)).toHaveLength(3);
    });

    it('retains inactive ISIN identity uniqueness and does not reserve a key on failed creation', async () => {
      const original = await service.create(admin, { ...syntheticInput, isin: syntheticIsin }, 'identity');
      await peerService.update(admin, original.id, { active: false }, 1);
      await expect(peerService.create(admin, { ...syntheticInput, isin: syntheticIsin }, 'retryable'))
        .rejects.toMatchObject({ status: 409, code: 'duplicate_isin' });
      expect((await service.create(admin, syntheticInput, 'retryable')).isin).toBeNull();
      expect(await repository.list(listAll)).toHaveLength(2);
    });

    it('returns one outcome for concurrent same-key same-input requests from both clients', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, (_, index) =>
        (index % 2 === 0 ? service : peerService).create(admin, syntheticInput, 'concurrent-key')));
      for (const result of results) expect(result).toEqual(results[0]);
      expect(await repository.list(listAll)).toHaveLength(1);
    });

    it('has one winner for concurrent same-key changed-input requests', async () => {
      const results = await Promise.allSettled([
        service.create(admin, syntheticInput, 'different-input-race'),
        peerService.create(admin, { ...syntheticInput, name: 'Synthetic competing input' }, 'different-input-race'),
      ]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(result => result.status === 'rejected');
      expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({ status: 409, code: 'idempotency_conflict' });
      expect(await peer.list(listAll)).toHaveLength(1);
    });

    it('has one winner for concurrent different-key same-ISIN creates and keeps the failed key retryable', async () => {
      const clients = [service, peerService];
      const results = await Promise.allSettled(clients.map((client, index) =>
        client.create(admin, { ...syntheticInput, isin: syntheticIsin }, `identity-race-${index}`)));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const failedIndex = results.findIndex(result => result.status === 'rejected');
      const failure = results[failedIndex];
      expect(failure?.status === 'rejected' ? failure.reason : undefined).toMatchObject({ status: 409, code: 'duplicate_isin' });
      await clients[failedIndex]!.create(admin, syntheticInput, `identity-race-${failedIndex}`);
      expect(await repository.list(listAll)).toHaveLength(2);
    });

    it('increments a no-op-value PATCH and does not mutate state on a stale update', async () => {
      const original = await service.create(admin, syntheticInput, 'noop');
      const updated = await peer.update(original.id, 1, { name: original.name }, laterTime);
      expect(updated).toEqual({ ...original, version: 2, updated_at: laterTime });
      await expect(repository.update(original.id, 1, { active: false }, initialTime))
        .rejects.toMatchObject({ status: 412, code: 'version_mismatch' });
      expect(await repository.get(original.id)).toEqual(updated);
    });

    it('allows one competing CAS winner and returns its exact post-update state', async () => {
      const original = await service.create(admin, syntheticInput, 'cas');
      const results = await Promise.allSettled([
        repository.update(original.id, 1, { name: 'Synthetic winner A' }, initialTime),
        peer.update(original.id, 1, { name: 'Synthetic winner B', active: false }, laterTime),
      ]);
      const winners = results.filter(result => result.status === 'fulfilled');
      expect(winners).toHaveLength(1);
      const failure = results.find(result => result.status === 'rejected');
      expect(failure?.status === 'rejected' ? failure.reason : undefined).toMatchObject({ status: 412, code: 'version_mismatch' });
      expect(winners[0]?.status === 'fulfilled' ? winners[0].value : undefined).toEqual(await peer.get(original.id));
      expect((await repository.get(original.id))?.version).toBe(2);
    });

    it('preserves missing, stale and maximum-version error precedence without modifying boundary state', async () => {
      const boundary = record(999999, { version: Number.MAX_SAFE_INTEGER });
      await harness!.seedBoundary(boundary);
      await expect(repository.update(missingId, Number.MAX_SAFE_INTEGER, { active: false }, laterTime))
        .rejects.toMatchObject({ status: 404, code: 'instrument_not_found' });
      await expect(peer.update(boundary.id, Number.MAX_SAFE_INTEGER - 1, { active: false }, laterTime))
        .rejects.toMatchObject({ status: 412, code: 'version_mismatch' });
      await expect(repository.update(boundary.id, Number.MAX_SAFE_INTEGER, { active: false }, laterTime))
        .rejects.toMatchObject({ status: 409, code: 'version_exhausted' });
      expect(await peer.get(boundary.id)).toEqual(boundary);
    });

    it('does not consume a key when shared service input validation fails', async () => {
      await expect(service.create(admin, { ...syntheticInput, version: 10 }, 'invalid-then-valid'))
        .rejects.toMatchObject({ status: 422 });
      expect((await peerService.create(admin, syntheticInput, 'invalid-then-valid')).version).toBe(1);
      expect(await repository.list(listAll)).toHaveLength(1);
    });
  });
}
