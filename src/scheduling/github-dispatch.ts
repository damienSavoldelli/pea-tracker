/** Infrastructure scheduling only: no financial repository or ingestion credential. */
export type DispatchKind = 'collector' | 'monitor';
export interface DispatchSlot { kind: DispatchKind; scheduled_at: string }
export interface DispatchResult extends DispatchSlot {
  event: 'dispatch_requested' | 'dispatch_accepted' | 'dispatch_rejected' | 'dispatch_unknown' | 'dispatch_duplicate';
  http_status?: number;
}
export interface DispatchLedger {
  claim(key: string, slot: DispatchSlot): Promise<boolean>;
  finish(key: string, result: DispatchResult): Promise<void>;
}
export const dispatchCrons = { collector: '17,47 * * * *', monitor: '9 * * * *' } as const;
const paris = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
});

/** Keep 07:17..19:47 Paris on weekdays through DST, not an exchange calendar. */
export function planSlot(kind: DispatchKind, scheduledTime: number, now: number, interval: number): DispatchSlot | null {
  if (![30, 60, 120].includes(interval) || !Number.isSafeInteger(scheduledTime) ||
    !Number.isFinite(now) || scheduledTime < 0 || now < scheduledTime || now - scheduledTime > 600_000) return null;
  const date = new Date(scheduledTime);
  if (!Number.isFinite(date.getTime()) || date.getUTCSeconds() || date.getUTCMilliseconds()) return null;
  const parts = Object.fromEntries(paris.formatToParts(date).map(part => [part.type, part.value]));
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(parts.weekday!) || Number(parts.hour) < 7 || Number(parts.hour) > 19) return null;
  if (kind === 'collector') {
    if (![17, 47].includes(date.getUTCMinutes()) || Math.floor(scheduledTime / 1_800_000) % (interval / 30)) return null;
  } else if (kind !== 'monitor' || date.getUTCMinutes() !== 9) return null;
  return { kind, scheduled_at: date.toISOString() };
}

/** At most one POST attempt per durable claim. Never retry an ambiguous dispatch. */
export async function dispatchSlot(slot: DispatchSlot, token: string, ledger: DispatchLedger,
  transport: typeof fetch = fetch, log: (result: DispatchResult) => void = result => console.log(JSON.stringify(result))) {
  if (!token || token.length > 4096 || /\s/.test(token)) throw new Error('scheduler_credentials_unavailable');
  const key = `${slot.kind}/${slot.scheduled_at}`;
  if (!await ledger.claim(key, slot)) {
    const result: DispatchResult = { ...slot, event: 'dispatch_duplicate' };
    log(result);
    return result;
  }
  log({ ...slot, event: 'dispatch_requested' });
  const workflow = slot.kind === 'collector' ? 'quotation-collector.yml' : 'quotation-monitor.yml';
  const inputs = { trigger: 'cloudflare', scheduled_at: slot.scheduled_at,
    ...(slot.kind === 'collector' ? { mode: 'live' } : {}) };
  let result: DispatchResult;
  try {
    const response = await transport(`https://api.github.com/repos/damienSavoldelli/pea-tracker/actions/workflows/${workflow}/dispatches`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'pea-tracker-scheduler', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs }),
    });
    // Ignore response bodies: neither provider errors nor credentials enter logs.
    void response.body?.cancel().catch(() => {});
    result = { ...slot, http_status: response.status,
      event: [200, 204].includes(response.status) ? 'dispatch_accepted'
        : response.status >= 500 ? 'dispatch_unknown' : 'dispatch_rejected' };
  } catch {
    result = { ...slot, event: 'dispatch_unknown' };
  }
  await ledger.finish(key, result);
  log(result);
  return result;
}
