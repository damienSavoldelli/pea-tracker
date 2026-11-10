import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { openLocalD1, projectRoot } from './d1-local.mjs';

if (!process.send) throw new Error('Local D1 runtime requires its owning launcher');

const args = process.argv.slice(2);
let principal = 'reader';
let port = 8788;
let portfolio = false;
let directory = join(projectRoot, '.wrangler/instruments-d1-local');
for (let i = 0; i < args.length; i += 2) {
  if (args[i] === '--principal' && ['reader', 'admin', 'collector', 'anonymous'].includes(args[i + 1])) principal = args[i + 1];
  else if (args[i] === '--port' && /^[0-9]+$/.test(args[i + 1] ?? '')) port = Number(args[i + 1]);
  else if (args[i] === '--state' && args[i + 1]) directory = args[i + 1];
  else if (args[i] === '--portfolio' && ['true', 'false'].includes(args[i + 1])) portfolio = args[i + 1] === 'true';
  else throw new Error('Usage: node scripts/dev-instruments-d1.mjs [--principal reader|admin|collector|anonymous] [--port 0..65535] [--state owned-local-directory]');
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
await mkdir(join(projectRoot, '.wrangler'), { recursive: true });
const temporary = await mkdtemp(join(projectRoot, '.wrangler/instruments-local-'));
let local;
let server;
try {
  local = await openLocalD1({ directory, migrate: false });
  const bundle = join(temporary, 'server.cjs');
  await build({ absWorkingDir: projectRoot, entryPoints: ['tests/helpers/d1-instruments-http-server.mjs'], outfile: bundle, bundle: true, packages: 'external', platform: 'node', format: 'cjs', logLevel: 'silent' });
  const { startD1InstrumentServer } = createRequire(import.meta.url)(bundle);
  server = await startD1InstrumentServer(local.db, { principal, port, portfolio });
  process.send({ url: server.url });
  await new Promise(resolve => {
    process.on('message', message => { if (message === 'pea-local-stop') resolve(); });
    process.once('disconnect', resolve);
  });
} finally {
  if (server) await server.close();
  if (local) await local.dispose();
  await rm(temporary, { recursive: true, force: true });
  if (process.connected) process.disconnect();
}
