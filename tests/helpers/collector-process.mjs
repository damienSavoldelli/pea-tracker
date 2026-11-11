import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';

const python = resolve('collector/.venv/bin/python');
export const collectorPythonAvailable = existsSync(python);

export async function collectorProcess() {
  const directory = await mkdtemp(join(tmpdir(), 'pea-collector-synthetic-'));
  return {
    execute(token, origin, cycle = 'synthetic-cross-language') {
      return new Promise(resolveResult => {
        execFile(python, ['-m', 'pea_collector', '--deliver-local', '--cycle-id', cycle, '--state', join(directory, 'journal')], {
          cwd: resolve('collector'), env: { PATH: process.env.PATH, COLLECTOR_API_ORIGIN: origin, COLLECTOR_ACCESS_TOKEN: token }, timeout: 20000,
        }, (error, stdout, stderr) => resolveResult({ code: error ? 1 : 0, stdout, stderr }));
      });
    },
    close: () => rm(directory, { recursive: true, force: true }),
  };
}
