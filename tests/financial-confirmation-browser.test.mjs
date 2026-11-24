import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { financialConfirmationRoutes } from '../src/adapters/rest/financial-confirmation';
import { ApplicationError } from '../src/application/errors';

// Optional native-browser check; never install a browser or use a signed-in profile.
const browser = process.env.BROWSER_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
it.skipIf(!existsSync(browser))('native form POST preserves Origin under the actual confirmation policy', async () => {
  // Denied synthetic navigation still receives the real route's response headers.
  // No service method, proposal, portfolio or database is involved.
  const routes = financialConfirmationRoutes({}, async () => { throw new ApplicationError(401, 'invalid_token'); },
    'https://synthetic-approval.example.invalid');
  const page = await routes.request('https://synthetic-approval.example.invalid/10000000-0000-4000-8000-000000000099');
  const policy = page.headers.get('Referrer-Policy');
  expect(policy).toBe('strict-origin');
  const observations = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.method === 'POST') {
      observations.push({ path, origin: request.headers.origin, referer: request.headers.referer,
        site: request.headers['sec-fetch-site'] });
      request.resume();
      if (path === '/old') { response.writeHead(303, { Location: '/fixed' }); response.end(); }
      else { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<p>Synthetic test complete</p>'); }
      return;
    }
    const fixed = path === '/fixed';
    response.writeHead(200, { 'Content-Type': 'text/html', 'Referrer-Policy': fixed ? policy : 'no-referrer' });
    response.end(`<form method="post" action="/${fixed ? 'new' : 'old'}"><input name="synthetic" value="test"></form><script>document.querySelector('form').requestSubmit()</script>`);
  });
  const profile = await mkdtemp(join(tmpdir(), 'pea-synthetic-referrer-'));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await promisify(execFile)(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', `--user-data-dir=${profile}`,
      '--dump-dom', '--virtual-time-budget=3000', `${origin}/start`], { timeout: 15000, maxBuffer: 262144 });
    expect(observations).toHaveLength(2);
    expect(observations[0]).toMatchObject({ path: '/old', origin: 'null', site: 'same-origin' });
    expect(observations[1]).toEqual({ path: '/new', origin, referer: `${origin}/`, site: 'same-origin' });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
}, 20000);
