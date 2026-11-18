import { DurableObject } from 'cloudflare:workers';
import { dispatchCrons, dispatchSlot, planSlot, type DispatchSlot, type DispatchResult } from '../scheduling/github-dispatch';

/** One namespace for non-financial dispatch receipts; no D1/Access bindings. */
export class SchedulerLedger extends DurableObject<SchedulerEnv> {
  async fetch(request: Request): Promise<Response> {
    if (this.env.SCHEDULER_ENABLED !== 'true') return new Response(null, { status: 503 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    try {
      const input = await request.json() as Partial<DispatchSlot>;
      if ((input.kind !== 'collector' && input.kind !== 'monitor') || typeof input.scheduled_at !== 'string') return new Response(null, { status: 400 });
      const slot = planSlot(input.kind, Date.parse(input.scheduled_at), Date.now(), Number(this.env.COLLECTOR_INTERVAL_MINUTES));
      if (!slot || slot.scheduled_at !== input.scheduled_at) return new Response(null, { status: 422 });
      const result = await dispatchSlot(slot, this.env.GITHUB_DISPATCH_TOKEN, {
        claim: (key, value) => this.ctx.storage.transaction(async transaction => {
          if (await transaction.get(key)) return false;
          await transaction.put(key, { ...value, event: 'dispatch_requested' });
          if (await transaction.getAlarm() === null) await transaction.setAlarm(Date.parse(slot.scheduled_at) + 2 * 86_400_000);
          return true;
        }),
        finish: (key, value: DispatchResult) => this.ctx.storage.put(key, value),
      });
      return Response.json(result, { status: ['dispatch_accepted', 'dispatch_duplicate'].includes(result.event) ? 200 : 502 });
    } catch {
      console.error(JSON.stringify({ event: 'scheduler_unavailable' }));
      return new Response(null, { status: 503 });
    }
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

export default {
  fetch() { return new Response(null, { status: 404 }); },
  async scheduled(controller, env) {
    if (env.SCHEDULER_ENABLED !== 'true') return;
    const kind = controller.cron === dispatchCrons.collector ? 'collector'
      : controller.cron === dispatchCrons.monitor ? 'monitor' : null;
    if (!kind) throw new Error('scheduler_cron_invalid');
    const slot = planSlot(kind, controller.scheduledTime, Date.now(), Number(env.COLLECTOR_INTERVAL_MINUTES));
    if (!slot) {
      console.log(JSON.stringify({ event: 'scheduler_slot_skipped', kind }));
      return;
    }
    const id = env.DISPATCH_LEDGER.idFromName(`${kind}/${slot.scheduled_at.slice(0, 10)}`);
    const response = await env.DISPATCH_LEDGER.get(id).fetch('https://scheduler.internal/dispatch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slot),
    });
    if (!response.ok) throw new Error('scheduler_dispatch_failed');
    await response.body?.cancel();
  },
} satisfies ExportedHandler<SchedulerEnv>;
