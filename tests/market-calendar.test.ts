import { describe, expect, it } from 'vitest';
import { instrumentSchema } from '../src/domain/instruments';
import { createMarketCalendar } from '../src/adapters/calendar/market-calendar';
import generated from '../src/adapters/calendar/sessions.generated.json';
import { generateCalendarReference } from './helpers/calendar-generation.mjs';
import { quotationFreshness, quotationRecordSchema } from '../src/domain/quotations';
import { observation } from './helpers/quotations';

const id = '00000000-0000-4000-8000-000000000001';
const instrument = (mic: string | null = 'XPAR') => instrumentSchema.parse({
  id, name: 'Synthetic calendar instrument', kind: 'stock', quote_currency: 'EUR', price_unit: 'currency_unit',
  exchange_mic: mic, version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
});
const assignments = JSON.stringify([{ instrument_id: id, mic: 'XPAR', profile_id: 'xpar-continuous-core-v1' }]);
const venueAssignments = JSON.stringify([{ instrument_id: id, mic: 'XPAR', calendar_id: 'euronext-paris-cash-days-v1' }]);
const unknown = { phase: 'unknown', expected_session_date: null };

describe('Paris cash venue closures without individual trading-mode qualification', () => {
  const resolve = (now: string) => createMarketCalendar(venueAssignments)(instrument(), now);
  it.each([
    ['2026-11-21T10:00:00.000Z', '2026-11-20'],
    ['2026-07-12T10:00:00.000Z', '2026-07-10'],
    ['2026-04-06T10:00:00.000Z', '2026-04-02'],
    ['2027-03-29T10:00:00.000Z', '2027-03-25'],
    ['2026-12-25T10:00:00.000Z', '2026-12-24'],
  ])('recognizes full closure at %s independently of continuous/fixing hours', (now, previous) => {
    expect(resolve(now)).toEqual({ phase: 'closed', expected_session_date: previous });
  });
  it.each(['2026-11-20T07:00:00.000Z', '2026-11-20T10:00:00.000Z', '2026-11-20T18:00:00.000Z',
    '2026-12-24T10:00:00.000Z', '2028-01-01T10:00:00.000Z'])('never infers an individual session phase at %s', now => {
    expect(resolve(now)).toEqual(unknown);
  });
  it('requires explicit venue assignment and matching MIC, without aliasing ALXP to XPAR', () => {
    expect(createMarketCalendar(undefined)(instrument(), '2026-11-21T10:00:00.000Z')).toEqual(unknown);
    expect(createMarketCalendar(venueAssignments)(instrument('ALXP'), '2026-11-21T10:00:00.000Z')).toEqual(unknown);
    for (const item of [
      { instrument_id: id, mic: 'ALXP', calendar_id: 'euronext-paris-cash-days-v1' },
      { instrument_id: id, mic: 'XPAR', calendar_id: 'unverified' },
      { instrument_id: id, mic: 'XPAR', calendar_id: 'euronext-paris-cash-days-v1', profile_id: 'xpar-continuous-core-v1' },
    ]) expect(createMarketCalendar(JSON.stringify([item]))(instrument(), '2026-11-21T10:00:00.000Z')).toEqual(unknown);
  });
  it('preserves freshness semantics: last session during closure, older session stale, weekday unknown', () => {
    const quote = quotationRecordSchema.parse({ ...observation(), instrument_id: id,
      id: crypto.randomUUID(), recorded_at: '2026-11-20T17:00:00.000Z', source_price: '12.34', value_origin: 'provider_declared',
      price: '12.34', market_timestamp: '2026-11-20T16:29:00.000Z', fetched_at: '2026-11-20T17:00:00.000Z', session_date: '2026-11-20' });
    const saturday = '2026-11-21T10:00:00.000Z';
    expect(quotationFreshness(quote, quote, saturday, resolve(saturday))).toMatchObject({ status: 'last_completed_session', reason: 'market_closed' });
    expect(quotationFreshness({ ...quote, session_date: '2026-11-19' }, quote, saturday, resolve(saturday)))
      .toMatchObject({ status: 'stale', reason: 'expected_session_missing' });
    const monday = '2026-11-23T10:00:00.000Z';
    expect(quotationFreshness(quote, quote, monday, resolve(monday))).toMatchObject({ status: 'unknown', reason: 'market_calendar_unknown' });
  });
});

describe('bounded local market calendar', () => {
  const resolve = (now: string) => createMarketCalendar(assignments)(instrument(), now);

  it.each([
    ['2026-11-09T08:00:00.000Z', '2026-11-09'],
    ['2026-11-09T16:29:59.999Z', '2026-11-09'],
    ['2026-03-27T08:00:00.000Z', '2026-03-27'],
    ['2026-03-30T07:00:00.000Z', '2026-03-30'],
    ['2026-10-23T07:00:00.000Z', '2026-10-23'],
    ['2026-10-26T08:00:00.000Z', '2026-10-26'],
    ['2026-07-14T08:00:00.000Z', '2026-07-14'],
    ['2027-11-09T08:00:00.000Z', '2027-11-09'],
  ])('qualifies established continuous trading at %s with IANA/DST boundaries', (now, session) => {
    expect(resolve(now)).toEqual({ phase: 'open', expected_session_date: session });
  });

  it.each([
    ['2026-01-01T11:00:00.000Z', '2025-12-31'],
    ['2026-04-03T10:00:00.000Z', '2026-04-02'],
    ['2026-04-06T10:00:00.000Z', '2026-04-02'],
    ['2026-05-01T10:00:00.000Z', '2026-04-30'],
    ['2026-11-14T10:00:00.000Z', '2026-11-13'],
    ['2026-12-25T10:00:00.000Z', '2026-12-24'],
    ['2027-01-01T10:00:00.000Z', '2026-12-31'],
  ])('keeps full closures and the last established session distinct at %s', (now, session) => {
    expect(resolve(now)).toEqual({ phase: 'closed', expected_session_date: session });
  });

  it.each([
    '2026-11-09T07:59:59.999Z', '2026-11-09T16:30:00.000Z', '2026-11-09T18:00:00.000Z',
    '2026-12-24T10:00:00.000Z', '2026-12-31T10:00:00.000Z',
    '2025-12-31T10:00:00.000Z', '2028-01-01T10:00:00.000Z', 'invalid',
  ])('does not invent coverage, auctions, early-close hours or tolerances at %s', now => {
    expect(resolve(now)).toEqual(unknown);
  });

  it.each([undefined, null, '', 'invalid', '{}', '[]', 42,
    JSON.stringify([{ instrument_id: id, mic: 'ALXP', profile_id: 'xpar-continuous-core-v1' }]),
    JSON.stringify([{ instrument_id: id, mic: 'XPAR', profile_id: 'missing-profile' }]),
    JSON.stringify(Array.from({ length: 101 }, () => ({ instrument_id: id, mic: 'XPAR', profile_id: 'xpar-continuous-core-v1' }))),
    JSON.stringify([{ instrument_id: id, mic: 'XPAR', profile_id: 'xpar-continuous-core-v1' },
      { instrument_id: id, mic: 'XPAR', profile_id: 'xpar-continuous-core-v1' }]),
  ])('fails explicitly unknown for absent or ambiguous private assignments %#', input => {
    expect(createMarketCalendar(input)(instrument(), '2026-11-09T10:00:00.000Z')).toEqual(unknown);
  });

  it.each([null, 'ALXP', 'XAMS'])('does not infer a verified profile from a missing or different MIC %s', mic => {
    expect(createMarketCalendar(assignments)(instrument(mic), '2026-11-09T10:00:00.000Z')).toEqual(unknown);
  });

  it('does not mutate the catalogue MIC or the input artifact', () => {
    const record = instrument('ALXP');
    const before = structuredClone(generated);
    const resolve = createMarketCalendar(assignments);
    expect(resolve(record, '2026-11-09T10:00:00.000Z')).toEqual(unknown);
    expect(record.exchange_mic).toBe('ALXP');
    expect(generated).toEqual(before);
  });

  it('distinguishes a legitimate closed-session quote, a missing market session and an overdue collector', () => {
    const friday = quotationRecordSchema.parse({ ...observation(), instrument_id: id,
      id: crypto.randomUUID(), recorded_at: '2026-11-13T16:30:00.000Z', source_price: '12.34', value_origin: 'provider_declared',
      price: '12.34', market_timestamp: '2026-11-13T16:29:00.000Z', fetched_at: '2026-11-13T16:29:30.000Z',
      session_date: '2026-11-13', provider_delay_seconds: null });
    const saturday = '2026-11-14T10:00:00.000Z';
    expect(quotationFreshness(friday, friday, saturday, resolve(saturday)))
      .toMatchObject({ status: 'last_completed_session', reason: 'market_closed', realtime_guaranteed: false });
    const monday = '2026-11-16T10:00:00.000Z';
    const refetch = { ...friday, fetched_at: '2026-11-16T09:59:00.000Z' };
    expect(quotationFreshness(friday, refetch, monday, resolve(monday)))
      .toMatchObject({ status: 'stale', reason: 'expected_session_missing', collection_age_seconds: 60 });
    const current = { ...refetch, session_date: '2026-11-16', market_timestamp: '2026-11-16T08:00:00.000Z' };
    expect(quotationFreshness(current, current, monday, resolve(monday)))
      .toMatchObject({ status: 'within_target', collection_age_seconds: 60, market_age_seconds: 7200, delivery: 'unknown' });
    const oldFetch = { ...current, fetched_at: '2026-11-16T08:59:00.000Z' };
    expect(quotationFreshness(oldFetch, oldFetch, monday, resolve(monday)))
      .toMatchObject({ status: 'stale', reason: 'collection_over_60_minutes', collection_age_seconds: 3660 });
  });

  it('rejects holes, conflicting predecessor data and invalid reference bounds', () => {
    const hole = structuredClone(generated);
    hole.profiles[0]!.days.splice(5, 1);
    const wrongPrevious = structuredClone(generated);
    wrongPrevious.profiles[0]!.days[2]![6] = '2025-01-01';
    const bounds = { ...generated, generated_for_year: 2027 };
    const duplicate = { ...generated, profiles: [...generated.profiles, ...generated.profiles] };
    for (const reference of [null, {}, hole, wrongPrevious, bounds, duplicate]) {
      expect(createMarketCalendar(assignments, reference)(instrument(), '2026-11-09T10:00:00.000Z')).toEqual(unknown);
    }
  });

  it('never invents a last completed session when the seed is missing', () => {
    const reference = structuredClone(generated);
    reference.profiles[0]!.days[0]![6] = null;
    // A broken predecessor chain cannot supply trusted context.
    expect(createMarketCalendar(assignments, reference)(instrument(), '2026-01-01T10:00:00.000Z')).toEqual(unknown);
  });

  it('consumes a real regenerated year range without discarding its established year or extrapolating the next', () => {
    const resolve = createMarketCalendar(assignments, generateCalendarReference(2027));
    expect(resolve(instrument(), '2027-11-09T10:00:00.000Z')).toEqual({ phase: 'open', expected_session_date: '2027-11-09' });
    expect(resolve(instrument(), '2028-01-01T10:00:00.000Z')).toEqual(unknown);
  });
});
