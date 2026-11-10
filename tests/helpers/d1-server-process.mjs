import { spawn } from 'node:child_process';
import { projectRoot } from './d1-local.mjs';
import { join } from 'node:path';

// Test-owned real process boundary. No credentials, remote CLI flags or generic
// executable/config arguments can be supplied by callers.
export async function startD1ServerProcess(directory, portfolio = false) {
  const child = spawn(process.execPath, [join(projectRoot, 'scripts/dev-instruments-d1.mjs'), '--principal', 'admin', '--port', '0', '--state', directory,
    ...(portfolio ? ['--portfolio', 'true'] : [])], {
    cwd: projectRoot, detached: true, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exited = false;
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => { exited = true; code === 0 ? resolve() : reject(new Error(`Local synthetic server exited ${code}`)); });
  });
  // Observe rejection immediately, including startup failure before a listener exists.
  exit.catch(() => {});
  const stop = async () => {
    // Model terminal Ctrl-C: signal the launcher's entire process group. Its
    // detached runtime must still shut down through awaited IPC disposal.
    if (!exited) process.kill(-child.pid, 'SIGINT');
    await exit;
  };
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local D1 server startup timeout')), 30000);
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        const match = output.match(/Synthetic instruments only: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      // Consume stderr without printing SQL, bindings or environment information.
      child.stderr.resume();
      exit.then(() => { clearTimeout(timer); reject(new Error('Server exited before startup')); }, error => { clearTimeout(timer); reject(error); });
    });
    return { url, stop };
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
}
