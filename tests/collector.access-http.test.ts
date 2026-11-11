import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccessCollectorApp } from '../src/collector-app';
import { AccessServiceAuthenticator, collectorSubject } from '../src/adapters/auth/access-service-authenticator';
import { QuotationService } from '../src/application/quotations';
import { accessServiceFixture, serviceConfig } from './helpers/access-service-fixtures';
import { quotationFixture, observation, selector } from './helpers/quotations';
import { firstId, secondId } from './helpers/portfolio';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse } from './helpers/openapi';
import { collectorPythonAvailable, collectorProcess } from './helpers/collector-process.mjs';

const credentials = { clientId: serviceConfig.serviceClientIds[0]!, clientSecret: 'synthetic-service-secret-fixture' };
const reader = { subject: 'synthetic-reader', permissions: ['quotes:read'] as const };

for (const kind of ['memory', 'd1'] as const) describe.skipIf(!collectorPythonAvailable)(`${kind} Python Access credentials to signed machine ingestion`, () => {
  let f: Awaited<ReturnType<typeof quotationFixture>>;
  let auth: Awaited<ReturnType<typeof accessServiceFixture>>;
  let server: Awaited<ReturnType<typeof startOAuthHttpFixture>>;
  let process: Awaited<ReturnType<typeof collectorProcess>>;
  let service: QuotationService;
  let app: ReturnType<typeof createAccessCollectorApp>;
  let edgeEnabled: boolean;

  beforeEach(async () => {
    f = await quotationFixture(kind); auth = await accessServiceFixture(); process = await collectorProcess(); edgeEnabled = true;
    service = new QuotationService(f.repository, f.instruments, [{ subject: collectorSubject, provider: 'yahoo', instrument_ids: [firstId, secondId] }]);
    app = createAccessCollectorApp(auth.authenticator, service);
    // Test-only edge simulation. It proves our header/assertion contract, not
    // Cloudflare credential validation or hosted policy/revocation behavior.
    server = await startOAuthHttpFixture({ request: async (request: Request) => {
      if (new URL(request.url).pathname !== '/api/v1/quotation-batches') return app.request(request);
      if (!edgeEnabled || request.headers.get('CF-Access-Client-Id') !== credentials.clientId || request.headers.get('CF-Access-Client-Secret') !== credentials.clientSecret) {
        return Response.json({ error: 'synthetic_edge_denied' }, { status: 401 });
      }
      const headers = new Headers(request.headers);
      headers.delete('Cf-Access-Jwt-Assertion'); headers.delete('CF-Access-Client-Id'); headers.delete('CF-Access-Client-Secret');
      headers.set('Cf-Access-Jwt-Assertion', await auth.token());
      const response = await app.request(new Request(request, { headers }));
      await assertContractResponse(request.method, '/api/v1/quotation-batches', response);
      return response;
    } });
  }, 30000);
  afterEach(async () => { await server?.close(); await f?.dispose(); await process?.close(); });

  it('runs real Python header delivery/replay through the service policy and native persistence', async () => {
    const first = await process.executeAccess(credentials, server.url);
    expect(first.code).toBe(0); expect(first.stderr).toBe('');
    const original = await service.status(reader, { ...selector, provider: 'yahoo' });
    expect(original.quote).toMatchObject({ price: '12.34', source_price: '12.3400', provider: 'yahoo' });
    expect((await process.executeAccess(credentials, server.url)).code).toBe(0);
    expect((await service.status(reader, { ...selector, provider: 'yahoo' })).quote).toEqual(original.quote);
    expect(first.stdout).not.toContain(credentials.clientSecret); expect(first.stdout).not.toContain(credentials.clientId);
    if (f.local) expect(await f.local.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(2);
  });

  it('denies bad/disabled credentials, bearer-only attempts and forwarded-header forgery without writes', async () => {
    expect((await process.executeAccess({ ...credentials, clientSecret: 'synthetic-wrong-service-secret' }, server.url)).code).toBe(1);
    expect((await process.execute(await auth.token(), server.url)).code).toBe(1);
    edgeEnabled = false;
    expect((await process.executeAccess(credentials, server.url)).code).toBe(1);
    const direct = await app.request('/api/v1/quotation-batches', { method: 'POST', headers: {
      'CF-Access-Client-Id': credentials.clientId, 'CF-Access-Client-Secret': credentials.clientSecret,
    } });
    expect(direct.status).toBe(401); expect(direct.headers.get('WWW-Authenticate')).toBe('CF-Access-Service-Token');
    expect((await service.status(reader, { ...selector, provider: 'yahoo' })).quote).toBeNull();
  });

  it('mounts no MCP, diagnostics, reads or administrative route even with a valid signed assertion', async () => {
    const assertion = await auth.token();
    for (const path of ['/mcp', '/api/v1/health', '/api/v1/quotation-status', '/api/v1/quotations', '/api/v1/portfolio/positions', '/api/v1/instruments']) {
      for (const method of ['GET', 'POST']) expect((await app.request(path, { method, headers: { 'Cf-Access-Jwt-Assertion': assertion } })).status).toBe(404);
    }
    const wrongMethod = await app.request('/api/v1/quotation-batches', { headers: { 'Cf-Access-Jwt-Assertion': assertion } });
    expect(wrongMethod.status).toBe(405);
  });

  it('enforces provider/instrument grants and kill switch before persistence with sanitized errors', async () => {
    const send = async (body: unknown) => app.request('/api/v1/quotation-batches', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'Idempotency-Key': 'synthetic-access-grants', 'Cf-Access-Jwt-Assertion': await auth.token(),
    }, body: JSON.stringify(body) });
    for (const patch of [{ provider: 'unapproved' }, { instrument_id: '00000000-0000-4000-8000-000000000099' }]) {
      const response = await send({ observations: [observation({ provider: 'yahoo', ...patch })] });
      expect(response.status).toBe(403); await assertContractResponse('POST', '/quotation-batches', response);
    }
    app = createAccessCollectorApp(new AccessServiceAuthenticator({ ...serviceConfig, enabled: false }, { fetch: auth.keys }), service);
    const disabled = await send({ observations: [observation({ provider: 'yahoo' })] });
    expect(disabled.status).toBe(503); expect(await disabled.text()).not.toContain(credentials.clientSecret);
    expect((await service.status(reader, { ...selector, provider: 'yahoo' })).quote).toBeNull();
  });
});
