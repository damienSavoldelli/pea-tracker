import { z } from 'zod';
import { instrumentIdSchema, type Instrument } from '../../domain/instruments';
import type { MarketContext } from '../../domain/quotations';
import generated from './sessions.generated.json';

const unknown = (): MarketContext => ({ phase: 'unknown', expected_session_date: null });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const instant = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
});
const instant = z.string().datetime({ precision: 3 });
const profileId = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/);
const mic = z.enum(['XPAR', 'ALXP']);
const daySchema = z.tuple([date, instant, instant, z.enum(['regular', 'closed', 'unknown_session', 'unknown']),
  instant.nullable(), instant.nullable(), date.nullable()]);
const profileSchema = z.object({
  id: profileId, mic, timezone: z.literal('Europe/Paris'), coverage_start: instant, coverage_end: instant,
  days: z.array(daySchema).min(1).max(732),
}).strict();
const referenceSchema = z.object({
  version: z.literal(1), generator: z.literal('pea-market-calendar/1'),
  generated_for_year: z.number().int().min(2025).max(2099), profiles: z.array(z.unknown()).max(8),
}).strict();
const assignmentsSchema = z.array(z.union([
  z.object({ instrument_id: instrumentIdSchema, mic, profile_id: profileId }).strict(),
  // A venue calendar establishes full closures only, never an instrument's trading mode.
  z.object({ instrument_id: instrumentIdSchema, mic: z.literal('XPAR'),
    calendar_id: z.literal('euronext-paris-cash-days-v1') }).strict(),
])).max(100);
type Profile = z.infer<typeof profileSchema>;
type Assignment = z.infer<typeof assignmentsSchema>[number];

/** Validate the bounded local artifact once; a bad profile cannot supply trusted context. */
function established(profile: Profile, year: number): boolean {
  let cursor = profile.coverage_start;
  let previous = profile.days[0]?.[6] ?? null;
  let nextDate = `${year}-01-01`;
  for (const [day, start, end, state, open, close, prior] of profile.days) {
    if (day !== nextDate || start !== cursor || start >= end) return false;
    if (prior !== (state === 'unknown' ? null : previous) || prior !== null && prior >= day) return false;
    if (state === 'regular') {
      if (!open || !close || open < start || open >= close || close >= end) return false;
    } else if (open !== null || close !== null) return false;
    previous = state === 'unknown' ? null : state === 'closed' ? previous : day;
    nextDate = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10);
    cursor = end;
  }
  return cursor === profile.coverage_end && nextDate === `${year + 2}-01-01`;
}

/** Build an immutable per-reader resolver. The optional assignment JSON is private server configuration.
 * Invalid/absent assignments or reference data yield unknown, without weakening owner authentication.
 * The artifact contains calendar facts only; no provider calls, portfolio identities or financial values.
 */
export function createMarketCalendar(input: unknown, reference: unknown = generated) {
  const profiles = new Map<string, Profile>();
  const assignments = new Map<string, Assignment>();
  const envelope = referenceSchema.safeParse(reference);
  if (envelope.success) {
    const duplicates = new Set<string>();
    for (const item of envelope.data.profiles) {
      const parsed = profileSchema.safeParse(item);
      if (!parsed.success || !established(parsed.data, envelope.data.generated_for_year)) continue;
      if (profiles.has(parsed.data.id)) duplicates.add(parsed.data.id);
      profiles.set(parsed.data.id, parsed.data);
    }
    for (const id of duplicates) profiles.delete(id);
  }
  if (typeof input === 'string' && input.length <= 32768) {
    try {
      const parsed = assignmentsSchema.safeParse(JSON.parse(input));
      if (parsed.success && new Set(parsed.data.map(item => item.instrument_id)).size === parsed.data.length) {
        for (const item of parsed.data) assignments.set(item.instrument_id, item);
      }
    } catch { /* Optional invalid calendar input must not disable financial reads. */ }
  }
  return (instrument: Instrument, now: string): MarketContext => {
    const assignment = assignments.get(instrument.id);
    const venueOnly = assignment !== undefined && 'calendar_id' in assignment;
    // Reuse the validated day table and DST bounds; venue assignments ignore all intraday hours.
    const profile = assignment && profiles.get('profile_id' in assignment ? assignment.profile_id : 'xpar-continuous-core-v1');
    if (!assignment || !profile || assignment.mic !== instrument.exchange_mic || profile.mic !== assignment.mic ||
      !instant.safeParse(now).success || now < profile.coverage_start || now >= profile.coverage_end) return unknown();
    // UTC intervals already encode IANA/DST boundaries. Do not rederive local dates in the Worker.
    let low = 0;
    let high = profile.days.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (profile.days[mid]![2] <= now) low = mid + 1;
      else high = mid;
    }
    const day = profile.days[low];
    if (!day || now < day[1]) return unknown();
    const [session, , , state, open, close, previous] = day;
    if (state === 'closed' && previous) return { phase: 'closed', expected_session_date: previous };
    if (!venueOnly && state === 'regular' && open && close && now >= open && now < close) {
      return { phase: 'open', expected_session_date: session };
    }
    // Auctions, pre/post-trading and half-day hours are not admitted by the core profile.
    return unknown();
  };
}
