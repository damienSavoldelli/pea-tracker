import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

/** Native SQLite DO fixture. No env loader, remote bindings or real outbound I/O. */
export async function startSchedulerWorker(enabled = true) {
  const bundle = await build({ entryPoints: ['src/entrypoints/scheduler.ts'], bundle: true,
    write: false, platform: 'browser', format: 'esm', external: ['cloudflare:workers'], logLevel: 'silent' });
  let calls = 0;
  const source = await readFile(new URL('../../wrangler.scheduler.jsonc', import.meta.url), 'utf8');
  const settings = JSON.parse(source.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n'));
  const config = { name: 'scheduler-local', compatibilityDate: settings.compatibility_date,
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm',
      contents: 'Date.now=()=>Date.parse("2026-11-18T06:17:00Z");\n' + bundle.outputFiles[0].text } } },
    exports: { SchedulerLedger: { type: 'durable-object', storage: 'sqlite' } },
    env: {
      SCHEDULER_ENABLED: { type: 'text', value: String(enabled) },
      COLLECTOR_INTERVAL_MINUTES: { type: 'text', value: '30' },
      GITHUB_DISPATCH_TOKEN: { type: 'text', value: 'synthetic-secret' },
      DISPATCH_LEDGER: { type: 'durable-object', worker: 'scheduler-local', exportName: 'SchedulerLedger' },
    },
  };
  const runtime = new Miniflare({ workers: [{ config, dev: { outboundService: { type: 'fetcher',
    handler: async request => {
      if (request.url !== 'https://api.github.com/repos/damienSavoldelli/pea-tracker/actions/workflows/quotation-collector.yml/dispatches') throw new Error('Unexpected synthetic outbound destination');
      calls++;
      return new Response(null, { status: 204 });
    },
  } } }], host: '127.0.0.1', port: 0, cf: false, enableDevRegistry: false,
    telemetry: { enabled: false }, logRequests: false });
  try {
    await runtime.ready;
    return {
      calls: () => calls,
      async dispatch() {
        const env = await runtime.getBindings('scheduler-local');
        const stub = env.DISPATCH_LEDGER.get(env.DISPATCH_LEDGER.idFromName('synthetic-slot'));
        const response = await stub.fetch('https://scheduler.internal/dispatch', { method: 'POST',
          body: JSON.stringify({ kind: 'collector', scheduled_at: '2026-11-18T06:17:00.000Z' }) });
        return { status: response.status, event: response.status === 200 ? (await response.json()).event : null };
      },
      async publicStatus() { return (await runtime.dispatchFetch('https://scheduler.invalid/')).status; },
      close: () => runtime.dispose(),
    };
  } catch (error) { await runtime.dispose(); throw error; }
}
