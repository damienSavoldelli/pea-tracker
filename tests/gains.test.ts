import { describe, expect, it } from 'vitest';
import { projectFinancialState } from '../src/domain/cost-basis';
import { unrealizedGains } from '../src/domain/gains';
import { applyTransaction, initialJournalBalances, transactionInputSchema, type TransactionEvent } from '../src/domain/transactions';
import type { OpeningState } from '../src/domain/portfolio';
import { firstId, secondId, openingInput, provenance } from './helpers/portfolio';

const effective_at = '2026-11-10T10:00:00.000Z';
function fixture(quantity = '2', pru = '10') {
  const input = openingInput();
  const opening: OpeningState = { ...input, id: crypto.randomUUID(), revision: 1, recorded_at: effective_at,
    cash: { currency: 'EUR', amount: '1000' }, positions: [{ ...input.positions[0]!, quantity, declared_pru: pru }] };
  const binding = { portfolio_id: crypto.randomUUID(), kind: 'real' as const, owner_subject: 'synthetic-owner', opening_id: opening.id, opening_revision: 1 };
  let balances = initialJournalBalances(binding, opening);
  const events: TransactionEvent[] = [];
  const append = (input: object) => {
    const result = applyTransaction(balances, events, transactionInputSchema.parse({ effective_at, provenance, ...input }),
      { id: crypto.randomUUID(), recorded_at: effective_at, actor: binding.owner_subject });
    balances = result.balances; events.push(result.event); return result.event;
  };
  return { opening, events, append, get balances() { return balances; }, get: () => projectFinancialState(opening, events, balances) };
}
const trade = (type: 'buy' | 'sell', quantity: string, amount: string, fees = '0') => ({ type, quantity, amount, fees, instrument_id: firstId, currency: 'EUR' });
const reverse = (id: string) => ({ type: 'reversal', reversal_of: id, reason: 'Synthetic correction' });
const cost = (numerator: string, denominator = '1') => ({ status: 'available' as const, exact: { numerator, denominator } });
const holding = (value: string | null, numerator: string, denominator = '1', instrument_id = firstId) => ({
  instrument_id, remaining_cost: cost(numerator, denominator), market_value: value === null ? null : { exact: value }, warnings: [] as string[],
});

describe('recorded realized gains', () => {
  it('uses net sale proceeds and exact pre-sale weighted cost including purchase fees once', () => {
    const f = fixture(); f.append(trade('buy', '1', '20', '1'));
    const sale = f.append(trade('sell', '1', '20', '2'));
    const result = f.get();
    expect(result.realized).toMatchObject({ total: { value: '4.333333333333333333', exact: { numerator: '13', denominator: '3' } },
      sales_results: [{ event_id: sale.id, net_proceeds: { value: '18' }, disposed_cost: { exact: { numerator: '41', denominator: '3' } }, opening_provenance: provenance }] });
    expect(result.costs.get(firstId)).toMatchObject({ pru: { exact: { numerator: '41', denominator: '3' } }, remaining_cost: { exact: { numerator: '82', denominator: '3' } } });
  });
  it('retains negative gains and full-sale results for an instrument with no remaining holding', () => {
    const f = fixture(); f.append(trade('sell', '2', '5', '0.50'));
    expect(f.balances.positions).toEqual([]);
    expect(f.get().realized).toMatchObject({ total: { value: '-15.5', exact: { numerator: '-31', denominator: '2' } },
      by_instrument: [{ instrument_id: firstId, opening_provenance: provenance, total: { value: '-15.5' } }] });
  });
  it('counterposts one sale gain without double counting other sales, preserving the original result', () => {
    const f = fixture(); const first = f.append(trade('sell', '1', '15', '1'));
    f.append(trade('sell', '1', '20', '1'));
    const correction = f.append(reverse(first.id));
    expect(f.get().realized).toMatchObject({ total: { value: '9' }, sales: 2, reversed_sales: 1, active_sales: 1,
      sales_results: [{ event_id: first.id, gain: { value: '4' }, reversed_by: correction.id }, { gain: { value: '9' }, reversed_by: null }] });
  });
  it('marks insufficient original cost unavailable, and excludes its reversed sale from active aggregates', () => {
    const f = fixture(); const sale = f.append(trade('sell', '1', '15'));
    const unknown = { ...f.opening, positions: f.opening.positions.map(position => ({ ...position, declared_pru: null })) };
    const get = () => projectFinancialState(unknown, f.events, f.balances).realized;
    expect(get()).toMatchObject({ status: 'partial', total: null, known_subtotal: null, unavailable_sales: 1,
      sales_results: [{ gain: { status: 'unavailable', reason: 'cost_basis_unavailable' } }] });
    f.append(reverse(sale.id));
    expect(get()).toMatchObject({ status: 'complete', total: { value: '0' }, active_sales: 0, unavailable_sales: 0 });
  });
  it('requires reconciliation when a purchase is reversed after a sale that used its average cost', () => {
    const f = fixture('1', '0'); const buy = f.append(trade('buy', '1', '100'));
    f.append(trade('sell', '1', '60')); f.append(reverse(buy.id));
    expect(f.get().realized).toMatchObject({ status: 'partial', total: null, unavailable_sales: 1,
      sales_results: [{ gain: { status: 'unavailable', reason: 'correction_requires_reconciliation' } }] });
  });
  it('retains known realized subtotals without claiming a complete total across mixed cost coverage', () => {
    const f = fixture();
    f.append({ ...trade('buy', '1', '10'), instrument_id: secondId });
    f.append({ ...trade('sell', '1', '15'), instrument_id: secondId });
    f.append(trade('sell', '1', '15'));
    const unknown = { ...f.opening, positions: f.opening.positions.map(position => ({ ...position, declared_pru: null })) };
    expect(projectFinancialState(unknown, f.events, f.balances).realized).toMatchObject({ status: 'partial', total: null,
      known_subtotal: { value: '5' }, unavailable_sales: 1, active_sales: 2 });
  });
  it('keeps zero-cost sales valid and leaves dividends/deposits outside realized trading gains', () => {
    const f = fixture('2', '0'); f.append(trade('sell', '1', '1', '0.01'));
    f.append({ type: 'dividend', currency: 'EUR', amount: '2' });
    f.append({ type: 'deposit', currency: 'EUR', amount: '10' });
    expect(f.get().realized.total).toMatchObject({ value: '0.99' });
  });
});

describe('unrealized gains from existing market values', () => {
  it('keeps periodic fractional gains and percentages exact, including losses', () => {
    const result = unrealizedGains([holding('0.2', '1', '3')]);
    expect(result.positions[0]!.unrealized).toMatchObject({ gain: { value: '-0.133333333333333333', exact: { numerator: '-2', denominator: '15' } },
      percentage: { value: '-40' } });
    expect(result.summary.total).toMatchObject({ exact: { numerator: '-2', denominator: '15' } });
  });
  it('aggregates exact values before representation and uses total remaining securities cost as denominator', () => {
    const result = unrealizedGains([holding('0.5', '1', '3'), holding('0.5', '1', '3', secondId)]);
    expect(result.summary).toMatchObject({ total: { exact: { numerator: '1', denominator: '3' } }, percentage: { value: '50' } });
  });
  it('preserves positive absolute gain but refuses a percentage with zero cost', () => {
    expect(unrealizedGains([holding('2', '0')]).summary).toMatchObject({ total: { value: '2' }, percentage: { status: 'unavailable', reason: 'zero_cost_basis' } });
  });
  it('never publishes a complete total/percentage for a missing price or cost, and retains quote warnings', () => {
    const known = { ...holding('20', '10'), warnings: ['freshness_unknown', 'quote_predates_portfolio_state'] };
    const missing = { ...holding(null, '5', '1', secondId), warnings: ['latest_retrieval_failed'] };
    expect(unrealizedGains([known, missing]).summary).toMatchObject({ status: 'partial', total: null,
      known_subtotal: { value: '10' }, percentage: { status: 'unavailable', reason: 'incomplete_positions' },
      warnings: ['freshness_unknown', 'quote_predates_portfolio_state', 'latest_retrieval_failed'] });
    const unknown = { ...holding('20', '10'), remaining_cost: { status: 'unavailable' as const } };
    expect(unrealizedGains([unknown]).summary).toMatchObject({ total: null, known_subtotal: null });
  });
  it('accepts full precision market products and rounds negative ties without negative zero or accounting feedback', () => {
    const result = unrealizedGains([holding('0.000000000000000000000001', '1', '500000000000000000000000')]);
    expect(result.positions[0]!.unrealized).toMatchObject({ gain: { value: '0', rounded: true, exact: { numerator: '-1', denominator: '1000000000000000000000000' } }, percentage: { value: '-50' } });
    const tie = unrealizedGains([holding('0', '1', '2000000000000000000')]);
    expect(tie.summary.total).toMatchObject({ value: '0', rounded: true });
    expect(unrealizedGains([holding('0', '3', '2000000000000000000')]).summary.total)
      .toMatchObject({ value: '-0.000000000000000002', rounded: true });
  });
  it('gives an empty securities portfolio a zero amount and unavailable percentage', () => {
    expect(unrealizedGains([]).summary).toMatchObject({ status: 'complete', total: { value: '0' }, percentage: { reason: 'zero_cost_basis' } });
  });
});
