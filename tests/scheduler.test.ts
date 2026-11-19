import { describe, expect, it, vi } from 'vitest';
import { dispatchSlot, planSlot, type DispatchLedger, type DispatchResult, type DispatchSlot } from '../src/scheduling/github-dispatch';

const slot: DispatchSlot = { kind: 'collector', scheduled_at: '2026-11-18T06:17:00.000Z' };
function ledger() {
  const claims = new Set<string>();
  const receipts = new Map<string, DispatchResult>();
  const store: DispatchLedger = {
    async claim(key) { if (claims.has(key)) return false; claims.add(key); return true; },
    async finish(key, result) { receipts.set(key, result); },
  };
  return { store, claims, receipts };
}

describe('isolated Cloudflare dispatch planning', () => {
  it.each([
    ['2026-01-12T06:17:00Z', true], ['2026-07-13T05:17:00Z', true],
    ['2026-01-12T18:47:00Z', true], ['2026-07-13T17:47:00Z', true],
    ['2026-01-12T05:47:00Z', false], ['2026-07-13T18:17:00Z', false],
    ['2026-03-27T06:17:00Z', true], ['2026-03-30T05:17:00Z', true],
    ['2026-10-23T05:17:00Z', true], ['2026-10-26T06:17:00Z', true],
    ['2026-11-21T06:17:00Z', false], ['2026-11-18T06:18:00Z', false],
  ])('uses Paris weekdays across DST: %s', (value, expected) => {
    const time = Date.parse(value);
    expect(planSlot('collector', time, time, 30) !== null).toBe(expected);
  });
  it('preserves supported cadence, bounds delays and uses scheduled time', () => {
    const time = Date.parse(slot.scheduled_at);
    expect(planSlot('collector', time, time + 600_000, 30)).toEqual(slot);
    expect(planSlot('collector', time, time + 600_001, 30)).toBeNull();
    expect(planSlot('collector', time, time - 1, 30)).toBeNull();
    expect(planSlot('collector', time + 1, time + 1, 30)).toEqual(slot);
    expect(planSlot('collector', time, time, 15)).toBeNull();
    for (const [minutes, expected] of [[30, 26], [60, 13], [120, 7]]) {
      let count = 0;
      for (let hour = 6; hour <= 18; hour++) for (const minute of [17, 47]) {
        const value = Date.UTC(2026, 10, 18, hour, minute);
        if (planSlot('collector', value, value, minutes!)) count++;
      }
      expect(count).toBe(expected);
    }
    const monitor = Date.parse('2026-11-18T07:09:00Z');
    expect(planSlot('monitor', monitor, monitor, 30)?.kind).toBe('monitor');
    expect(planSlot('collector', monitor, monitor, 30)).toBeNull();
  });
  it('normalizes observed Cloudflare timestamps to one minute slot without relaxing delay or future bounds', () => {
    const collector = Date.parse('2026-11-18T17:47:40.087Z');
    const monitor = Date.parse('2026-11-18T18:09:21.569Z');
    expect(planSlot('collector', collector, collector + 700, 30)).toEqual({
      kind: 'collector', scheduled_at: '2026-11-18T17:47:00.000Z',
    });
    expect(planSlot('monitor', monitor, monitor + 700, 30)).toEqual({
      kind: 'monitor', scheduled_at: '2026-11-18T18:09:00.000Z',
    });
    expect(planSlot('collector', collector + 1_000, collector + 1_000, 30))
      .toEqual(planSlot('collector', collector, collector, 30));
    expect(planSlot('collector', collector, collector - 1, 30)).toBeNull();
    expect(planSlot('collector', collector, Date.parse('2026-11-18T17:57:00.001Z'), 30)).toBeNull();
  });
  it.each(['2026-01-12T19:09:00Z', '2026-07-13T18:09:00Z'])('keeps a closing monitor at 20:09 Paris across DST: %s', value => {
    const time = Date.parse(value);
    expect(planSlot('monitor', time, time, 30)?.kind).toBe('monitor');
    expect(planSlot('monitor', time + 3_600_000, time + 3_600_000, 30)).toBeNull();
    expect(planSlot('collector', time + 8 * 60_000, time + 8 * 60_000, 30)).toBeNull();
  });
});

describe('at-most-one GitHub POST attempt per claimed slot', () => {
  it.each([200, 204])('pins GitHub/main, correlates slots and accepts HTTP %s only as dispatch acceptance', async status => {
    const state = ledger(); const log = vi.fn();
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status }));
    const result = await dispatchSlot(slot, 'synthetic-secret', state.store, transport, log);
    expect(result.event).toBe('dispatch_accepted');
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/damienSavoldelli/pea-tracker/actions/workflows/quotation-collector.yml/dispatches');
    expect(init?.redirect).toBe('manual');
    expect(JSON.parse(String(init?.body))).toEqual({ ref: 'main', inputs: {
      trigger: 'cloudflare', mode: 'live', scheduled_at: slot.scheduled_at,
    } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-secret');
    expect(state.receipts.size).toBe(1);
  });
  it('prevents duplicate and overlapping dispatches through a claim before network I/O', async () => {
    const state = ledger();
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const results = await Promise.all(Array.from({ length: 4 }, () => dispatchSlot(slot, 'synthetic-secret', state.store, transport, () => {})));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(results.filter(result => result.event === 'dispatch_duplicate')).toHaveLength(3);
  });
  it.each([301, 401, 403, 404, 422, 429, 500, 503])('does not retry HTTP %s or leak response text', async status => {
    const state = ledger(); const log = vi.fn();
    const transport = vi.fn<typeof fetch>(async () => new Response('synthetic-sensitive-error', { status }));
    const result = await dispatchSlot(slot, 'synthetic-secret', state.store, transport, log);
    expect(result.event).toBe(status >= 500 ? 'dispatch_unknown' : 'dispatch_rejected');
    await dispatchSlot(slot, 'synthetic-secret', state.store, transport, log);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/synthetic-secret|synthetic-sensitive-error/);
  });
  it('keeps network timeouts ambiguous and never redispatches a claimed slot', async () => {
    const state = ledger(); const log = vi.fn();
    const transport = vi.fn<typeof fetch>(async () => { throw new Error('synthetic-sensitive-timeout'); });
    expect((await dispatchSlot(slot, 'synthetic-secret', state.store, transport, log)).event).toBe('dispatch_unknown');
    await dispatchSlot(slot, 'synthetic-secret', state.store, transport, log);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-sensitive');
  });
  it('does not dispatch without credentials or when durable claim fails', async () => {
    const transport = vi.fn<typeof fetch>(); const state = ledger();
    await expect(dispatchSlot(slot, '', state.store, transport)).rejects.toThrow('scheduler_credentials_unavailable');
    const broken: DispatchLedger = { async claim() { throw new Error('storage failed'); }, async finish() {} };
    await expect(dispatchSlot(slot, 'synthetic-secret', broken, transport)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('dispatches monitoring without live collection inputs', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await dispatchSlot({ kind: 'monitor', scheduled_at: '2026-11-18T07:09:00.000Z' }, 'synthetic-secret', ledger().store, transport, () => {});
    expect(transport.mock.calls[0]![0]).toContain('/quotation-monitor.yml/dispatches');
    expect(JSON.parse(String(transport.mock.calls[0]![1]?.body)).inputs).not.toHaveProperty('mode');
  });
});
