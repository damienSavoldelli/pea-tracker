import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../src/application/transactions';
import { PortfolioService } from '../src/application/portfolio';
import { MemoryTransactionRepository } from '../src/adapters/memory/transactions';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { applyTransaction, initialJournalBalances, transactionInputSchema } from '../src/domain/transactions';
import type { TransactionRepository } from '../src/ports/transactions';
import { createTransactionApp } from '../src/transaction-app';
import { firstId, openingInput, portfolioAdmin, portfolioFixture, portfolioReader, provenance } from './helpers/portfolio';

const effective_at = '2026-11-10T10:00:00.000Z';
const clock = () => '2026-11-20T00:00:00.000Z';
const trade = (type: 'buy' | 'sell', amount = '30', fees?: string, quantity = '3') => ({
  type, amount, ...(fees !== undefined ? { fees } : {}), quantity, instrument_id: firstId, currency: 'EUR', effective_at, provenance,
});

for (const kind of ['memory', 'd1'] as const) describe(`${kind} explicit trade fees`, () => {
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

  it('preserves absent fees and their replay shape, while explicit zero fees are recorded distinctly', async () => {
    // Seed the pre-fees canonical receipt, not a receipt built by the extended parser.
    const binding = { portfolio_id: id, kind: 'real' as const, owner_subject: portfolioAdmin.subject, opening_id: opening.id, opening_revision: opening.revision };
    const input = { effective_at, provenance, currency: 'EUR' as const, amount: '30', type: 'buy' as const, instrument_id: firstId, quantity: '3' };
    const original = applyTransaction(initialJournalBalances(binding, opening), [], input,
      { id: crypto.randomUUID(), recorded_at: clock(), actor: portfolioAdmin.subject });
    await repository.append(id, 0, original, { subject: portfolioAdmin.subject, key: 'legacy',
      canonical_input: JSON.stringify({ binding, expected: 0, input }) });
    const legacy = await append(trade('buy'), 0, 'legacy');
    expect(legacy).toEqual(original);
    expect(legacy.event.input).not.toHaveProperty('fees');
    expect(legacy.balances.cash.amount).toBe('70');
    const withZero = await append(trade('buy', '30', '0.00'), 1, 'zero');
    expect(withZero.event.input).toMatchObject({ fees: '0' });
    expect(withZero.balances.cash.amount).toBe('40');
    expect(await append(trade('buy'), 0, 'legacy')).toEqual(legacy);
    expect(await append(trade('buy', '30', '000.00'), 1, 'zero')).toEqual(withZero);
    await expect(append(trade('buy', '30', '0'), 0, 'legacy')).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect((await current()).positions[0]!.remaining_cost).toMatchObject({ value: '80' });
  });

  it('capitalizes purchase fees once in cash and remaining cost, retaining unknown opening fee treatment', async () => {
    const before = await f.service.get(portfolioReader);
    const result = await append(trade('buy', '30', '1.25'), 0, 'buy');
    expect(result.event).toMatchObject({ cash_delta: '-31.25', input: { amount: '30', fees: '1.25' } });
    expect(await current()).toMatchObject({ cash: { amount: '68.75' },
      positions: [{ remaining_cost: { value: '51.25' }, pru: { value: '10.25' }, cost_provenance: { opening: provenance, opening_fees: 'unknown' } }],
      cost_basis_policy: { version: 3, opening_fees: 'unknown', omitted_fees: 'not_declared_no_adjustment' } });
    expect(await f.service.get(portfolioReader)).toEqual(before);
  });

  it('deducts sale fees from proceeds without changing PRU, then clears cost on a full sale', async () => {
    const sale = await append(trade('sell', '50', '2.50', '1'), 0, 'partial');
    expect(sale.event.cash_delta).toBe('47.5');
    expect(await current()).toMatchObject({ cash: { amount: '147.5' }, positions: [{ quantity: '1', remaining_cost: { value: '10' }, pru: { value: '10' } }] });
    await append(trade('sell', '5', '0.50', '1'), 1, 'full');
    expect(await current()).toMatchObject({ cash: { amount: '152' }, positions: [] });
  });

  it('counterposts the full original cash/quantity/cost effects including fees, without altering the original', async () => {
    const buy = await append(trade('buy', '20', '0.20', '1'), 0, 'buy');
    const undo = (eventId: string) => ({ type: 'reversal', reversal_of: eventId, effective_at, provenance, reason: 'Synthetic fee correction' });
    await append(undo(buy.event.id), 1, 'undo-buy');
    expect(await current()).toMatchObject({ cash: { amount: '100' }, positions: [{ quantity: '2', remaining_cost: { value: '20' } }] });
    const sale = await append(trade('sell', '20', '0.20', '1'), 2, 'sell');
    await append(undo(sale.event.id), 3, 'undo-sell');
    expect(await current()).toMatchObject({ cash: { amount: '100' }, positions: [{ quantity: '2', remaining_cost: { value: '20' }, pru: { value: '10' } }] });
    expect((await service.get(portfolioReader, id)).events[0]).toEqual(buy.event);
    expect(transactionInputSchema.safeParse({ ...undo(buy.event.id), fees: '1' }).success).toBe(false);
  });

  it('supports cent-exact fees, fractional quantities and zero net proceeds without intermediate rounding', async () => {
    await append(trade('buy', '0.01', '0.01', '0.000000000001'), 0, 'tiny');
    expect(await current()).toMatchObject({ cash: { amount: '99.98' }, positions: [{ quantity: '2.000000000001', remaining_cost: { value: '20.02', rounded: false } }] });
    const zeroNet = await append(trade('sell', '0.01', '0.01', '0.000000000001'), 1, 'zero-net');
    expect(zeroNet.event.cash_delta).toBe('0');
    expect((await current()).cash.amount).toBe('99.98');
  });

  it('rejects invalid fees, negative sale proceeds and unaffordable fee-inclusive purchases without writing', async () => {
    for (const fees of ['-0.01', '0.001', '1e-2', '', null, 1]) {
      await expect(append({ ...trade('buy'), fees }, 0, 'invalid')).rejects.toMatchObject({ status: 422 });
    }
    await expect(append(trade('sell', '1', '1.01', '1'), 0, 'negative-net')).rejects.toMatchObject({ code: 'negative_sale_proceeds' });
    await expect(append(trade('buy', '100', '0.01', '1'), 0, 'too-much')).rejects.toMatchObject({ code: 'insufficient_cash' });
    expect((await service.get(portfolioReader, id)).events).toEqual([]);
    expect((await current()).cash.amount).toBe('100');
    expect(transactionInputSchema.safeParse({ type: 'deposit', amount: '1', fees: '0', currency: 'EUR', effective_at, provenance }).success).toBe(false);
  });

  it('includes fees in idempotence and isolates real/simulated portfolios on the same storage', async () => {
    const first = await append(trade('buy', '20', '1', '1'), 0, 'same');
    expect(await append(trade('buy', '020.00', '01.00', '1'), 0, 'same')).toEqual(first);
    await expect(append(trade('buy', '20', '2', '1'), 0, 'same')).rejects.toMatchObject({ code: 'idempotency_conflict' });
    const otherId = crypto.randomUUID(); const simulated = make(otherId, 'simulated');
    const result = await simulated.append(portfolioAdmin, otherId, trade('buy', '20', '2', '1'), 0, 'same');
    expect(result.balances).toMatchObject({ kind: 'simulated', cash: { amount: '78' } });
    expect((await current()).cash.amount).toBe('79');
    await expect(service.get(portfolioReader, otherId)).rejects.toMatchObject({ status: 403 });
    const reopened = make(id);
    expect(await reopened.append(portfolioAdmin, id, trade('buy', '20', '1', '1'), 0, 'same')).toEqual(first);
  });

  it('retains large decimal amounts exactly and accepts fee-bearing transactions through the administrative REST API', async () => {
    await append({ type: 'deposit', amount: '9007199254740993.02', currency: 'EUR', effective_at, provenance }, 0, 'large-cash');
    const app = createTransactionApp(service, () => portfolioAdmin);
    const result = await app.request(`/api/v1/portfolios/${id}/transactions`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"1"', 'Idempotency-Key': 'large' },
      body: JSON.stringify(trade('buy', '9007199254740993', '0.01', '1')) });
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({ event: { input: { fees: '0.01' }, cash_delta: '-9007199254740993.01' }, balances: { cash: { amount: '100.01' } } });
    expect((await current()).positions[0]!.remaining_cost).toMatchObject({ value: '9007199254741013.01', rounded: false });
  });
});
