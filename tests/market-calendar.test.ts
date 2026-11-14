import { describe, expect, it } from 'vitest';
import { instrumentSchema } from '../src/domain/instruments';
import { createMarketCalendar } from '../src/adapters/calendar/market-calendar';
import generated from '../src/adapters/calendar/sessions.generated.json';
import { generateCalendarReference } from './helpers/calendar-generation.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const instrument = (mic: string | null = 'XPAR') => instrumentSchema.parse({
  id, name: 'Synthetic calendar instrument', kind: 'stock', quote_currency: 'EUR', price_unit: 'currency_unit',
  exchange_mic: mic, version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
});
const assignments = JSON.stringify([{ instrument_id: id, mic: 'XPAR', profile_id: 'xpar-continuous-core-v1' }]);
const unknown = { phase: 'unknown', expected_session_date: null };

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
