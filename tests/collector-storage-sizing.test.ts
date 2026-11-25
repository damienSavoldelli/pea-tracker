import { expect, it } from 'vitest';
import { D1QuotationRepository } from '../src/adapters/d1/quotations';
import { quotationRecordSchema } from '../src/domain/quotations';
import { openLocalD1 } from './helpers/d1-local.mjs';

it('measures synthetic cadence growth using the actual local D1 repository and immutable receipts', async () => {
  const local = await openLocalD1();
  try {
    const ids = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
    const origin = '2026-11-23T06:17:00.000Z';
    await local.db.batch(ids.map(id => local.db.prepare(`INSERT INTO instruments
      (id,name,kind,isin,quote_currency,price_unit,exchange_mic,provider_symbol,active,version,created_at,updated_at)
      VALUES (?, 'Synthetic collector sizing', 'etf', NULL, 'EUR', 'currency_unit', NULL, NULL, 1, 1, ?, ?)`)
      .bind(id, origin, origin)));
    const repository = new D1QuotationRepository(local.db);
    const pages = async () => (await local.db.prepare('SELECT count(*) n FROM quotation_observations').all()).meta.size_after;
    const baseline = await pages();
    let at26 = 0;
    for (let cycle = 0; cycle < 52; cycle++) {
      const fetched = new Date(Date.parse(origin) + cycle * 900_000).toISOString();
      const records = ids.map(instrument_id => quotationRecordSchema.parse({
        id: crypto.randomUUID(), instrument_id, provider: 'yahoo', price_kind: 'last_trade', adjustment: 'unadjusted',
        fetched_at: fetched, recorded_at: fetched, outcome: 'success', price: '12.34', source_price: '12.34',
        currency: 'EUR', price_unit: 'currency_unit', market_timestamp: origin, session_date: '2026-11-23',
        provider_delay_seconds: null, error_code: null, value_origin: 'provider_declared',
        provenance: { source: 'Synthetic cadence capacity fixture', reference: null },
      }));
      const replay = { subject: 'synthetic-sizing', key: `synthetic-cycle-${cycle}`, canonicalInput: JSON.stringify(records) };
      const appended = await repository.append(records, replay);
      expect(appended).toHaveLength(20);
      if (cycle === 0) expect(await repository.append(records, replay)).toEqual(appended);
      if (cycle === 25) at26 = await pages();
    }
    const observations = Number(await local.db.prepare('SELECT count(*) n FROM quotation_observations').first('n'));
    const receipts = Number(await local.db.prepare('SELECT count(*) n FROM quotation_batch_outcomes').first('n'));
    const end = await pages();
    expect(observations).toBe(1040);
    expect(receipts).toBe(52);
    expect(end).toBeGreaterThan(at26);
    console.log(JSON.stringify({ event: 'synthetic_local_d1_cadence_sizing', instruments: 20,
      baseline_bytes: baseline, bytes_after_26_cycles: at26, bytes_after_52_cycles: end,
      growth_26_cycles: at26 - baseline, growth_52_cycles: end - baseline,
      observation_rows: observations, batch_receipt_rows: receipts,
      unchanged_price_and_market_time: true, billed_remote_rows_unmeasured: true }));
  } finally { await local.cleanup(); }
}, 60_000);
