import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Miniflare installs synchronous signal-exit hooks. Keep it in an owned child so
// Ctrl-C can close HTTP, await binding disposal, and remove the bundle in order.
const runtime = fileURLToPath(new URL('../tests/helpers/d1-http-runtime.mjs', import.meta.url));
const child = fork(runtime, process.argv.slice(2), { detached: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
let stopping = false;
const stop = () => {
  if (!stopping) { stopping = true; if (child.connected) child.send('pea-local-stop'); }
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
child.on('message', message => {
  if (typeof message?.url === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(message.url)) {
    console.log(`Synthetic instruments only: ${message.url} (fixed startup fixture; local D1 persists across restarts)`);
    if (stopping && child.connected) child.send('pea-local-stop');
  }
});
await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Local D1 runtime exited ${code ?? signal}`)));
});
