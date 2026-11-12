import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import accessCollectorWorker, { createAccessCollectorWorker } from '../src/entrypoints/access-collector';
import { collectorSubject } from '../src/adapters/auth/access-service-authenticator';
import { accessServiceFixture, serviceConfig } from './helpers/access-service-fixtures';
import { portfolioFixture, portfolioAdmin, firstId, secondId } from './helpers/portfolio';
import { collectorPythonAvailable, collectorProcess } from './helpers/collector-process.mjs';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse } from './helpers/openapi';
import { observation } from './helpers/quotations';
import { InstrumentService } from '../src/application/instruments';

/** Counts actual binding calls, not prepared statements inside one atomic batch. */
function measuredD1(db: D1Database) {
  const calls = { reads: 0, batches: 0, other: 0, bindings: [] as unknown[][] };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...values: unknown[]) => {
          calls.bindings.push(values);
          return wrap(target.bind(...values));
        };
        const method = Reflect.get(target, property);
        if (typeof method !== 'function') return method;
        return (...args: unknown[]) => {
          if (['all', 'first', 'raw'].includes(String(property))) calls.reads++;
          else calls.other++;
          return Reflect.apply(method, target, args);
        };
      },
    });
    originals.set(proxy, statement);
    return proxy;
  }
  const binding = new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') return (sql: string) => wrap(target.prepare(sql));
      if (property === 'batch') return (statements: D1PreparedStatement[]) => {
        calls.batches++;
        return target.batch(statements.map(statement => originals.get(statement) ?? statement));
      };
      const method = Reflect.get(target, property);
      return typeof method === 'function' ? (...args: unknown[]) => {
        calls.other++;
        return Reflect.apply(method, target, args);
      } : method;
    },
  });
  return { binding, calls };
}

describe('dedicated Access quote-ingestion Worker', () => {
  it('returns a generic unavailable response when required security or D1 configuration is absent', async () => {
    const emptyEnv = {} as Parameters<typeof accessCollectorWorker.fetch>[1];
    const response = await accessCollectorWorker.fetch(new Request('https://synthetic.invalid/api/v1/quotation-batches', { method: 'POST' }), emptyEnv);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      type: 'about:blank', title: 'Service Unavailable', status: 503, code: 'ingestion_unavailable',
    });
  });

  describe('synthetic machine ingestion with native local D1', () => {
    let f: Awaited<ReturnType<typeof portfolioFixture>>;
    let auth: Awaited<ReturnType<typeof accessServiceFixture>>;
    let process: Awaited<ReturnType<typeof collectorProcess>> | undefined;
    let server: Awaited<ReturnType<typeof startOAuthHttpFixture>> | undefined;
    let worker: ReturnType<typeof createAccessCollectorWorker>;
    let env: Parameters<typeof createAccessCollectorWorker>[0];

    beforeEach(async () => {
      process = undefined;
      server = undefined;
      f = await portfolioFixture('d1');
      auth = await accessServiceFixture();
      env = {
        INSTRUMENTS_DB: f.local!.db,
        ACCESS_TEAM_DOMAIN: serviceConfig.issuer,
        ACCESS_INGESTION_AUD: serviceConfig.audience,
        ACCESS_INGESTION_ENABLED: 'true',
        ACCESS_SERVICE_CLIENT_IDS: JSON.stringify(serviceConfig.serviceClientIds),
        COLLECTOR_INGESTION_GRANTS: JSON.stringify([{ provider: 'yahoo', instrument_ids: [firstId, secondId] }]),
      };
      worker = createAccessCollectorWorker(env, { fetch: auth.keys });
    }, 30000);

    afterEach(async () => {
      await server?.close();
      await f?.dispose();
      await process?.close();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it.each([
      { ACCESS_INGESTION_AUD: undefined },
      { ACCESS_TEAM_DOMAIN: undefined },
      { INSTRUMENTS_DB: undefined },
      { ACCESS_SERVICE_CLIENT_IDS: '[' },
      { COLLECTOR_INGESTION_GRANTS: '{' },
      { ACCESS_TEAM_DOMAIN: 'https://untrusted.example.invalid' },
      { ACCESS_INGESTION_AUD: 'invalid-audience' },
      { ACCESS_SERVICE_CLIENT_IDS: '[]' },
      { COLLECTOR_INGESTION_GRANTS: '[{}]' },
      { COLLECTOR_INGESTION_GRANTS: JSON.stringify([{ provider: 'yahoo', instrument_ids: [] }]) },
      { ACCESS_INGESTION_ENABLED: 'yes' },
    ])('fails closed for partial or invalid configuration %j', async patch => {
      const keys = vi.fn(auth.keys);
      vi.stubGlobal('fetch', keys);
      const broken = { ...env, ...patch } as typeof env;
      for (const path of ['/api/v1/quotation-batches', '/mcp', '/api/v1/health']) {
        const response = await accessCollectorWorker.fetch(new Request(`https://synthetic.invalid${path}`, {
          method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': await auth.token() }, body: '{}',
        }), broken);
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ code: 'ingestion_unavailable' });
      }
      expect(keys).not.toHaveBeenCalled();
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(0);
    });

    it('treats an empty grant list as deny-all without accessing D1 when ingestion is enabled', async () => {
      const measured = measuredD1(f.local!.db);
      const denyAll = createAccessCollectorWorker({ ...env, INSTRUMENTS_DB: measured.binding,
        COLLECTOR_INGESTION_GRANTS: '[]' }, { fetch: auth.keys });
      const response = await denyAll.fetch(new Request('https://synthetic.invalid/api/v1/quotation-batches', {
        method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': await auth.token(), 'Content-Type': 'application/json',
          'Idempotency-Key': 'synthetic-empty-grants' },
        body: JSON.stringify({ observations: [observation({ provider: 'yahoo', instrument_id: firstId })] }),
      }));

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'quotation_ingestion_not_allowed' });
      expect(measured.calls).toMatchObject({ reads: 0, batches: 0, other: 0 });
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(0);
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_batch_outcomes').first('n')).toBe(0);
    });

    it('uses the exported handler and reuses its JWKS cache only for the same environment', async () => {
      const keys = vi.fn(auth.keys);
      vi.stubGlobal('fetch', keys);
      const token = await auth.token();
      const request = () => new Request('https://synthetic.invalid/api/v1/quotation-batches', {
        method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json',
          'Idempotency-Key': 'synthetic-exported-handler' },
        body: JSON.stringify({ observations: [observation({ provider: 'yahoo' })] }),
      });
      const first = await accessCollectorWorker.fetch(request(), env);
      const replay = await accessCollectorWorker.fetch(request(), env);
      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(await first.json());
      expect(keys).toHaveBeenCalledTimes(1);
      const disabled = await accessCollectorWorker.fetch(request(), { ...env, ACCESS_INGESTION_ENABLED: 'false' });
      expect(disabled.status).toBe(503);
      const otherAudience = await accessCollectorWorker.fetch(request(), { ...env, ACCESS_INGESTION_AUD: 'c'.repeat(64) });
      expect(otherAudience.status).toBe(401);
      const otherIssuer = await accessCollectorWorker.fetch(request(), { ...env, ACCESS_TEAM_DOMAIN: 'https://other-synthetic.cloudflareaccess.com' });
      expect(otherIssuer.status).toBe(401);
    });

    it.each(['distinct', 'repeated'])('uses two real D1 binding calls for 50 %s instrument observations and replay', async kind => {
      let sequence = 2;
      const service = new InstrumentService(f.instruments, () => '2026-11-09T00:00:00.000Z',
        () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
      const ids = [firstId, secondId];
      if (kind === 'distinct') for (let i = 2; i < 50; i++) {
        const record = await service.create(portfolioAdmin, { name: `Synthetic load instrument ${i}`, kind: 'etf',
          quote_currency: 'EUR', price_unit: 'currency_unit' }, `synthetic-load-${i}`);
        ids.push(record.id);
      }
      const measured = measuredD1(f.local!.db);
      const grants = [];
      for (let i = 0; i < ids.length; i += 20) grants.push({ provider: 'yahoo', instrument_ids: ids.slice(i, i + 20) });
      const app = createAccessCollectorWorker({ ...env, INSTRUMENTS_DB: measured.binding,
        COLLECTOR_INGESTION_GRANTS: JSON.stringify(grants) }, { fetch: auth.keys });
      const token = await auth.token();
      const observations = Array.from({ length: 50 }, (_, i) => observation({ provider: 'yahoo',
        instrument_id: kind === 'distinct' ? ids[i]! : firstId,
        fetched_at: new Date(Date.parse('2026-11-09T10:01:00.000Z') + i * 1000).toISOString() }));
      const send = () => app.fetch(new Request('https://synthetic.invalid/api/v1/quotation-batches', {
        method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/json',
          'Idempotency-Key': 'synthetic-maximal-batch' }, body: JSON.stringify({ observations }),
      }));
      const first = await send();
      expect(first.status).toBe(201);
      expect(measured.calls).toMatchObject({ reads: 1, batches: 1, other: 0 });
      // The grouped SELECT is prepared/bound before the three write-batch statements.
      expect(measured.calls.bindings[0])
        .toEqual(kind === 'distinct' ? ids : [firstId]);
      const replay = await send();
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(await first.json());
      expect(measured.calls).toMatchObject({ reads: 2, batches: 2, other: 0 });
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(50);
    });

    it.skipIf(!collectorPythonAvailable)('accepts the existing Python client, persists quotes, and replays the same batch idempotently', async () => {
      process = await collectorProcess();
      const credentials = { clientId: serviceConfig.serviceClientIds[0]!, clientSecret: 'synthetic-service-secret-fixture' };
      server = await startOAuthHttpFixture({ request: async (request: Request) => {
        const path = new URL(request.url).pathname;
        if (path !== '/api/v1/quotation-batches') return worker.fetch(request);
        if (request.headers.get('CF-Access-Client-Id') !== credentials.clientId ||
            request.headers.get('CF-Access-Client-Secret') !== credentials.clientSecret) {
          return Response.json({ error: 'synthetic_edge_denied' }, { status: 401 });
        }
        const headers = new Headers(request.headers);
        headers.delete('Cf-Access-Jwt-Assertion');
        headers.delete('CF-Access-Client-Id');
        headers.delete('CF-Access-Client-Secret');
        headers.set('Cf-Access-Jwt-Assertion', await auth.token());
        const response = await worker.fetch(new Request(request, { headers }));
        await assertContractResponse(request.method, path, response);
        return response;
      } });
      const first = await process.executeAccess(credentials, server.url, 'synthetic-access-worker-cycle');
      const replay = await process.executeAccess(credentials, server.url, 'synthetic-access-worker-cycle');
      expect(first.code).toBe(0);
      expect(replay.code).toBe(0);
      expect(first.stderr).toBe('');
      expect(first.stdout).not.toContain(credentials.clientSecret);
      expect(first.stdout).not.toContain(credentials.clientId);
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations WHERE outcome = ?').bind('success').first('n')).toBe(2);
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_batch_outcomes WHERE subject = ?').bind(collectorSubject).first('n')).toBe(1);
    });

    it('rejects missing, owner, wrong-audience, and unknown machine identities without writing', async () => {
      const missing = await worker.fetch(new Request('https://synthetic.invalid/api/v1/quotation-batches', { method: 'POST' }));
      expect(missing.status).toBe(401);
      const tokens = [
        await auth.token({ aud: 'a'.repeat(64) }),
        await auth.token({ common_name: 'synthetic-unknown.access' }),
        await auth.token({ sub: 'synthetic-human-owner' }),
      ];
      for (const assertion of tokens) {
        const response = await worker.fetch(new Request('https://synthetic.invalid/api/v1/quotation-batches', {
          method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': assertion, 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
        }));
        expect([401, 403]).toContain(response.status);
      }
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(0);
    });

    it('exposes no MCP, diagnostic, financial-read, or administrative route', async () => {
      const assertion = await auth.token();
      for (const path of ['/mcp', '/api/v1/health', '/api/v1/quotation-status', '/api/v1/quotations',
        '/api/v1/portfolio/positions', '/api/v1/portfolio/valuation', '/api/v1/instruments']) {
        const response = await worker.fetch(new Request(`https://synthetic.invalid${path}`, {
          headers: { 'Cf-Access-Jwt-Assertion': assertion },
        }));
        expect(response.status).toBe(404);
      }
      const wrongMethod = await worker.fetch(new Request('https://synthetic.invalid/api/v1/quotation-batches', {
        method: 'GET', headers: { 'Cf-Access-Jwt-Assertion': assertion },
      }));
      expect(wrongMethod.status).toBe(405);
    });

    it('does not access JWKS or ingest when the machine grant is disabled', async () => {
      const disabledEnv = { ...env, ACCESS_INGESTION_ENABLED: 'false' };
      const keys = vi.fn(auth.keys);
      const disabled = createAccessCollectorWorker(disabledEnv, { fetch: keys });
      const response = await disabled.fetch(new Request('https://synthetic.invalid/api/v1/quotation-batches', {
        method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': await auth.token() }, body: '{}',
      }));
      expect(response.status).toBe(503);
      expect(keys).not.toHaveBeenCalled();
      expect(await f.local!.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(0);
    });
  });
});
