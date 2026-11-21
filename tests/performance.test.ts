import { describe, expect, it } from 'vitest';
import { marketReference, monetaryPerformance, summarizeExternalFlows, type MarketReferenceSnapshot } from '../src/domain/performance';
import { applyTransaction, initialJournalBalances, transactionInputSchema, type TransactionEvent } from '../src/domain/transactions';
import { quotationRecordSchema } from '../src/domain/quotations';
import type { OpeningState } from '../src/domain/portfolio';
import { firstId, openingInput, provenance } from './helpers/portfolio';
import { observation } from './helpers/quotations';
import { valuationSelection } from './helpers/valuation';

const at = '2026-11-10T10:00:00.000Z';
const later = '2026-11-10T11:00:00.000Z';
function fixture() {
  const input = openingInput();
  const opening: OpeningState = { ...input, id: crypto.randomUUID(), revision: 1, recorded_at: at,
    cash: { currency: 'EUR', amount: '100' }, positions: [{ ...input.positions[0]!, quantity: '2', declared_pru: '3' }] };
  const binding = { portfolio_id: crypto.randomUUID(), kind: 'real' as const, owner_subject: 'synthetic-owner', opening_id: opening.id, opening_revision: 1 };
  const quote = quotationRecordSchema.parse({ ...observation({ price: '10', market_timestamp: at, fetched_at: at, session_date: '2026-11-10' }),
    id: crypto.randomUUID(), recorded_at: at, source_price: '10', value_origin: 'provider_declared' });
  const reference: MarketReferenceSnapshot = { ...binding, evaluated_at: at, opening_state: { id: opening.id, revision: 1 },
    journal: { version: 0, last_effective_at: opening.effective_at }, selection: valuationSelection, cash: { currency: 'EUR', amount: '100' },
    positions: [{ instrument_id: firstId, quantity: '2', quotation: { quote, freshness: { status: 'within_target' } }, warnings: [] }],
    coverage: { total_complete: true }, portfolio_total: { exact: '120' } };
  let balances = initialJournalBalances(binding, opening);
  const events: TransactionEvent[] = [];
  function append(input: object) {
    const result = applyTransaction(balances, events, transactionInputSchema.parse({ effective_at: later, provenance, ...input }),
      { id: crypto.randomUUID(), recorded_at: later, actor: binding.owner_subject });
    balances = result.balances; events.push(result.event); return result.event;
  }
  function report(value: string | null, initial: MarketReferenceSnapshot | undefined = reference, warnings: string[] = []) {
    return monetaryPerformance({ ...binding, evaluated_at: later, opening_state: reference.opening_state,
      journal: { version: events.length }, selection: valuationSelection, portfolio_total: value === null ? null : { exact: value }, warnings }, events, initial);
  }
  return { reference, events, append, report, binding };
}
const transfer = (type: 'deposit' | 'withdrawal', amount: string) => ({ type, amount, currency: 'EUR' });

describe('market-reference monetary performance', () => {
  it('uses evidenced market value and initial cash, never initial declared PRU', () => {
    const f = fixture();
    expect(marketReference(f.reference)).toMatchObject({ initial_value: { value: '120' }, initial_cash: '100',
      quotes: [{ provenance: { source: 'Synthetic market-data fixture' }, freshness: 'within_target' }] });
    expect(f.report('130')).toMatchObject({ economic_gain: { value: '10' }, cash_flows: { net_contributions: '0' },
      return_percentage: { status: 'unavailable', reason: 'return_method_not_defined' } });
  });
  it.each([['deposit', '20', '140'], ['withdrawal', '10', '110']] as const)('neutralizes a dated %s without calling it a gain', (type, amount, value) => {
    const f = fixture(); f.append(transfer(type, amount));
    expect(f.report(value)).toMatchObject({ economic_gain: { value: '0' }, cash_flows: { entries: [{ effective_at: later, type }] } });
  });
  it('uses initial/current value minus deposits plus withdrawals, with exact signed flows', () => {
    const f = fixture(); f.append(transfer('deposit', '20')); f.append(transfer('withdrawal', '10'));
    expect(f.report('135')).toMatchObject({ economic_gain: { value: '5' }, cash_flows: { deposits: '20', withdrawals: '10', net_contributions: '10' } });
  });
  it('counts received dividends already inside cash exactly once', () => {
    const f = fixture(); f.append({ type: 'dividend', amount: '5', currency: 'EUR' });
    expect(f.report('125')).toMatchObject({ economic_gain: { value: '5' }, cash_flows: { deposits: '0', withdrawals: '0', entries: [] } });
  });
  it.each(['buy', 'sell'] as const)('does not deduct already recorded %s fees twice or treat a trade as external cash', type => {
    const f = fixture(); f.append({ type, instrument_id: firstId, quantity: type === 'buy' ? '2' : '1', amount: type === 'buy' ? '20' : '10', fees: '1', currency: 'EUR' });
    expect(f.report('119')).toMatchObject({ economic_gain: { value: '-1' }, cash_flows: { entries: [], net_contributions: '0' } });
  });
  it('counterposts external flows at the correction date without double counting or rewriting prior periods', () => {
    const f = fixture(); const original = f.append(transfer('deposit', '20'));
    f.append({ type: 'reversal', reversal_of: original.id, reason: 'Synthetic correction' });
    expect(f.report('120')).toMatchObject({ economic_gain: { value: '0' }, cash_flows: { deposits: '20', withdrawals: '20', net_contributions: '0' } });
    const reference = structuredClone(f.reference); reference.journal = { version: 1, last_effective_at: later };
    reference.evaluated_at = later; reference.cash.amount = '120'; reference.portfolio_total = { exact: '140' };
    expect(f.report('120', reference)).toMatchObject({ economic_gain: { value: '0' }, cash_flows: { after_sequence: 1, deposits: '0', withdrawals: '20' } });
  });
  it('reports missing initial value without substituting declared cost or zero', () => {
    const f = fixture();
    const result = monetaryPerformance({ ...f.binding, evaluated_at: later, opening_state: f.reference.opening_state,
      journal: { version: 0 }, selection: valuationSelection, portfolio_total: { exact: '130' }, warnings: [] }, []);
    expect(result).toMatchObject({ reference: null, economic_gain: { status: 'unavailable', reason: 'initial_market_reference_missing' } });
  });
  it('refuses incomplete/current or stale/initial quotes and retains unknown/stale warnings on estimates', () => {
    const f = fixture();
    expect(f.report(null)).toMatchObject({ economic_gain: { status: 'unavailable', reason: 'current_valuation_incomplete' } });
    const stale = structuredClone(f.reference); stale.positions[0]!.quotation.freshness.status = 'stale';
    expect(f.report('130', stale)).toMatchObject({ economic_gain: { status: 'unavailable', reason: 'initial_reference_quotes_stale' } });
    const unknown = structuredClone(f.reference); unknown.positions[0]!.quotation.freshness.status = 'unknown'; unknown.positions[0]!.warnings = ['freshness_unknown'];
    expect(f.report('130', unknown, ['freshness_stale'])).toMatchObject({ estimate: true, warnings: ['freshness_stale', 'freshness_unknown'] });
    const incomplete = structuredClone(f.reference); incomplete.positions[0]!.quotation.quote = null;
    expect(f.report('130', incomplete).economic_gain.status).toBe('unavailable');
  });
  it('invalidates a selected reference for a subsequently recorded backdated movement', () => {
    const f = fixture(); f.append({ ...transfer('deposit', '1'), effective_at: '2026-11-10T09:59:00.000Z' });
    expect(f.report('121')).toMatchObject({ economic_gain: { status: 'unavailable', reason: 'initial_reference_invalidated_by_backdating' } });
  });
  it('accepts an evidenced last completed session at market closure without treating it as a stale session', () => {
    const f = fixture();
    const closed = structuredClone(f.reference);
    closed.positions[0]!.quotation.freshness.status = 'last_completed_session';
    closed.positions[0]!.warnings = ['freshness_last_completed_session'];
    expect(f.report('130', closed)).toMatchObject({ economic_gain: { value: '10' }, warnings: ['freshness_last_completed_session'] });
  });
  it('isolates portfolio identity/kind, opening anchor and quote selection', () => {
    const f = fixture();
    for (const invalid of [{ ...f.reference, portfolio_id: crypto.randomUUID() }, { ...f.reference, kind: 'simulated' as const },
      { ...f.reference, opening_state: { id: crypto.randomUUID(), revision: 1 } }, { ...f.reference, selection: { ...valuationSelection, provider: 'other' } }]) {
      expect(f.report('130', invalid).economic_gain.status).toBe('unavailable');
    }
    const foreign = fixture(); foreign.append(transfer('deposit', '1'));
    expect(() => summarizeExternalFlows(foreign.events, f.binding.portfolio_id)).toThrow('flow_projection_mismatch');
  });
  it('never reuses a rounded reference representation for tiny market values', () => {
    const f = fixture(); const reference = structuredClone(f.reference);
    reference.cash.amount = '0'; reference.positions[0]!.quantity = '0.000000000001';
    reference.positions[0]!.quotation.quote!.price = '0.000000000001';
    reference.portfolio_total = { exact: '0.000000000000000000000001' };
    expect(f.report('0.000000000000000000000002', reference).economic_gain)
      .toMatchObject({ value: '0', rounded: true, exact: { numerator: '1', denominator: '1000000000000000000000000' } });
    reference.portfolio_total.exact = '1';
    expect(f.report('2', reference).economic_gain).toMatchObject({ reason: 'initial_reference_value_mismatch' });
  });
});
