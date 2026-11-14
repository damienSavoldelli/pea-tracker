import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run the real generator in an owned temporary directory without Node types in Worker-facing TypeScript. */
export function generateCalendarReference(year) {
  const directory = mkdtempSync(join(tmpdir(), 'pea-calendar-'));
  const output = join(directory, 'sessions.json');
  try {
    execFileSync('python3', [fileURLToPath(new URL('../../scripts/generate-market-calendar.py', import.meta.url)),
      '--year', String(year), '--output', output], { timeout: 10000, maxBuffer: 524288, stdio: 'pipe' });
    return JSON.parse(readFileSync(output, 'utf8'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
