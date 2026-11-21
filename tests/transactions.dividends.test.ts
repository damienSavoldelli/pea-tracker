import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../src/application/transactions';
import { PortfolioService } from '../src/application/portfolio';
import { MemoryTransactionRepository } from '../src/adapters/memory/transactions';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import type { TransactionRepository } from '../src/ports/transactions';
import { firstId, secondId, openingInput, portfolioAdmin, portfolioFixture, portfolioReader, provenance } from './helpers/portfolio';

const effective_at = '2026-11-10T10:00:00.000Z';
const clock = () => '2026-11-20T00:00:00.000Z';
const dividend = (amount = '5.20', instrument_id?: string) => ({ type: 'dividend', currency: 'EUR', amount,
  effective_at, provenance: { ...provenance, reference: 'synthetic-dividend-reference' }, ...(instrument_id ? { instrument_id } : {}) });
const reversal = (reversal_of: string) => ({ type: 'reversal', reversal_of, effective_at, provenance, reason: 'Synthetic dividend correction' });

for (const kind of ['memory', 'd1'] as const) describe(`${kind} received dividends`, () => {
  let f: Awaited<ReturnType<typeof portfolioFixture>>;
  let opening: Awaited<ReturnType<typeof f.service.get>>;
  let repository: TransactionRepository;
  let id: string;
  let service: TransactionService;
  let portfolio: PortfolioService;
  function make(portfolio_id: string, nature: 'real' | 'simulated' = 'real') {
    return new TransactionService(repository, f.repository, f.instruments, { portfolio_id, kind: nature,
      owner_subject: portfolioAdmin.subject, opening_id: opening.id, opening_revision: opening.revision }, clock);
  }
  beforeAll(async () => {
    f = await portfolioFixture(kind);
    const input = openingInput();
    opening = await f.service.append(portfolioAdmin, { ...input, cash: { currency: 'EUR', amount: '100' },
      positions: [{ ...input.positions[0]!, quantity: '2', declared_pru: '10' }] }, 0, 'synthetic-opening');
    repository = f.local ? new D1TransactionRepository(f.local.db) : new MemoryTransactionRepository();
  }, 30000);
  beforeEach(() => {
    id = crypto.randomUUID(); service = make(id);
    portfolio = new PortfolioService(f.repository, f.instruments, clock, undefined, service);
  });
  afterAll(async () => { await f?.dispose(); });
  const append = (input: unknown, version: number, key: string) => service.append(portfolioAdmin, id, input, version, key);
  const current = () => portfolio.current(portfolioReader, id);

  it('credits only received EUR cash, preserving holdings, exact cost/PRU, opening data and external reference', async () => {
    const before = await current();
    const result = await append(dividend('5.20', firstId), 0, 'dividend');
    expect(result.event).toMatchObject({ portfolio_id: id, instrument_id: firstId, quantity_delta: null, cash_delta: '5.2',
      input: { type: 'dividend', amount: '5.2', effective_at, provenance: { reference: 'synthetic-dividend-reference' } } });
    const after = await current();
    expect(after.cash.amount).toBe('105.2');
    expect(after.positions.map(({ quantity, pru, remaining_cost }) => ({ quantity, pru, remaining_cost })))
      .toEqual(before.positions.map(({ quantity, pru, remaining_cost }) => ({ quantity, pru, remaining_cost })));
    expect(after.dividends).toEqual({ currency: 'EUR', scope: 'recorded_since_opening', amount_basis: 'cash_received',
      received: '5.2', reversed: '0', net_received: '5.2', payments: 1, reversals: 0 });
    expect(await f.service.get(portfolioReader)).toEqual(opening);
    expect(result.event.input).not.toHaveProperty('tax'); expect(result.event.input).not.toHaveProperty('gross_amount');
  });

  it('accepts an unknown attribution/reference or a catalogued instrument no longer held without phantom holdings', async () => {
    const unattributed = await append({ ...dividend('0.01'), provenance: { ...provenance, reference: null } }, 0, 'unknown');
    expect(unattributed.event).toMatchObject({ instrument_id: null, quantity_delta: null, input: { provenance: { reference: null } } });
    expect(unattributed.event.input).not.toHaveProperty('instrument_id');
    await append(dividend('1', secondId), 1, 'not-held');
    expect(await current()).toMatchObject({ cash: { amount: '101.01' }, dividends: { received: '1.01', payments: 2 } });
    expect((await current()).positions.map(position => position.instrument_id)).toEqual([firstId]);
  });

  it('counterposts received cash without changing cost or deleting the original event, and retains original replay results', async () => {
    const original = await append(dividend('7.30', firstId), 0, 'original');
    const undone = await append(reversal(original.event.id), 1, 'reverse');
    expect(undone.event).toMatchObject({ cash_delta: '-7.3', quantity_delta: null, instrument_id: firstId });
    expect(await current()).toMatchObject({ cash: { amount: '100' }, positions: [{ quantity: '2', remaining_cost: { value: '20' }, pru: { value: '10' } }],
      dividends: { received: '7.3', reversed: '7.3', net_received: '0', payments: 1, reversals: 1 } });
    expect((await service.get(portfolioReader, id)).events[0]).toEqual(original.event);
    expect(await append(dividend('7.30', firstId), 0, 'original')).toEqual(original);
    expect(await append(reversal(original.event.id), 1, 'reverse')).toEqual(undone);
    await expect(append(reversal(original.event.id), 2, 'duplicate')).rejects.toMatchObject({ code: 'transaction_already_reversed' });
  });

  it('refuses counterposting spent cash without an untracked negative balance', async () => {
    const original = await append(dividend('10'), 0, 'income');
    await append({ type: 'withdrawal', amount: '110', currency: 'EUR', effective_at, provenance }, 1, 'withdraw');
    await expect(append(reversal(original.event.id), 2, 'reverse')).rejects.toMatchObject({ code: 'insufficient_cash' });
    expect(await current()).toMatchObject({ journal: { version: 2 }, cash: { amount: '0' }, dividends: { received: '10', reversed: '0' } });
  });

  it('deduplicates concurrent payments and enforces fee-independent CAS/idempotence including attribution and reference', async () => {
    const replays = await Promise.all(Array.from({ length: 4 }, () => append(dividend('1', firstId), 0, 'same')));
    expect(new Set(replays.map(value => value.event.id)).size).toBe(1);
    expect(await append(dividend('001.00', firstId), 0, 'same')).toEqual(replays[0]);
    for (const changed of [dividend('2', firstId), dividend('1', secondId),
      { ...dividend('1', firstId), provenance: { ...provenance, reference: 'other-reference' } }]) {
      await expect(append(changed, 0, 'same')).rejects.toMatchObject({ code: 'idempotency_conflict' });
    }
    const race = await Promise.allSettled(['a', 'b'].map(key => append(dividend('1'), 1, key)));
    expect(race.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(race.filter(value => value.status === 'rejected')[0]).toMatchObject({ reason: { status: 412 } });
    expect((await current()).dividends).toMatchObject({ received: '2', payments: 2 });
    const reopened = make(id);
    expect(await reopened.append(portfolioAdmin, id, dividend('1', firstId), 0, 'same')).toEqual(replays[0]);
  });

  it('isolates dividend totals and corrections for real/simulated portfolios sharing storage', async () => {
    const real = await append(dividend('1'), 0, 'same');
    const otherId = crypto.randomUUID(); const simulated = make(otherId, 'simulated');
    const result = await simulated.append(portfolioAdmin, otherId, dividend('2'), 0, 'same');
    const simulatedRead = new PortfolioService(f.repository, f.instruments, clock, undefined, simulated);
    expect(await simulatedRead.current(portfolioReader, otherId)).toMatchObject({ kind: 'simulated', cash: { amount: '102' }, dividends: { net_received: '2' } });
    expect(await current()).toMatchObject({ kind: 'real', cash: { amount: '101' }, dividends: { net_received: '1' } });
    await expect(simulated.append(portfolioAdmin, otherId, reversal(real.event.id), 1, 'foreign')).rejects.toMatchObject({ code: 'transaction_not_found' });
    await expect(service.get(portfolioReader, otherId)).rejects.toMatchObject({ status: 403 });
    expect(result.event.portfolio_id).toBe(otherId);
  });

  it('rejects invalid amounts, unknown attribution, tax/fee inventions and writes from read-only callers', async () => {
    for (const changed of [dividend('0'), dividend('-1'), dividend('0.001'), { ...dividend(), currency: 'USD' },
      { ...dividend(), instrument_id: null }, { ...dividend(), quantity: '1' }, { ...dividend(), fees: '0' },
      { ...dividend(), tax: '1' }, { ...dividend(), gross_amount: '10' }]) {
      await expect(append(changed, 0, 'invalid')).rejects.toMatchObject({ status: 422 });
    }
    await expect(append(dividend('1', '00000000-0000-4000-8000-000000000099'), 0, 'missing')).rejects.toMatchObject({ code: 'unknown_instrument' });
    await expect(service.append(portfolioReader, id, dividend('1'), 0, 'forbidden')).rejects.toMatchObject({ status: 403 });
    expect((await service.get(portfolioReader, id)).events).toEqual([]);
  });

  it('keeps cent-exact aggregate income beyond individual balance bounds without blocking valid reads', async () => {
    const maximum = '999999999999999999999999999999';
    await append({ type: 'withdrawal', amount: '100', currency: 'EUR', effective_at, provenance }, 0, 'empty');
    await append(dividend(maximum), 1, 'first');
    await append({ type: 'withdrawal', amount: maximum, currency: 'EUR', effective_at, provenance }, 2, 'spend');
    await append(dividend(maximum), 3, 'second');
    expect(await current()).toMatchObject({ cash: { amount: maximum }, dividends: { received: '1999999999999999999999999999998', net_received: '1999999999999999999999999999998' } });
  });
});
