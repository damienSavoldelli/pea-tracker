import { describe, expect, it } from 'vitest';
import { observationInputSchema, quotationRecordSchema, quotationFreshness } from '../src/domain/quotations';
import { observation, unavailable } from './helpers/quotations';

const quote = () => quotationRecordSchema.parse({ ...observation(), id: crypto.randomUUID(), recorded_at: '2026-11-09T10:02:00.000Z', source_price: observation().price, value_origin: 'provider_declared' });
describe('synthetic quotation validation', () => {
  it.each([
    { price: 1 }, { price: '0' }, { price: '-1' }, { price: 'NaN' }, { price: '1e2' }, { price: '1,2' },
    { price: '0.0000000000001' }, { price: '1234567890123456789012345678901' },
    { currency: null }, { price_unit: null }, { market_timestamp: null }, { session_date: '2026-02-30' },
    { price_kind: 'realtime' }, { adjustment: 'adjusted' }, { provider_delay_seconds: -1 }, { provider_delay_seconds: 1.5 },
    { error_code: 'provider_unavailable' }, { total_value: '10' },
  ])('rejects unsupported declaration %j', patch => {
    expect(observationInputSchema.safeParse({ ...observation(), ...patch }).success).toBe(false);
  });
  it('requires sanitized failure reasons with no invented quote fields', () => {
    expect(observationInputSchema.safeParse(unavailable()).success).toBe(true);
    expect(observationInputSchema.safeParse({ ...unavailable(), price: '0' }).success).toBe(false);
    expect(observationInputSchema.safeParse({ ...unavailable(), error_code: null }).success).toBe(false);
    expect(observationInputSchema.safeParse({ ...unavailable(), error_code: 'secret-provider-error' }).success).toBe(false);
  });
});

describe('explicit collection freshness versus market/provider time', () => {
  it.each([[0, 'within_target'], [2700, 'within_target'], [2701, 'warning'], [3600, 'warning'], [3601, 'stale']] as const)
    ('classifies collection age %s without classifying a delayed quote as real-time', (age, expected) => {
      const record = quote();
      const now = new Date(Date.parse(record.fetched_at) + age * 1000).toISOString();
      const result = quotationFreshness(record, record, now, { phase: 'open', expected_session_date: '2026-11-09' });
      expect(result.status).toBe(expected);
      expect(result.collection_age_seconds).toBe(age);
      expect(result.market_age_seconds).toBe(age + 60);
      expect(result.delivery).toBe('delayed');
      expect(result.realtime_guaranteed).toBe(false);
    });
  it('keeps legitimate last-session data distinct from missing sessions and unknown calendars', () => {
    const record = quote();
    const now = '2026-11-11T00:00:00.000Z';
    expect(quotationFreshness(record, record, now, { phase: 'closed', expected_session_date: '2026-11-09' }).status).toBe('last_completed_session');
    expect(quotationFreshness(record, record, now, { phase: 'closed', expected_session_date: '2026-11-10' })).toMatchObject({ status: 'stale', reason: 'expected_session_missing' });
    expect(quotationFreshness(record, record, now, { phase: 'unknown', expected_session_date: null })).toMatchObject({ status: 'unknown', reason: 'market_calendar_unknown' });
    expect(quotationFreshness(null, null, now, { phase: 'open', expected_session_date: '2026-11-11' })).toMatchObject({ status: 'unavailable', collection_age_seconds: null, market_age_seconds: null });
  });
  it('does not infer a collection outage from an old illiquid trade timestamp', () => {
    const record = { ...quote(), market_timestamp: '2026-11-09T08:00:00.000Z', provider_delay_seconds: null };
    expect(quotationFreshness(record, record, '2026-11-09T10:02:00.000Z', { phase: 'open', expected_session_date: '2026-11-09' }))
      .toMatchObject({ status: 'within_target', market_age_seconds: 7320, collection_age_seconds: 60, delivery: 'unknown', realtime_guaranteed: false });
  });
  it('does not turn a clock rollback into a fresh observation', () => {
    const record = quote();
    expect(quotationFreshness(record, record, '2026-11-09T09:00:00.000Z', { phase: 'open', expected_session_date: '2026-11-09' }))
      .toMatchObject({ status: 'unknown', reason: 'clock_inconsistent', collection_age_seconds: null, market_age_seconds: null });
  });
  it('never presents a freshly retrieved previous close as a current-session price', () => {
    const record = { ...quote(), price_kind: 'session_close' as const, session_date: '2026-11-08', market_timestamp: '2026-11-08T16:00:00.000Z', provider_delay_seconds: 0 };
    expect(quotationFreshness(record, record, '2026-11-09T10:02:00.000Z', { phase: 'open', expected_session_date: '2026-11-09' }))
      .toMatchObject({ status: 'stale', reason: 'expected_session_missing', collection_age_seconds: 60, realtime_guaranteed: false });
  });
});
