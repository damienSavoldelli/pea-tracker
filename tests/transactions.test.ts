import { beforeEach, describe, expect, it } from 'vitest';
import { TransactionService } from '../src/application/transactions';
import { MemoryTransactionRepository } from '../src/adapters/memory/transactions';
import { transactionInputSchema } from '../src/domain/transactions';
import { createTransactionApp } from '../src/transaction-app';
import { firstId, openingInput, portfolioAdmin, portfolioFixture, portfolioReader, provenance } from './helpers/portfolio';
import { validateOpenApi } from './helpers/openapi';
import transactionApi from '../aidd_docs/api/transactions.openapi.json';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const portfolioId = '10000000-0000-4000-8000-000000000001';
const otherPortfolioId = '10000000-0000-4000-8000-000000000002';
const at = '2026-11-10T10:00:00.000Z';
const transfer = (type = 'deposit', amount = '10', effective_at = at) => ({ type, amount, effective_at, currency: 'EUR', provenance });
const trade = (type = 'buy', quantity = '3', amount = '30', effective_at = at) => ({ ...transfer(type, amount, effective_at), instrument_id: firstId, quantity });

describe('isolated portfolio financial journal', () => {
  let f: Awaited<ReturnType<typeof portfolioFixture>>;
  let opening: Awaited<ReturnType<typeof f.service.append>>;
  let repository: MemoryTransactionRepository;
  let service: TransactionService;
  beforeEach(async () => {
    f = await portfolioFixture('memory');
    const input = openingInput();
    opening = await f.service.append(portfolioAdmin, { ...input, cash: { currency: 'EUR', amount: '100' },
      positions: [{ ...input.positions[0]!, quantity: '2' }] }, 0, 'synthetic-opening');
    repository = new MemoryTransactionRepository();
    service = make();
  });
  function make(id = portfolioId, kind: 'real' | 'simulated' = 'real', baseline = opening) {
    const openings = baseline === opening ? f.repository : { get: async (revision?: number) => revision === baseline.revision ? structuredClone(baseline) : null };
    return new TransactionService(repository, openings,
      f.instruments, { portfolio_id: id, kind, owner_subject: portfolioAdmin.subject,
        opening_id: baseline.id, opening_revision: baseline.revision }, () => '2026-11-20T00:00:00.000Z');
  }
  const append = (input: unknown, expected: number, key: string) => service.append(portfolioAdmin, portfolioId, input, expected, key);
  const get = () => service.get(portfolioReader, portfolioId);

  it('applies deposits, buys, sells and withdrawals without altering any V1 opening value or declared PRU', async () => {
    const before = await f.service.get(portfolioReader);
    await append(transfer('deposit', '100'), 0, 'deposit');
    await append(trade(), 1, 'buy');
    await append(trade('sell', '1', '15'), 2, 'sell');
    const result = await append(transfer('withdrawal', '5'), 3, 'withdraw');
    expect(result.balances).toMatchObject({ portfolio_id: portfolioId, kind: 'real', version: 4,
      opening_id: opening.id, opening_revision: 1, cash: { currency: 'EUR', amount: '180' },
      positions: [{ instrument_id: firstId, quantity: '4' }], cost_basis_status: 'not_computed' });
    expect((await get()).events.map(event => event.cash_delta)).toEqual(['100', '-30', '15', '-5']);
    expect((await get()).events.every(event => event.actor === portfolioAdmin.subject && event.input.provenance.source === provenance.source)).toBe(true);
    expect(await f.service.get(portfolioReader)).toEqual(before);
  });

  it('keeps fractional quantities and amounts beyond Number.MAX_SAFE_INTEGER exact', async () => {
    const buy = await append(trade('buy', '0.000000000001', '0.01'), 0, 'fraction');
    expect(buy.balances.positions[0]!.quantity).toBe('2.000000000001');
    expect(buy.balances.cash.amount).toBe('99.99');
    await append(trade('sell', '0.000000000001', '0.01'), 1, 'fraction-sale');
    const deposit = await append(transfer('deposit', '9007199254740993.01'), 2, 'large');
    expect(deposit.balances.cash.amount).toBe('9007199254741093.01');
    expect(deposit.balances.positions[0]!.quantity).toBe('2');
  });

  it('omits an entirely sold position rather than retaining a negative or zero holding', async () => {
    expect((await append(trade('sell', '2', '20'), 0, 'all')).balances.positions).toEqual([]);
  });

  it('refuses a balance outside exact-decimal bounds without rounding or recording it', async () => {
    await expect(append(transfer('deposit', '999999999999999999999999999999'), 0, 'overflow'))
      .rejects.toMatchObject({ status: 409, code: 'balance_precision_exceeded' });
    expect((await get()).events).toEqual([]);
  });

  it('rejects unknown and non-EUR instruments before recording a trade', async () => {
    await expect(append({ ...trade(), instrument_id: '00000000-0000-4000-8000-000000000099' }, 0, 'unknown'))
      .rejects.toMatchObject({ status: 422, code: 'unknown_instrument' });
    const instrument = (await f.instruments.get(firstId))!;
    const unsupported = new TransactionService(repository, f.repository,
      { get: async () => ({ ...instrument, quote_currency: 'USD' }) },
      { portfolio_id: portfolioId, kind: 'real', owner_subject: portfolioAdmin.subject,
        opening_id: opening.id, opening_revision: opening.revision }, () => '2026-11-20T00:00:00.000Z');
    await expect(unsupported.append(portfolioAdmin, portfolioId, trade(), 0, 'fx'))
      .rejects.toMatchObject({ status: 422, code: 'unsupported_transaction_currency' });
    expect((await get()).events).toEqual([]);
  });

  it.each([
    [() => trade('sell', '2.000000000001', '20'), 'insufficient_quantity'],
    [() => trade('buy', '1', '100.01'), 'insufficient_cash'],
    [() => transfer('withdrawal', '100.01'), 'insufficient_cash'],
    [() => transfer('deposit', '1', '2026-11-09T00:00:00.000Z'), 'transaction_not_after_opening'],
    [() => transfer('deposit', '1', '2026-11-21T00:00:00.000Z'), 'future_transaction'],
  ] as const)('rejects an inadmissible movement without recording it (%s)', async (input, code) => {
    await expect(append(input(), 0, 'invalid')).rejects.toMatchObject({ status: 409, code });
    expect((await get()).events).toEqual([]);
    expect((await get()).balances.cash.amount).toBe('100');
  });

  it('rejects antidating while ordering equal effective instants by sequence', async () => {
    await append(transfer(), 0, 'first');
    await append(transfer(), 1, 'second');
    expect((await get()).events.map(event => event.sequence)).toEqual([1, 2]);
    await expect(append(transfer('deposit', '1', '2026-11-10T09:59:59.999Z'), 2, 'old'))
      .rejects.toMatchObject({ code: 'transaction_out_of_order' });
  });

  it('returns the immutable original outcome on replay, even after subsequent transactions', async () => {
    const first = await append(transfer(), 0, 'key');
    await append(transfer('deposit', '5'), 1, 'next');
    expect(await append(transfer('deposit', '010.00'), 0, 'key')).toEqual(first);
    await expect(append(transfer('deposit', '11'), 0, 'key')).rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    expect((await get()).events).toHaveLength(2);
    first.balances.cash.amount = '999';
    expect((await append(transfer(), 0, 'key')).balances.cash.amount).toBe('110');
    const detached = await get(); detached.events.splice(0);
    expect((await get()).events).toHaveLength(2);
  });

  it('deduplicates concurrent replays and permits only one CAS winner for competing appends', async () => {
    const copies = await Promise.all(Array.from({ length: 4 }, () => append(transfer(), 0, 'same')));
    expect(new Set(copies.map(value => value.event.id)).size).toBe(1);
    const results = await Promise.allSettled(['a', 'b', 'c'].map(key => append(transfer(), 1, key)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 412 });
    expect((await get()).events).toHaveLength(2);
  });

  it('counterposts a movement without altering its original event and refuses double reversal', async () => {
    const original = await append(trade(), 0, 'buy');
    const reverse = { type: 'reversal', reversal_of: original.event.id, effective_at: at, reason: 'Synthetic correction', provenance };
    const result = await append(reverse, 1, 'reverse');
    expect(result.event).toMatchObject({ cash_delta: '30', quantity_delta: '-3', instrument_id: firstId });
    expect(result.balances.cash.amount).toBe('100');
    expect(result.balances.positions[0]!.quantity).toBe('2');
    expect((await get()).events[0]).toEqual(original.event);
    expect(await append(reverse, 1, 'reverse')).toEqual(result);
    await expect(append(reverse, 2, 'again')).rejects.toMatchObject({ code: 'transaction_already_reversed' });
    await expect(append({ ...reverse, reversal_of: result.event.id }, 2, 'reverse-reversal'))
      .rejects.toMatchObject({ code: 'reversal_of_reversal_unsupported' });
  });

  it('applies solvency constraints to reversals as well as ordinary movements', async () => {
    const deposit = await append(transfer('deposit', '10'), 0, 'deposit');
    await append(transfer('withdrawal', '110'), 1, 'withdraw');
    await expect(append({ type: 'reversal', reversal_of: deposit.event.id, effective_at: at,
      reason: 'Synthetic correction', provenance }, 2, 'reverse')).rejects.toMatchObject({ code: 'insufficient_cash' });
    expect((await get()).events).toHaveLength(2);
  });

  it('refuses reversing an acquisition when the corresponding quantity is no longer available', async () => {
    const buy = await append(trade(), 0, 'buy');
    await append(trade('sell', '5', '50'), 1, 'sell-all');
    await expect(append({ type: 'reversal', reversal_of: buy.event.id, effective_at: at,
      reason: 'Synthetic correction', provenance }, 2, 'reverse')).rejects.toMatchObject({ code: 'insufficient_quantity' });
    expect((await get()).events).toHaveLength(2);
  });

  it('isolates portfolio identity and real/simulated classification, including idempotency', async () => {
    const simulation = make(otherPortfolioId, 'simulated');
    const real = await append(transfer(), 0, 'same-key');
    const simulated = await simulation.append(portfolioAdmin, otherPortfolioId, transfer('deposit', '20'), 0, 'same-key');
    expect(real.balances.cash.amount).toBe('110');
    expect(simulated.balances.cash.amount).toBe('120');
    await expect(service.get(portfolioReader, otherPortfolioId)).rejects.toMatchObject({ status: 403 });
    await expect(simulation.append(portfolioAdmin, otherPortfolioId, { type: 'reversal', reversal_of: real.event.id,
      effective_at: at, reason: 'Synthetic correction', provenance }, 1, 'cross')).rejects.toMatchObject({ code: 'transaction_not_found' });
    const misbound = make(portfolioId, 'simulated');
    await expect(misbound.get(portfolioReader, portfolioId)).rejects.toMatchObject({ code: 'opening_anchor_mismatch' });
    await expect(misbound.append(portfolioAdmin, portfolioId, transfer(), 0, 'same-key'))
      .rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('pins the opening revision across a later V1 correction and refuses unknown opening cash', async () => {
    await append(transfer(), 0, 'journal');
    await f.service.append(portfolioAdmin, { ...openingInput(), cash: { currency: 'EUR', amount: '999' },
      correction_reason: 'Synthetic later correction' }, 1, 'correct-opening');
    expect((await get()).balances).toMatchObject({ opening_revision: 1, cash: { amount: '110' } });
    expect((await f.service.get(portfolioReader)).cash?.amount).toBe('999');
    await expect(make(otherPortfolioId, 'simulated', { ...opening, cash: null }).get(portfolioReader, otherPortfolioId))
      .rejects.toMatchObject({ code: 'opening_cash_unknown' });
  });

  it.each([null, portfolioReader, { ...portfolioAdmin, subject: 'synthetic-other' },
    { subject: 'synthetic-collector', permissions: ['quotes:ingest'] as const }])('denies unauthorized writes before storage (%s)', async principal => {
    await expect(service.append(principal, portfolioId, transfer(), 0, 'denied')).rejects.toMatchObject({ status: principal ? 403 : 401 });
    expect((await get()).events).toEqual([]);
  });

  it.each([
    { ...trade(), fee_rate: '1' }, { ...trade(), amount: '0.001' }, { ...trade(), amount: 30 },
    { ...trade(), quantity: '-1' }, { ...trade(), currency: 'USD' }, { ...trade(), quantity: '1e2' },
    { ...transfer(), type: 'interest' }, { ...transfer(), portfolio_id: otherPortfolioId },
  ])('rejects unsupported financial inputs without approximating them (%s)', async input => {
    expect(transactionInputSchema.safeParse(input).success).toBe(false);
    await expect(append(input, 0, 'invalid')).rejects.toMatchObject({ status: 422 });
  });

  it('exposes the isolated REST flow with authorization, If-Match, idempotency and safe errors', async () => {
    validateOpenApi(transactionApi);
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    ajv.addSchema({ ...transactionApi, $id: 'urn:pea:transactions' });
    const validOutcome = ajv.getSchema('urn:pea:transactions#/components/schemas/Outcome')!;
    const validState = ajv.getSchema('urn:pea:transactions#/components/schemas/State')!;
    const app = createTransactionApp(service, () => portfolioAdmin);
    const path = `/api/v1/portfolios/${portfolioId}/transactions`;
    const post = (body: unknown, match = '"0"', key = 'rest') => app.request(path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': match, 'Idempotency-Key': key }, body: JSON.stringify(body) });
    expect((await post(transfer(), '')).status).toBe(428);
    const first = await post(transfer());
    expect(first.status).toBe(201); expect(first.headers.get('ETag')).toBe('"1"');
    const accepted = await first.json();
    expect(validOutcome(accepted), JSON.stringify(validOutcome.errors)).toBe(true);
    expect(await (await post(transfer())).json()).toEqual(accepted);
    expect((await post(transfer('deposit', '11'))).status).toBe(409);
    expect((await post(transfer(), '"0"', 'stale')).status).toBe(412);
    const read = await app.request(path);
    expect(read.status).toBe(200); expect(read.headers.get('Cache-Control')).toBe('no-store');
    const state = await read.json();
    expect(validState(state), JSON.stringify(validState.errors)).toBe(true);
    expect(state).toMatchObject({ events: [expect.objectContaining({ portfolio_id: portfolioId })] });
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(405);
    expect((await app.request(`/api/v1/portfolios/${otherPortfolioId}/transactions`)).status).toBe(403);
    expect((await app.request(path, { headers: { Origin: 'https://untrusted.invalid' } })).status).toBe(403);
    const unauthenticated = createTransactionApp(service, () => null);
    expect((await unauthenticated.request(path)).status).toBe(401);
    expect((await app.request('/mcp')).status).toBe(404);
  });
});
