import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const args = process.argv.slice(2);
let principal = 'reader';
let port = 8788;
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === '--principal' && ['reader', 'admin', 'collector', 'anonymous'].includes(args[i + 1])) principal = args[i + 1];
  else if (args[i] === '--port' && /^[0-9]+$/.test(args[i + 1] ?? '')) port = Number(args[i + 1]);
  else throw new Error('Usage: node scripts/dev-instruments.mjs [--principal reader|admin|collector|anonymous] [--port 0..65535]');
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');

const root = fileURLToPath(new URL('../', import.meta.url));
const state = join(root, '.wrangler');
await mkdir(state, { recursive: true });
const temporary = await mkdtemp(join(state, 'instruments-local-'));
let local;
try {
  const bundle = join(temporary, 'server.cjs');
  await build({ absWorkingDir: root, entryPoints: ['tests/helpers/instruments-http-server.mjs'], outfile: bundle, bundle: true, packages: 'external', platform: 'node', format: 'cjs', logLevel: 'silent' });
  const { startLocalInstrumentServer } = createRequire(import.meta.url)(bundle);
  local = await startLocalInstrumentServer({ principal, port });
  console.log(`Synthetic instruments only: ${local.url} (fixed ${principal} fixture; memory resets on restart)`);
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  if (local) await local.close();
  await rm(temporary, { recursive: true, force: true });
}
