import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function startOAuthWorker(variant = 'jwt') {
  if (!['jwt', 'access'].includes(variant)) throw new Error('Unknown OAuth fixture');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const fixture = new URL('../fixtures/wrangler.oauth-local.jsonc', import.meta.url);
  const config = JSON.parse(await readFile(fixture, 'utf8'));
  if (Object.keys(config).some(key => !['$schema', 'name', 'main', 'compatibility_date', 'workers_dev', 'preview_urls'].includes(key)) ||
      config.name !== 'pea-tracker-oauth-local' || config.main !== 'oauth-worker.ts' || config.workers_dev !== false || config.preview_urls !== false) throw new Error('Invalid isolated OAuth fixture');
  if ((await readdir(new URL('../fixtures/', import.meta.url))).some(file => /^\.(?:env|dev\.vars)(?:\.|$)/.test(file))) throw new Error('Fixture environment files are not allowed');
  // Existing pinned Wrangler dependencies only. Inline native runtime options
  // load no .env, .dev.vars, credential files, remote bindings or persistent state.
  const result = await build({ absWorkingDir: root, entryPoints: [variant === 'access' ? 'tests/fixtures/access-worker.ts' : 'tests/fixtures/oauth-worker.ts'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' });
  const runtime = new Miniflare({ workers: [{ config: { name: config.name, compatibilityDate: variant === 'access' ? '2026-11-09' : config.compatibility_date,
    manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: result.outputFiles[0].text } } } } }],
    host: '127.0.0.1', port: 0, cf: false, enableDevRegistry: false, telemetry: { enabled: false }, logRequests: false });
  try {
    const url = await runtime.ready;
    return { url: url.origin, close: () => runtime.dispose() };
  } catch (error) { await runtime.dispose(); throw error; }
}
