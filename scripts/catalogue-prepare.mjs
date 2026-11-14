import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

// Preparation is intentionally local-only: no Wrangler, network or database call.
const root = await realpath(new URL('../', import.meta.url));
const directory = join(root, '.wrangler/catalogue-live');
const input = resolve(process.argv[2] ?? '');
if (process.argv.length !== 3 || dirname(input) !== directory || await realpath(dirname(input)) !== directory) {
  throw new Error('Usage: node scripts/catalogue-prepare.mjs .wrangler/catalogue-live/catalogue.private.json');
}
for (const path of [directory, input]) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || stat.mode & 0o077 || stat.uid !== process.getuid()) throw new Error('Owner-private preparation input required');
}
const raw = await readFile(input, 'utf8');
if (Buffer.byteLength(raw) > 32768) throw new Error('Preparation input too large');
const value = JSON.parse(raw);
const python = spawnSync(join(root, 'collector/.venv/bin/python'), ['-c',
  'import json,sys; from pea_collector.model import parse_mappings; parse_mappings([json.load(sys.stdin)["mapping"]])'],
{ cwd: root, input: raw, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
if (python.status !== 0) throw new Error('Existing Python mapping validation failed');
const result = await build({ absWorkingDir: root, entryPoints: ['scripts/catalogue-preparation.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const prepared = await module.exports.prepareCatalogue(value);
for (const [name, content] of [
  ['instrument.sql', prepared.sql + '\n'],
  ['mapping.private.json', JSON.stringify(prepared.mapping, null, 2) + '\n'],
  ['grants.private.json', JSON.stringify(prepared.grants, null, 2) + '\n'],
  ['instrument-batch.private.json', JSON.stringify(prepared.statements, null, 2) + '\n'],
]) await writeFile(join(directory, name), content, { mode: 0o600, flag: 'wx' });
console.log('catalogue_prepared_offline_no_database_access');
