import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';

const python = resolve('collector/.venv/bin/python');
export const collectorPythonAvailable = existsSync(python);

export async function collectorProcess() {
  const directory = await mkdtemp(join(tmpdir(), 'pea-collector-synthetic-'));
  const executeWith = (environment, origin, cycle) => new Promise(resolveResult => {
    execFile(python, ['-m', 'pea_collector', '--deliver-local', '--cycle-id', cycle, '--state', join(directory, 'journal')], {
      cwd: resolve('collector'), env: { PATH: process.env.PATH, COLLECTOR_API_ORIGIN: origin, ...environment }, timeout: 20000,
    }, (error, stdout, stderr) => resolveResult({ code: error ? 1 : 0, stdout, stderr }));
  });
  return {
    execute(token, origin, cycle = 'synthetic-cross-language') {
      return executeWith({ COLLECTOR_ACCESS_TOKEN: token }, origin, cycle);
    },
    executeAccess(credentials, origin, cycle = 'synthetic-access-cycle') {
      return executeWith({ COLLECTOR_AUTH_MODE: 'cloudflare_access', COLLECTOR_ACCESS_CLIENT_ID: credentials.clientId,
        COLLECTOR_ACCESS_CLIENT_SECRET: credentials.clientSecret }, origin, cycle);
    },
    close: () => rm(directory, { recursive: true, force: true }),
  };
}
