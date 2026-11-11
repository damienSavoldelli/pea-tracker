import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotationService } from '../src/application/quotations';
import { D1QuotationRepository } from '../src/adapters/d1/quotations';
import { openLocalD1 } from './helpers/d1-local.mjs';
import { quotationFixture, quotationReader as reader, quotationCollector as collector, observation, unavailable, selector } from './helpers/quotations';

for (const kind of ['memory', 'd1'] as const) describe(`${kind} quotation repository/service contract`, () => {
  let f: Awaited<ReturnType<typeof quotationFixture>>;
  beforeEach(async () => { f = await quotationFixture(kind); }, 30000);
  afterEach(async () => { await f?.dispose(); });
  const ingest = (observations = [observation()], key = 'batch') => f.service.ingest(collector, { observations }, key);
  const window = { ...selector, from: '2026-11-09T00:00:00.000Z', to: '2026-11-09T23:59:59.000Z' };

  it('retains exact declared price/source precision, unit/currency/provider and independent clocks', async () => {
    const result = await ingest();
    expect(result.data[0]).toMatchObject({ price: '9007199254740993.12', source_price: '9007199254740993.1200', currency: 'EUR', price_unit: 'currency_unit', provider: 'synthetic' });
    const status = await f.service.status(reader, selector);
    expect(status).toMatchObject({ availability: 'available', freshness: { status: 'within_target', delivery: 'delayed', realtime_guaranteed: false } });
    expect(status.quote?.market_timestamp).not.toBe(status.quote?.fetched_at);
    expect(status.quote?.recorded_at).not.toBe(status.quote?.market_timestamp);
    result.data[0]!.price = '1';
    expect((await f.service.status(reader, selector)).quote?.price).toBe('9007199254740993.12');
  });
  it('replays original outcomes across later batches and deduplicates exact observations across keys', async () => {
    const original = await ingest();
    await ingest([unavailable()], 'failure');
    expect(await ingest()).toEqual(original);
    expect(await ingest([observation()], 'other-key')).toEqual(original);
    await expect(ingest([observation({ price: '2' })])).rejects.toMatchObject({ status: 409, code: 'idempotency_conflict' });
    await expect(ingest([observation({ price: '2' })], 'conflicting-observation')).rejects.toMatchObject({ status: 409, code: 'quotation_observation_conflict' });
    expect((await f.service.history(reader, window)).data).toHaveLength(1);
  });
  it('retains last usable data and freshness on failure, while distinguishing missing/unavailable', async () => {
    expect(await f.service.status(reader, selector)).toMatchObject({ availability: 'missing', quote: null, last_successful_fetch_at: null });
    await ingest([unavailable()], 'failure-first');
    expect(await f.service.status(reader, selector)).toMatchObject({ availability: 'unavailable', quote: null, last_attempt: { error_code: 'provider_unavailable', price: null } });
    await ingest();
    const before = await f.service.status(reader, selector);
    f.clock.now = '2026-11-09T11:02:00.000Z';
    await ingest([unavailable({ fetched_at: f.clock.now })], 'failure-later');
    const after = await f.service.status(reader, selector);
    expect(after.quote).toEqual(before.quote);
    expect(after.last_successful_fetch_at).toBe(before.last_successful_fetch_at);
    expect(after).toMatchObject({ availability: 'available', last_attempt: { outcome: 'unavailable' }, freshness: { status: 'stale' } });
  });
  it('orders by market time rather than ingestion order and paginates immutable observations', async () => {
    await ingest([observation({ market_timestamp: '2026-11-09T09:58:00.000Z', fetched_at: '2026-11-09T10:00:00.000Z' }), observation()]);
    await ingest([observation({ market_timestamp: '2026-11-09T09:59:00.000Z', fetched_at: '2026-11-09T10:02:00.000Z' })], 'late-older');
    const status = await f.service.status(reader, selector);
    expect(status.quote?.market_timestamp).toBe('2026-11-09T10:00:00.000Z');
    expect(status.last_successful_fetch_at).toBe('2026-11-09T10:02:00.000Z');
    const page = await f.service.history(reader, { ...window, limit: 1 });
    const second = await f.service.history(reader, { ...window, limit: 2, cursor: page.page.next_cursor });
    expect(second.data).toHaveLength(2);
    expect(second.page.next_cursor).toBeNull();
    expect(new Set([...page.data, ...second.data].map(row => row.id)).size).toBe(3);
    await expect(f.service.history(reader, { ...window, provider: 'other', cursor: page.page.next_cursor })).rejects.toMatchObject({ status: 400, code: 'invalid_cursor' });
    await expect(f.service.history(reader, { ...window, from: window.to, to: window.from })).rejects.toMatchObject({ status: 400 });
    await expect(f.service.history(reader, { ...window, to: '2028-01-01T00:00:00.000Z' })).rejects.toMatchObject({ status: 400 });
  });
  it('has reliable concurrent replay/conflict behavior and no partial batches', async () => {
    const copies = await Promise.all(Array.from({ length: 4 }, () => ingest()));
    expect(copies.every(item => JSON.stringify(item) === JSON.stringify(copies[0]))).toBe(true);
    const outcomes = await Promise.allSettled(['a', 'b'].map((key, index) => ingest([observation({ fetched_at: '2026-11-09T10:02:00.000Z', price: String(index + 1) })], key)));
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const before = await f.service.history(reader, window);
    await expect(ingest([observation({ fetched_at: '2026-11-09T09:59:00.000Z', market_timestamp: '2026-11-09T09:58:00.000Z' }), observation({ price: '3' })], 'atomic-failure')).rejects.toMatchObject({ status: 409 });
    expect(await f.service.history(reader, window)).toEqual(before);
  });
  it('has one winner for same-key changed-input races, including independent D1 adapters', async () => {
    const peer = f.local ? new QuotationService(new D1QuotationRepository(f.local.db), f.instruments, f.grants, () => f.clock.now) : f.service;
    const results = await Promise.allSettled([
      f.service.ingest(collector, { observations: [observation({ price: '1' })] }, 'same-key-race'),
      peer.ingest(collector, { observations: [observation({ price: '2' })] }, 'same-key-race'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 409 });
    expect((await f.service.history(reader, window)).data).toHaveLength(1);
  });
  it('authorizes collector/provider/instrument independently; reads/admin rights never grant ingestion', async () => {
    const append = vi.spyOn(f.repository, 'append');
    await expect(f.service.ingest(null, {}, 'key')).rejects.toMatchObject({ status: 401 });
    await expect(f.service.ingest(reader, { observations: [observation()] }, 'key')).rejects.toMatchObject({ status: 403 });
    await expect(f.service.ingest({ subject: 'synthetic-admin', permissions: ['portfolio:admin', 'instruments:admin'] }, { observations: [observation()] }, 'key')).rejects.toMatchObject({ status: 403 });
    await expect(f.service.status(collector, selector)).rejects.toMatchObject({ status: 403 });
    await expect(f.service.ingest({ ...collector, subject: 'unapproved-collector' }, { observations: [observation()] }, 'key')).rejects.toMatchObject({ status: 403 });
    await expect(ingest([observation({ provider: 'other' })])).rejects.toMatchObject({ status: 403 });
    await expect(ingest([observation({ currency: 'USD' })])).rejects.toMatchObject({ status: 422, code: 'quotation_unit_mismatch' });
    await expect(ingest([observation({ price_unit: 'hundredth_currency_unit' })])).rejects.toMatchObject({ status: 422 });
    await expect(ingest([observation({ market_timestamp: '2026-11-09T10:02:00.000Z' })])).rejects.toMatchObject({ status: 422 });
    await expect(ingest([observation({ fetched_at: '2026-11-10T00:00:00.000Z' })])).rejects.toMatchObject({ status: 422 });
    await expect(ingest([observation(), observation()])).rejects.toMatchObject({ status: 422 });
    expect(append).not.toHaveBeenCalled();
  });
});

it('native D1 rolls back receipt failures, preserves immutable observations and survives restart', async () => {
  const f = await quotationFixture('d1');
  try {
    await f.local!.db.exec("CREATE TRIGGER synthetic_quote_receipt_failure BEFORE INSERT ON quotation_batch_outcomes WHEN NEW.idempotency_key='fail' BEGIN SELECT RAISE(ABORT,'synthetic_failure'); END;");
    await expect(f.service.ingest(collector, { observations: [observation()] }, 'fail')).rejects.toThrow('Quotation storage operation failed');
    expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(0);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_batch_outcomes').first('n')).toBe(0);
    const original = await f.service.ingest(collector, { observations: [observation()] }, 'durable');
    for (const table of ['quotation_observations', 'quotation_batch_outcomes']) {
      await expect(f.local!.db.prepare(`DELETE FROM ${table}`).run()).rejects.toThrow('immutable_quotation');
    }
    await expect(f.local!.db.prepare('UPDATE quotation_observations SET price = price').run()).rejects.toThrow('immutable_quotation');
    await f.local!.dispose();
    const reopened = await openLocalD1({ directory: f.local!.directory, migrate: false });
    try {
      const instruments = (await import('../src/adapters/d1/instruments')).D1InstrumentRepository;
      const service = new QuotationService(new D1QuotationRepository(reopened.db), new instruments(reopened.db), f.grants, () => f.clock.now);
      expect(await service.ingest(collector, { observations: [observation()] }, 'durable')).toEqual(original);
      expect((await service.status(reader, selector)).quote).toEqual(original.data[0]);
      expect((await reopened.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    } finally { await reopened.cleanup(); }
  } finally { await f.dispose(); }
}, 60000);
