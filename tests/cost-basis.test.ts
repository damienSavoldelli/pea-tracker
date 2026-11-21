import { describe, expect, it } from 'vitest';
import { projectCostBasis, costBasisPolicy } from '../src/domain/cost-basis';
import { applyTransaction, initialJournalBalances, transactionInputSchema, type TransactionEvent } from '../src/domain/transactions';
import type { OpeningState } from '../src/domain/portfolio';
import { firstId, openingInput, provenance } from './helpers/portfolio';

const portfolioId = '10000000-0000-4000-8000-000000000001';
const effective_at = '2026-11-10T10:00:00.000Z';
function fixture(quantity = '2', pru = '10') {
  const input = openingInput();
  const opening: OpeningState = { ...input, id: crypto.randomUUID(), revision: 1, recorded_at: effective_at,
    cash: { currency: 'EUR', amount: '100000' }, positions: [{ ...input.positions[0]!, instrument_id: firstId, quantity, declared_pru: pru }] };
  const binding = { portfolio_id: portfolioId, kind: 'real' as const, owner_subject: 'synthetic-owner', opening_id: opening.id, opening_revision: 1 };
  let balances = initialJournalBalances(binding, opening);
  const events: TransactionEvent[] = [];
  function append(input: unknown) {
    const result = applyTransaction(balances, events, transactionInputSchema.parse({ effective_at, provenance, ...input as object }),
      { id: crypto.randomUUID(), recorded_at: effective_at, actor: binding.owner_subject });
    balances = result.balances; events.push(result.event); return result.event;
  }
  return { opening, events, get balances() { return balances; }, append,
    get: () => projectCostBasis(opening, events, balances).get(firstId)! };
}
const trade = (type: 'buy' | 'sell', quantity: string, amount: string) => ({ type, quantity, amount, instrument_id: firstId, currency: 'EUR' });
const reverse = (event: TransactionEvent) => ({ type: 'reversal', reversal_of: event.id, reason: 'Synthetic correction' });

describe('exact weighted-average remaining cost', () => {
  it('uses the declared opening quantity/PRU with explicit provenance, including true zero cost', () => {
    const f = fixture();
    expect(f.get()).toMatchObject({ remaining_cost: { status: 'available', value: '20', exact: { numerator: '20', denominator: '1' }, rounded: false },
      pru: { status: 'available', value: '10' }, cost_provenance: { opening: provenance, journal_version: 0 } });
    expect(fixture('2', '0').get().pru).toMatchObject({ value: '0', status: 'available' });
    expect(costBasisPolicy).toMatchObject({ arithmetic: 'exact_rational', fees: 'declared_purchase_capitalized_sale_deducted', opening_fees: 'unknown', rounding_stage: 'presentation_only' });
  });

  it('adds successive purchase amounts and never uses a market or sale price for the average', () => {
    const f = fixture();
    f.append(trade('buy', '2', '40'));
    expect(f.get()).toMatchObject({ remaining_cost: { value: '60' }, pru: { value: '15' } });
    f.append(trade('buy', '1', '30'));
    expect(f.get()).toMatchObject({ remaining_cost: { value: '90' }, pru: { value: '18' } });
    f.append(trade('sell', '2', '500'));
    expect(f.get()).toMatchObject({ remaining_cost: { value: '54' }, pru: { value: '18' } });
  });

  it('clears quantity and cost on a full sale, and starts a fresh cost on repurchase', () => {
    const f = fixture();
    f.append(trade('sell', '2', '1'));
    expect(f.balances.positions).toEqual([]);
    expect(f.get()).toMatchObject({ remaining_cost: { value: '0', exact: { numerator: '0', denominator: '1' } },
      pru: { status: 'unavailable', reason: 'position_closed' } });
    f.append(trade('buy', '1', '7'));
    expect(f.get()).toMatchObject({ remaining_cost: { value: '7' }, pru: { value: '7' } });
  });

  it('retains repeating quotients exactly across successive partial sales without rounding feedback', () => {
    const f = fixture('3', '0');
    f.append(trade('buy', '3', '1'));
    expect(f.get().pru).toMatchObject({ value: '0.166666666666666667', exact: { numerator: '1', denominator: '6' }, rounded: true });
    f.append(trade('sell', '1', '1'));
    expect(f.get().remaining_cost).toMatchObject({ exact: { numerator: '5', denominator: '6' } });
    f.append(trade('sell', '2', '1'));
    expect(f.get()).toMatchObject({ remaining_cost: { value: '0.5', exact: { numerator: '1', denominator: '2' } },
      pru: { exact: { numerator: '1', denominator: '6' } } });
  });

  it('keeps the 24-place opening product exact even below the decimal presentation precision', () => {
    const f = fixture('0.000000000001', '0.000000000001');
    expect(f.get()).toMatchObject({ remaining_cost: { value: '0', rounded: true,
      exact: { numerator: '1', denominator: '1000000000000000000000000' } }, pru: { value: '0.000000000001', rounded: false } });
  });

  it('uses half-even on both sides of a decimal tie without changing exact accounting', () => {
    const even = fixture('1', '0'); even.append(trade('buy', '19999999999999999', '1'));
    expect(even.get().pru).toMatchObject({ value: '0.00000000000000005', rounded: false });
    // Exact 0.5 and 1.5 units at the 18th decimal place.
    const low = fixture('1', '0'); low.append(trade('buy', '1999999999999999999', '1'));
    expect(low.get().pru).toMatchObject({ value: '0', rounded: true });
    const high = fixture('1', '0'); high.append(trade('buy', '1999999999999999999', '3'));
    expect(high.get().pru).toMatchObject({ value: '0.000000000000000002', rounded: true });
  });

  it('keeps amounts and opening products beyond Number safe integer bounds exact', () => {
    expect(fixture('9007199254740993', '2').get().remaining_cost).toMatchObject({ value: '18014398509481986' });
  });

  it('counterposts purchases and restores the original allocated sale cost after a later purchase', () => {
    const f = fixture();
    const buy = f.append(trade('buy', '2', '40')); f.append(reverse(buy));
    expect(f.get()).toMatchObject({ remaining_cost: { value: '20' }, pru: { value: '10' } });
    const sale = f.append(trade('sell', '1', '99'));
    f.append(trade('buy', '1', '30'));
    f.append(reverse(sale));
    expect(f.get()).toMatchObject({ remaining_cost: { value: '50' }, pru: { exact: { numerator: '50', denominator: '3' } } });
    expect(sale.input.type).toBe('sell');
  });

  it('marks an incompatible purchase counterpost unavailable without inventing negative cost or rejecting journal balances', () => {
    const f = fixture('1', '0');
    const purchase = f.append(trade('buy', '1', '100'));
    f.append(trade('sell', '1', '100')); f.append(trade('buy', '1', '1')); f.append(reverse(purchase));
    expect(f.balances.positions).toMatchObject([{ quantity: '1' }]);
    expect(f.get()).toMatchObject({ remaining_cost: { status: 'unavailable', reason: 'reversal_cost_conflict' },
      pru: { status: 'unavailable', reason: 'reversal_cost_conflict' } });
    f.append(trade('sell', '1', '1')); f.append(trade('buy', '1', '4'));
    expect(f.get().pru).toMatchObject({ status: 'available', value: '4' });
  });

  it('never replaces missing opening cost with zero, but can value a new position after full closure', () => {
    const f = fixture();
    const unknown = { ...f.opening, positions: f.opening.positions.map(position => ({ ...position, declared_pru: null })) };
    f.append(trade('buy', '1', '10'));
    const get = () => projectCostBasis(unknown, f.events, f.balances).get(firstId)!;
    expect(get().pru).toEqual({ status: 'unavailable', reason: 'opening_cost_unavailable' });
    f.append(trade('sell', '3', '30')); f.append(trade('buy', '1', '8'));
    expect(get().pru).toMatchObject({ status: 'available', value: '8' });
  });

  it('refuses cross-portfolio or incomplete journal snapshots without sharing any cost state', () => {
    const f = fixture(); f.append(trade('buy', '1', '20'));
    expect(() => projectCostBasis(f.opening, f.events, { ...f.balances, portfolio_id: crypto.randomUUID() })).toThrow('cost_projection_mismatch');
    expect(() => projectCostBasis(f.opening, [], f.balances)).toThrow('cost_projection_mismatch');
    const other = fixture('1', '3');
    expect(other.get().pru).toMatchObject({ value: '3' });
    expect(f.get().pru).toMatchObject({ exact: { numerator: '40', denominator: '3' } });
  });
});
