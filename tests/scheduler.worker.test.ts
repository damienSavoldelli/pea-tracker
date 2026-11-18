import { expect, it } from 'vitest';
import { startSchedulerWorker } from './helpers/scheduler-worker.mjs';

it('native SQLite DO claims one slot under concurrent calls and retains the receipt for a new stub', async () => {
  const worker = await startSchedulerWorker();
  try {
    const results = await Promise.all([worker.dispatch(), worker.dispatch(), worker.dispatch()]);
    expect(results.every(result => result.status === 200)).toBe(true);
    expect(results.filter(result => result.event === 'dispatch_accepted')).toHaveLength(1);
    expect(results.filter(result => result.event === 'dispatch_duplicate')).toHaveLength(2);
    expect(await worker.dispatch()).toEqual({ status: 200, event: 'dispatch_duplicate' });
    expect(worker.calls()).toBe(1);
    expect(await worker.publicStatus()).toBe(404);
  } finally { await worker.close(); }
}, 30_000);

it('closed native scheduler cannot dispatch and exposes no public route', async () => {
  const worker = await startSchedulerWorker(false);
  try {
    expect((await worker.dispatch()).status).toBe(503);
    expect(worker.calls()).toBe(0);
    expect(await worker.publicStatus()).toBe(404);
  } finally { await worker.close(); }
}, 30_000);
