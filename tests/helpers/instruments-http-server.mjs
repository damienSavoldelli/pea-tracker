import { createServer, request } from 'node:http';
import { createApp } from '../../src/app.ts';
import { MemoryInstrumentRepository } from '../../src/adapters/memory/instruments.ts';
import { InstrumentService } from '../../src/application/instruments.ts';

// This fixture lives outside src, is never imported by the deployment entrypoint,
// and has no configurable bind address or request-selectable principal.
export async function startLocalInstrumentServer(options = {}) {
  const role = options.principal ?? 'reader';
  if (!['reader', 'admin', 'collector', 'anonymous'].includes(role)) throw new Error('Invalid synthetic principal');
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local port');
  const principal = role === 'anonymous' ? null : {
    subject: `synthetic-local-${role}`,
    permissions: role === 'admin' ? ['instruments:read', 'instruments:admin'] : role === 'reader' ? ['instruments:read'] : [],
  };
  const app = options.app ?? createApp({ instruments: { service: new InstrumentService(options.repository ?? new MemoryInstrumentRepository()), authenticate: () => principal } });
  const server = createServer({ requestTimeout: 5000, headersTimeout: 5000 }, async (incoming, outgoing) => {
    const problem = (status, code) => {
      outgoing.writeHead(status, { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' });
      outgoing.end(JSON.stringify({ type: 'about:blank', title: status === 413 ? 'Content Too Large' : status === 403 ? 'Forbidden' : 'Bad Request', status, code, request_id: crypto.randomUUID() }));
      incoming.resume();
    };
    try {
      const address = server.address();
      const host = `127.0.0.1:${address.port}`;
      const origin = `http://${host}`;
      if (incoming.socket.remoteAddress !== '127.0.0.1' || incoming.headers.host !== host ||
          (incoming.headers.origin !== undefined && incoming.headers.origin !== origin) || incoming.headers['sec-fetch-site'] === 'cross-site') {
        problem(403, 'local_request_forbidden');
        return;
      }
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) { problem(400, 'invalid_request'); return; }
      const chunks = [];
      let size = 0;
      const maximum = incoming.url.startsWith('/api/v1/instruments') ? 16 * 1024
        : incoming.url.startsWith('/api/v1/portfolio/') || incoming.url.startsWith('/api/v1/quotation-batches') ? 128 * 1024 : 64 * 1024;
      for await (const chunk of incoming) {
        const bytes = chunk;
        size += bytes.byteLength;
        if (size > maximum) { problem(413, 'body_too_large'); return; }
        chunks.push(bytes);
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const init = { method: incoming.method ?? 'GET', headers };
      if (init.method !== 'GET' && init.method !== 'HEAD') init.body = body;
      const response = await app.request(new Request(`${origin}${incoming.url}`, init));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(new Uint8Array(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) problem(400, 'invalid_request');
      else outgoing.destroy();
    }
  });
  server.maxConnections = 32;
  server.setTimeout(5000);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    address,
    role,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

// Node fetch normalizes some transport headers; use an actual HTTP request when
// testing the harness's Host/Origin guard rather than assuming fetch forwards them.
export function probeLocalRequest(url, headers) {
  const target = new URL(url);
  if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:') throw new Error('Loopback probe only');
  return new Promise((resolve, reject) => {
    const outgoing = request(target, { headers }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}
