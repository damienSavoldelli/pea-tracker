import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { valuationFixture, valuationReader as reader, valuationSelection as selection } from './helpers/valuation';
import { observation, unavailable, quotationCollector as collector } from './helpers/quotations';
import { firstId, secondId, portfolioAdmin } from './helpers/portfolio';
import { InstrumentService } from '../src/application/instruments';

for (const kind of ['memory', 'd1'] as const) describe(`${kind} deterministic valuation`, () => {
  let f: Awaited<ReturnType<typeof valuationFixture>>;
  beforeEach(async () => { f = await valuationFixture(kind); }, 30000);
  afterEach(async () => { await f?.dispose(); });
  const get = () => f.valuation.get(reader, selection);

  it('exposes all quote inputs, provenance and clocks; sums unrounded amounts before EUR display', async () => {
    await f.seed();
    const result = await get();
    expect(result.positions.map(p => p.market_value?.display)).toEqual(['0.00', '0.00']);
    expect(result.securities_total).toEqual({ exact: '0.01', display: '0.01', currency: 'EUR' });
    expect(result.portfolio_total).toEqual({ exact: '12.31', display: '12.31', currency: 'EUR' });
    expect(result.coverage).toMatchObject({ positions: 2, valued: 2, not_valued: 0, total_complete: true });
    expect(result.positions[0]).toMatchObject({ declared_pru: '3.12', market_value: { exact: '0.005' },
      quotation: { quote: { price: '0.005', source_price: '0.005', price_unit: 'currency_unit', provider: 'synthetic', provenance: observation().provenance,
        market_timestamp: observation().market_timestamp, fetched_at: observation().fetched_at, value_origin: 'provider_declared' }, freshness: { status: 'stale', delivery: 'delayed' } },
      warnings: ['freshness_stale', 'delivery_delayed'] });
    expect(result.estimate).toBe(true); expect(result.realtime_guaranteed).toBe(false);
    expect(result).not.toHaveProperty('historical_cost'); expect(result).not.toHaveProperty('unrealized_gain');
    expect(await get()).toEqual(result);
  });
  it('distinguishes missing prices, failure-only and partial subtotals from a complete total', async () => {
    expect(await get()).toMatchObject({ securities_subtotal: null, securities_total: null, portfolio_total: null, known_assets_subtotal: { exact: '12.3' }, coverage: { not_valued: 2 } });
    await f.service.ingest(collector, { observations: [observation({ price: '2' }), unavailable({ instrument_id: secondId })] }, 'partial');
    const result = await get();
    expect(result).toMatchObject({ securities_subtotal: { exact: '2' }, securities_total: null, portfolio_total: null, known_assets_subtotal: { exact: '14.3' }, coverage: { valued: 1, not_valued: 1 } });
    expect(result.positions[1]).toMatchObject({ market_value: null, reasons: ['quotation_unavailable'] });
  });
  it('never substitutes another provider or quotation kind', async () => {
    await f.seed();
    for (const query of [{ ...selection, provider: 'other' }, { ...selection, price_kind: 'session_close' }]) {
      expect(await f.valuation.get(reader, query)).toMatchObject({ securities_total: null, coverage: { valued: 0 } });
    }
  });
  it('preserves unknown cash and full revision history without inventing zero balances', async () => {
    await f.seed();
    await f.portfolio.append(portfolioAdmin, { ...f.input, cash: null, correction_reason: 'Synthetic correction' }, 1, 'unknown-cash');
    expect(await get()).toMatchObject({ cash: { status: 'unknown', declared: null, market_value: null }, securities_total: { exact: '0.01' }, portfolio_total: null, coverage: { reasons: ['cash_unknown'] } });
    expect(await f.valuation.get(reader, { ...selection, revision: 1 })).toMatchObject({ opening_state: { revision: 1 }, portfolio_total: { exact: '12.31' } });
    await f.portfolio.append(portfolioAdmin, { ...f.input, positions: [], cash: null, correction_reason: 'Synthetic empty state' }, 2, 'empty');
    expect(await get()).toMatchObject({ securities_total: { exact: '0' }, portfolio_total: null, coverage: { positions: 0, securities_complete: true, cash_known: false } });
    await f.portfolio.append(portfolioAdmin, { ...f.input, positions: [], cash: { currency: 'EUR', amount: '0' }, correction_reason: 'Synthetic known zero' }, 3, 'known-zero');
    expect(await get()).toMatchObject({ portfolio_total: { exact: '0', display: '0.00' } });
  });
  it('retains stale/unknown/closed-session estimates, failed retrievals and explicit delay', async () => {
    await f.seed(); f.context.phase = 'unknown'; f.context.expected_session_date = null;
    await f.service.ingest(collector, { observations: [unavailable({ fetched_at: f.clock.now })] }, 'failed-latest');
    const result = await get();
    expect(result.positions[0]?.warnings).toEqual(['freshness_unknown', 'delivery_delayed', 'latest_retrieval_failed']);
    expect(result.securities_total?.exact).toBe('0.01');
    f.context.phase = 'closed'; f.context.expected_session_date = '2026-11-09';
    expect((await get()).positions[0]?.warnings).toContain('freshness_last_completed_session');
  });
  it('excludes foreign/incompatible currencies and converts hundredth units exactly', async () => {
    const id = '00000000-0000-4000-8000-000000000003';
    const instruments = new InstrumentService(f.instruments, () => f.clock.now, () => id);
    await instruments.create(portfolioAdmin, { name: 'Synthetic hundredth quote', kind: 'etf', quote_currency: 'EUR', price_unit: 'hundredth_currency_unit' }, 'hundredth');
    f.grants[0]!.instrument_ids.push(id);
    await f.service.ingest(collector, { observations: [observation({ instrument_id: id, price: '0.5', price_unit: 'hundredth_currency_unit' })] }, 'hundredth-price');
    await f.portfolio.append(portfolioAdmin, { ...f.input, positions: [{ ...f.input.positions[0]!, instrument_id: id }], correction_reason: 'Synthetic unit fixture' }, 1, 'hundredth-position');
    expect(await get()).toMatchObject({ securities_total: { exact: '0.005', display: '0.00' }, portfolio_total: { exact: '12.305', display: '12.30' } });
    await f.portfolio.append(portfolioAdmin, { ...f.input, positions: [{ ...f.input.positions[0]!, instrument_id: id, currency: 'USD' }], correction_reason: 'Synthetic currency fixture' }, 2, 'currency-position');
    expect((await get()).positions[0]).toMatchObject({ market_value: null, reasons: ['unsupported_currency', 'currency_mismatch'] });
    const foreign = '00000000-0000-4000-8000-000000000004';
    await new InstrumentService(f.instruments, () => f.clock.now, () => foreign).create(portfolioAdmin, { name: 'Synthetic USD quote', kind: 'etf', quote_currency: 'USD', price_unit: 'currency_unit' }, 'foreign');
    f.grants[0]!.instrument_ids.push(foreign);
    await f.service.ingest(collector, { observations: [observation({ instrument_id: foreign, currency: 'USD', price: '1' })] }, 'foreign-price');
    await f.portfolio.append(portfolioAdmin, { ...f.input, positions: [{ ...f.input.positions[0]!, instrument_id: foreign, currency: 'USD' }], correction_reason: 'Synthetic foreign fixture' }, 3, 'foreign-position');
    expect((await get()).positions[0]).toMatchObject({ market_value: null, reasons: ['unsupported_currency'] });
  });
  it('uses one evaluation time and excludes future-clock quotes rather than declaring them usable', async () => {
    await f.seed();
    f.clock.now = '2026-11-09T00:00:00.000Z';
    const result = await get();
    expect(new Set(result.positions.map(p => p.quotation.evaluated_at))).toEqual(new Set([result.evaluated_at]));
    expect(result.positions[0]).toMatchObject({ market_value: null, reasons: ['quotation_clock_inconsistent'] });
    f.clock.now = '2026-11-08T00:00:00.000Z';
    await expect(get()).rejects.toMatchObject({ status: 409, code: 'opening_state_after_evaluation' });
  });
  it('requires both permissions before accessing holdings or quotes; validates inputs', async () => {
    const read = vi.spyOn(f.portfolio, 'get');
    for (const principal of [null, collector, { subject: 'synthetic-read', permissions: ['portfolio:read'] as const }, { subject: 'synthetic-quotes', permissions: ['quotes:read'] as const }]) {
      await expect(f.valuation.get(principal, selection)).rejects.toMatchObject({ status: principal ? 403 : 401 });
    }
    expect(read).not.toHaveBeenCalled();
    for (const query of [{}, { ...selection, extra: 'rejected' }, { ...selection, revision: 0 }]) await expect(f.valuation.get(reader, query)).rejects.toMatchObject({ status: 400 });
    await expect(f.valuation.get(reader, { ...selection, revision: 99 })).rejects.toMatchObject({ status: 404 });
  });
});
