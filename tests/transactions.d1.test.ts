import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { D1InstrumentRepository } from '../src/adapters/d1/instruments';
import { TransactionService } from '../src/application/transactions';
import { firstId, openingInput, portfolioAdmin, portfolioFixture, portfolioReader, provenance } from './helpers/portfolio';
import { openLocalD1, type LocalD1 } from './helpers/d1-local.mjs';

describe('native local D1 transaction journal', () => {
  let f: Awaited<ReturnType<typeof portfolioFixture>>;
  let opening: Awaited<ReturnType<typeof f.service.append>>;
  let reopened: LocalD1 | undefined;
  const ids = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'];
  const input = { type: 'deposit', amount: '10.01', currency: 'EUR', effective_at: '2026-11-10T10:00:00.000Z', provenance };
  const binding = (id: string) => ({ portfolio_id: id, kind: 'real' as const, owner_subject: portfolioAdmin.subject,
    opening_id: opening.id, opening_revision: opening.revision });
  const clock = () => '2026-11-20T00:00:00.000Z';
  function service(id: string) {
    return new TransactionService(new D1TransactionRepository(f.local!.db), f.repository, f.instruments, binding(id), clock);
  }
  beforeAll(async () => {
    f = await portfolioFixture('d1');
    const initial = openingInput();
    opening = await f.service.append(portfolioAdmin, { ...initial, cash: { currency: 'EUR', amount: '100' },
      positions: [{ ...initial.positions[0]!, quantity: '2' }] }, 0, 'synthetic-opening');
  }, 30_000);
  afterAll(async () => { if (reopened) await reopened.cleanup(); else await f?.dispose(); });

  it('persists exact movements and counterposts without altering V1 opening rows', async () => {
    const s = service(ids[0]!);
    const before = await f.service.get(portfolioReader);
    await s.append(portfolioAdmin, ids[0], input, 0, 'deposit');
    const buy = await s.append(portfolioAdmin, ids[0], { ...input, type: 'buy', instrument_id: firstId,
      quantity: '0.000000000001', amount: '0.01' }, 1, 'buy');
    expect(buy.balances.cash.amount).toBe('110');
    expect(buy.balances.positions[0]!.quantity).toBe('2.000000000001');
    const reversed = await s.append(portfolioAdmin, ids[0], { type: 'reversal', effective_at: input.effective_at,
      reversal_of: buy.event.id, reason: 'Synthetic correction', provenance }, 2, 'reverse');
    expect(reversed.balances.cash.amount).toBe('110.01');
    expect(reversed.balances.positions[0]!.quantity).toBe('2');
    expect(await f.service.get(portfolioReader)).toEqual(before);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM opening_revisions').first('n')).toBe(1);
    await expect(f.local!.db.prepare('DELETE FROM transaction_events WHERE id=?').bind(buy.event.id).run()).rejects.toThrow();
    await expect(f.local!.db.prepare('UPDATE transaction_journals SET kind=? WHERE portfolio_id=?').bind('simulated', ids[0]).run()).rejects.toThrow();
  });

  it('atomically deduplicates concurrent replays and rolls back competing CAS writes', async () => {
    const s = service(ids[1]!);
    const replays = await Promise.all(Array.from({ length: 4 }, () => s.append(portfolioAdmin, ids[1], input, 0, 'same')));
    expect(new Set(replays.map(result => result.event.id)).size).toBe(1);
    const races = await Promise.allSettled(['a', 'b', 'c'].map(key => s.append(portfolioAdmin, ids[1], input, 1, key)));
    expect(races.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of races) if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 412 });
    expect((await s.get(portfolioReader, ids[1])).events).toHaveLength(2);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_outcomes WHERE portfolio_id=?').bind(ids[1]).first('n')).toBe(2);
    expect((await f.local!.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });

  it('rolls back journal creation when an incompatible opening anchor is supplied', async () => {
    const original = await service(ids[0]!).append(portfolioAdmin, ids[0], input, 0, 'deposit');
    const invalid = { event: { ...original.event, id: crypto.randomUUID(), portfolio_id: ids[2]! },
      balances: { ...original.balances, portfolio_id: ids[2]!, opening_id: '00000000-0000-4000-8000-000000000099' } };
    await expect(new D1TransactionRepository(f.local!.db).append(ids[2]!, 0, invalid,
      { subject: portfolioAdmin.subject, key: 'bad', canonical_input: 'synthetic-bad-anchor' }))
      .rejects.toMatchObject({ status: 409, code: 'opening_anchor_mismatch' });
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_journals WHERE portfolio_id=?').bind(ids[2]).first('n')).toBe(0);
  });

  it('recovers balances and the original idempotent outcome after reopening native D1', async () => {
    const original = await service(ids[0]!).append(portfolioAdmin, ids[0], input, 0, 'deposit');
    await f.local!.dispose();
    reopened = await openLocalD1({ directory: f.local!.directory, migrate: false });
    const s = new TransactionService(new D1TransactionRepository(reopened.db), new D1PortfolioRepository(reopened.db),
      new D1InstrumentRepository(reopened.db), binding(ids[0]!), clock);
    expect(await s.append(portfolioAdmin, ids[0], input, 0, 'deposit')).toEqual(original);
    expect((await s.get(portfolioReader, ids[0])).events).toHaveLength(3);
    expect((await s.get(portfolioReader, ids[0])).balances.cash.amount).toBe('110.01');
  }, 30_000);
});
