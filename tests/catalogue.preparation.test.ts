import { afterEach, describe, expect, it } from 'vitest';
import { prepareCatalogue } from '../scripts/catalogue-preparation';
import { D1InstrumentRepository } from '../src/adapters/d1/instruments';
import { openLocalD1 } from './helpers/d1-local.mjs';

// Invented identity and provider symbol; no owner holdings or real quotation data.
const input = () => ({ instrument_id: '00000000-0000-4000-8000-000000000001',
  instrument: { name: "Synthetic operator's stock", kind: 'stock', isin: 'FR0000120271', quote_currency: 'EUR',
    price_unit: 'currency_unit', exchange_mic: 'XPAR', provider_symbol: 'SYNTHETIC.PA', active: true },
  mapping: { instrument_id: '00000000-0000-4000-8000-000000000001', symbol: 'SYNTHETIC.PA', currency: 'EUR',
    price_unit: 'currency_unit', reported_currency: 'EUR', exchange: 'PAR', timezone: 'Europe/Paris', quote_type: 'EQUITY' },
  created_at: '2026-11-14T00:00:00.000Z', idempotency_key: 'synthetic-catalogue-bootstrap-v1' });

describe('supervised catalogue preparation', () => {
  let local: Awaited<ReturnType<typeof openLocalD1>> | undefined;
  afterEach(async () => { await local?.cleanup(); });

  it('reuses the service and repository batch, escaping SQL values without database access', async () => {
    const prepared = await prepareCatalogue(input());
    expect(prepared.statements).toHaveLength(3);
    expect(prepared.sql).toContain("Synthetic operator''s stock");
    expect(prepared.mapping[0]?.instrument_id).toBe(prepared.instrument_id);
    expect(prepared.grants).toEqual([{ provider: 'yahoo', instrument_ids: [prepared.instrument_id] }]);
    expect(prepared.sql).not.toMatch(/DROP|DELETE|UPDATE|BEGIN|COMMIT/);
  });

  it('rejects invalid ISINs and incoherent UUID, symbol, currency, unit or instrument kind', async () => {
    const invalid = [
      { ...input(), instrument_id: '00000000-0000-4000-8000-000000000002' },
      { ...input(), instrument: { ...input().instrument, isin: 'FR0000120272' } },
      ...[{ symbol: 'OTHER.PA' }, { currency: 'USD' }, { price_unit: 'hundredth_currency_unit' }, { quote_type: 'ETF' }]
        .map(patch => ({ ...input(), mapping: { ...input().mapping, ...patch } })),
    ];
    for (const candidate of invalid) await expect(prepareCatalogue(candidate)).rejects.toThrow();
  });

  it('executes the captured native batch on local D1 and preserves original outcomes on replay', async () => {
    local = await openLocalD1();
    const prepared = await prepareCatalogue(input());
    const apply = () => local!.db.batch(prepared.statements.map(s => local!.db.prepare(s.sql).bind(...s.values)));
    await apply();
    const repository = new D1InstrumentRepository(local.db);
    const original = await repository.get(prepared.instrument_id);
    expect(original).toMatchObject({ name: "Synthetic operator's stock", version: 1, provider_symbol: 'SYNTHETIC.PA' });
    await apply();
    expect(await repository.get(prepared.instrument_id)).toEqual(original);
    expect(await local.db.prepare('SELECT count(*) n FROM instrument_create_outcomes').first('n')).toBe(1);
    expect(await local.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(0);
  }, 30000);

  it('validates the literal SQL import against local D1 without changing repository semantics', async () => {
    local = await openLocalD1();
    const prepared = await prepareCatalogue(input());
    await local.db.exec(prepared.sql);
    expect(await new D1InstrumentRepository(local.db).get(prepared.instrument_id)).toMatchObject({ provider_symbol: 'SYNTHETIC.PA' });
    await local.db.exec(prepared.sql);
    expect(await local.db.prepare('SELECT count(*) n FROM instruments').first('n')).toBe(1);
  }, 30000);
});
