import { getPlatformProxy } from 'wrangler';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';

const execute = promisify(execFile);
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const configPath = join(projectRoot, 'tests/fixtures/wrangler.d1-local.jsonc');
const stateRoot = join(projectRoot, '.wrangler');
process.env.WRANGLER_SEND_METRICS = 'false';

export async function assertLocalD1Config() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const allowed = ['$schema', 'name', 'main', 'compatibility_date', 'workers_dev', 'preview_urls', 'd1_databases'];
  const binding = config.d1_databases?.[0];
  if (Object.keys(config).some(key => !allowed.includes(key)) || config.workers_dev !== false || config.preview_urls !== false ||
      config.name !== 'pea-tracker-instruments-local' || config.main !== '../../src/index.ts' || config.d1_databases?.length !== 1 ||
      !binding || Object.keys(binding).some(key => !['binding', 'database_name', 'remote', 'migrations_dir'].includes(key)) ||
      binding.binding !== 'INSTRUMENTS_DB' || binding.database_name !== 'pea-tracker-instruments-local' || binding.remote !== false ||
      binding.migrations_dir !== '../../migrations') throw new Error('Only the fixed, ID-free local D1 fixture is permitted');
  const files = await readdir(dirname(configPath));
  if (files.some(file => /^\.(?:env|dev\.vars)(?:\.|$)/.test(file))) throw new Error('Local D1 fixture must not contain environment files');
  return config;
}

async function statePath(directory) {
  await mkdir(stateRoot, { recursive: true });
  const path = resolve(directory);
  if (dirname(path) !== stateRoot || (basename(path) !== 'instruments-d1-local' && !basename(path).startsWith('d1-tests-'))) {
    throw new Error('D1 state must use the owned local .wrangler namespace');
  }
  await mkdir(path, { recursive: true });
  if (await realpath(path) !== path || await realpath(stateRoot) !== stateRoot) throw new Error('D1 state symlinks are not allowed');
  return path;
}

export async function runLocalMigrations(directory, options = {}) {
  const config = await assertLocalD1Config();
  const path = await statePath(directory);
  let selectedConfig = configPath;
  if (options.migrationsDirectory !== undefined) {
    const migrations = resolve(options.migrationsDirectory);
    if (!basename(path).startsWith('d1-tests-') || !migrations.startsWith(`${path}/`)) throw new Error('Migration override is test-owned only');
    selectedConfig = join(path, 'migration-config.json');
    await writeFile(selectedConfig, JSON.stringify({ ...config, main: join(projectRoot, 'src/index.ts'), d1_databases: [{ ...config.d1_databases[0], migrations_dir: migrations }] }));
  }
  // Fixed official CLI operation; never accepts remote/config/auth arguments.
  return execute(process.execPath, [join(projectRoot, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'migrations', 'apply', 'pea-tracker-instruments-local', '--config', selectedConfig, '--env=', '--local', '--persist-to', path],
  { cwd: projectRoot, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, timeout: 30000, maxBuffer: 1024 * 1024 });
}

export async function readPersistenceProbe(directory) {
  await assertLocalD1Config();
  const path = await statePath(directory);
  const result = await execute(process.execPath, [join(projectRoot, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', 'execute', 'pea-tracker-instruments-local', '--config', configPath, '--env=', '--local', '--persist-to', path,
    '--command', 'SELECT value FROM gate_persistence WHERE id = 1', '--json'],
  { cwd: projectRoot, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, timeout: 30000, maxBuffer: 1024 * 1024 });
  return JSON.parse(result.stdout);
}

export async function openLocalD1(options = {}) {
  await assertLocalD1Config();
  await mkdir(stateRoot, { recursive: true });
  const directory = await statePath(options.directory ?? await mkdtemp(join(stateRoot, 'd1-tests-')));
  let platform;
  try {
    if (options.migrate !== false) await runLocalMigrations(directory);
    platform = await getPlatformProxy({ configPath, environment: '', envFiles: [], remoteBindings: false, persist: { path: join(directory, 'v3') } });
  } catch (error) {
    if (options.directory === undefined) await rm(directory, { recursive: true, force: true });
    throw error;
  }
  let disposed = false;
  const dispose = async () => {
    if (!disposed) { disposed = true; await platform.dispose(); }
  };
  return {
    db: platform.env.INSTRUMENTS_DB,
    directory,
    dispose,
    cleanup: async () => {
      await dispose();
      // Persistent developer state is never deleted by fixture cleanup.
      if (basename(directory).startsWith('d1-tests-')) await rm(directory, { recursive: true, force: true });
    },
  };
}
