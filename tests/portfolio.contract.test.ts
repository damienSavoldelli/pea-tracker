import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortfolioService } from '../src/application/portfolio';
import { openingInputSchema } from '../src/domain/portfolio';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { openLocalD1 } from './helpers/d1-local.mjs';
import { openingInput, portfolioAdmin as admin, portfolioReader as reader, portfolioFixture } from './helpers/portfolio';

for (const kind of ['memory', 'd1'] as const) describe(`${kind} opening-state service/repository contract`, () => {
  let f: Awaited<ReturnType<typeof portfolioFixture>>;
  beforeEach(async () => { f = await portfolioFixture(kind); }, 30000);
  afterEach(async () => { await f?.dispose(); });
  const append = (input: unknown = openingInput(), expected = 0, key = 'opening') => f.service.append(admin, input, expected, key);

  it('retains declared values and provenance without reconstructing cost or history', async () => {
    const state = await append();
    expect(state).toMatchObject({ revision: 1, effective_at: openingInput().effective_at, cash: { currency: 'EUR', amount: '12.3' } });
    expect(state.positions[0]).toMatchObject({ quantity: '9007199254740993', declared_pru: '3.12' });
    const positions = await f.service.positions(reader, {});
    expect(positions.data).toEqual(state.positions);
    expect(positions.history).toEqual({ performance_available: false, reason: 'opening_state_only' });
    expect(JSON.stringify(positions)).not.toContain('total_cost');
    state.positions.length = 0;
    expect((await f.service.get(reader)).positions).toHaveLength(2);
  });

  it('persists complete corrections and immutable earlier revisions', async () => {
    const original = await append();
    const input = { ...openingInput(), correction_reason: 'Synthetic reconciliation', positions: [openingInput().positions[1]!] };
    const corrected = await append(input, 1, 'correct');
    expect(corrected.revision).toBe(2);
    expect((await f.service.positions(reader, {})).data).toEqual(corrected.positions);
    expect(await f.service.get(reader, 1)).toEqual(original);
    expect(await append()).toEqual(original);
    await expect(append({ ...input, effective_at: '2026-11-08T00:00:00.000Z' }, 2, 'bad-date')).rejects.toMatchObject({ status: 409, code: 'opening_date_immutable' });
    expect((await f.service.get(reader)).revision).toBe(2);
  });

  it('binds idempotency to subject/input/version and replays before stale CAS', async () => {
    const original = await append();
    expect(await append({ ...openingInput(), positions: [...openingInput().positions].reverse() })).toEqual(original);
    await expect(append({ ...openingInput(), cash: null })).rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    await expect(f.service.append({ ...admin, subject: 'synthetic-other' }, openingInput(), 0, 'opening')).rejects.toMatchObject({ status: 412 });
    expect((await f.service.get(reader)).revision).toBe(1);
  });

  it('commits a single initial state under concurrent distinct keys', async () => {
    const outcomes = await Promise.allSettled(['one', 'two', 'three'].map(key => append(openingInput(), 0, key)));
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    for (const item of outcomes) if (item.status === 'rejected') expect(item.reason).toMatchObject({ status: 412 });
    expect((await f.service.get(reader)).revision).toBe(1);
  });

  it('concurrent replay returns one immutable original and concurrent corrections have one winner', async () => {
    const copies = await Promise.all(Array.from({ length: 4 }, () => append()));
    expect(copies.every(item => JSON.stringify(item) === JSON.stringify(copies[0]))).toBe(true);
    const correction = { ...openingInput(), correction_reason: 'Synthetic correction' };
    const outcomes = await Promise.allSettled(['a', 'b'].map(key => append(correction, 1, key)));
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect((await f.service.get(reader)).revision).toBe(2);
  });

  it('pins pagination to an immutable revision across a correction', async () => {
    await append();
    const first = await f.service.positions(reader, { limit: 1 });
    await append({ ...openingInput(), positions: [], correction_reason: 'Synthetic empty replacement' }, 1, 'empty');
    const next = await f.service.positions(reader, { limit: 1, cursor: first.page.next_cursor });
    expect(next.revision).toBe(1);
    expect(next.data[0]?.instrument_id).toBe(openingInput().positions[1]?.instrument_id);
    expect(next.page.next_cursor).toBeNull();
    expect((await f.service.positions(reader, {})).data).toEqual([]);
    await expect(f.service.positions(reader, { cursor: 'invalid' })).rejects.toMatchObject({ status: 400 });
  });

  it('denies missing/read-only/collector principals before storage, and rejects invalid input', async () => {
    const write = vi.spyOn(f.repository, 'append');
    await expect(f.service.append(null, {}, 0, 'key')).rejects.toMatchObject({ status: 401 });
    await expect(f.service.append(reader, openingInput(), 0, 'key')).rejects.toMatchObject({ status: 403 });
    await expect(f.service.get({ subject: 'synthetic-collector', permissions: ['quotes:ingest'] })).rejects.toMatchObject({ status: 403 });
    await expect(append({ ...openingInput(), positions: [openingInput().positions[0]!, openingInput().positions[0]!] })).rejects.toMatchObject({ status: 422 });
    await expect(append({ ...openingInput(), positions: [{ ...openingInput().positions[0], instrument_id: '00000000-0000-4000-8000-000000000099' }] })).rejects.toMatchObject({ status: 422, code: 'unknown_instrument' });
    await expect(append({ ...openingInput(), effective_at: '2026-11-11T00:00:00.000Z' })).rejects.toMatchObject({ status: 422 });
    await expect(append({ ...openingInput(), correction_reason: 'Unexpected initial reason' })).rejects.toMatchObject({ status: 422 });
    await expect(append({ ...openingInput(), positions: [{ ...openingInput().positions[0], quantity: 1 }] })).rejects.toMatchObject({ status: 422 });
    await expect(append(openingInput(), 0, '')).rejects.toMatchObject({ status: 400 });
    expect(write).not.toHaveBeenCalled();
  });

  it('does not fabricate an initial zero portfolio; supports unknown cash explicitly', async () => {
    await expect(f.service.positions(reader, {})).rejects.toMatchObject({ status: 404 });
    await expect(f.service.get(reader, 1)).rejects.toMatchObject({ status: 404 });
    expect((await append({ ...openingInput(), cash: null, positions: [] })).cash).toBeNull();
    await expect(f.service.get(reader, 2)).rejects.toMatchObject({ status: 404 });
    await expect(append({ ...openingInput(), correction_reason: null }, 1, 'no-reason')).rejects.toMatchObject({ status: 422 });
  });
});

describe('opening-state boundary validation', () => {
  it.each([
    { quantity: '-1' }, { quantity: '0' }, { declared_pru: '-1' }, { declared_pru: '1e3' },
    { quantity: '0.0000000000001' }, { historical_total_cost: '100' },
  ])('rejects unsupported financial inputs %j', patch => {
    expect(openingInputSchema.safeParse({ ...openingInput(), positions: [{ ...openingInput().positions[0], ...patch }] }).success).toBe(false);
  });
});

describe('native D1 opening atomicity, immutability and restart', () => {
  it('rolls back dependent FK/SQL failures, leaves no outcome, and survives a proxy restart', async () => {
    const f = await portfolioFixture('d1');
    try {
      const original = await f.service.append(admin, openingInput(), 0, 'durable');
      const correction = { ...original, id: crypto.randomUUID(), revision: 2, correction_reason: 'Synthetic direct FK failure',
        positions: [{ ...original.positions[0]!, instrument_id: '00000000-0000-4000-8000-000000000099' }] };
      await expect(f.repository.append(correction, 1, { subject: admin.subject, key: 'fk-fail', canonicalInput: 'synthetic-fk-failure' })).rejects.toMatchObject({ status: 422 });
      expect(await f.local!.db.prepare('SELECT count(*) n FROM opening_revisions').first('n')).toBe(1);
      expect(await f.local!.db.prepare("SELECT count(*) n FROM opening_outcomes WHERE idempotency_key='fk-fail'").first('n')).toBe(0);
      await f.local!.db.exec("CREATE TRIGGER synthetic_receipt_failure BEFORE INSERT ON opening_outcomes WHEN NEW.idempotency_key='sql-fail' BEGIN SELECT RAISE(ABORT,'synthetic_batch_failure'); END;");
      await expect(f.service.append(admin, { ...openingInput(), correction_reason: 'Synthetic SQL rollback' }, 1, 'sql-fail')).rejects.toThrow('Opening state storage operation failed');
      expect(await f.local!.db.prepare('SELECT count(*) n FROM opening_revisions').first('n')).toBe(1);
      expect(await f.local!.db.prepare('SELECT count(*) n FROM opening_positions').first('n')).toBe(2);
      for (const table of ['opening_revisions', 'opening_positions', 'opening_outcomes']) {
        await expect(f.local!.db.prepare(`DELETE FROM ${table}`).run()).rejects.toThrow('immutable_opening');
      }
      await expect(f.local!.db.prepare('UPDATE opening_revisions SET effective_at = effective_at').run()).rejects.toThrow('immutable_opening');
      await expect(f.local!.db.prepare('UPDATE opening_positions SET quantity = quantity').run()).rejects.toThrow('immutable_opening');
      await expect(f.local!.db.prepare('UPDATE opening_outcomes SET canonical_input = canonical_input').run()).rejects.toThrow('immutable_opening');
      const directory = f.local!.directory;
      await f.local!.dispose();
      const reopened = await openLocalD1({ directory, migrate: false });
      try {
        const repository = new D1PortfolioRepository(reopened.db);
        const service = new PortfolioService(repository, f.instruments, () => '2026-11-10T00:00:00.000Z');
        // Read/replay at repository boundary avoids using the disposed catalog proxy.
        expect(await repository.get()).toEqual(original);
        const canonicalInput = JSON.stringify({ expected: 0, input: openingInputSchema.parse(openingInput()) });
        expect(await repository.append({ ...original, id: crypto.randomUUID() }, 0, { subject: admin.subject, key: 'durable', canonicalInput })).toEqual(original);
        expect((await service.get(reader)).revision).toBe(1);
        expect((await reopened.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
      } finally { await reopened.cleanup(); }
    } finally { await f.dispose(); }
  }, 60000);
});
