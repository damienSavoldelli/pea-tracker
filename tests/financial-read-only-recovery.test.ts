import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FinancialAccessAuthenticator } from '../src/adapters/auth/financial-access';
import { AccessJwtVerifier } from '../src/adapters/auth/access-jwt';
import { createAccessFinancialWorker } from '../src/entrypoints/access-financial';
import { accessFixture, accessConfig } from './helpers/access-fixtures';
import { openingInput, portfolioAdmin, portfolioFixture } from './helpers/portfolio';

const origin = 'https://synthetic-read.example.invalid';
const approvalOrigin = 'https://synthetic-approval.example.invalid';
const browserAudience = 'b'.repeat(64);
const configuration = { ...accessConfig, browserAudience, internalSubject: 'synthetic-financial-owner',
  financialWritesEnabled: false, readOnlyMixedAudienceEnabled: true };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe('explicit read-only mixed-audience recovery', () => {
  it.each([[accessConfig.audience, browserAudience], [browserAudience, accessConfig.audience], [accessConfig.audience]])(
    'grants only reads to the expected owner with a permitted audience set %j', async (...aud) => {
      const auth = await accessFixture();
      const access = new FinancialAccessAuthenticator(configuration, { fetch: auth.keys });
      const request = auth.request(await auth.token({ aud }));
      const principal = await access.authenticateMcp(request);
      expect(principal.permissions).toEqual(['instruments:read', 'quotes:read', 'portfolio:read']);
      await expect(access.authenticateBrowser(request)).rejects.toMatchObject({ code: 'financial_writes_disabled' });
      const strict = new AccessJwtVerifier({ issuer: accessConfig.issuer, audience: accessConfig.audience }, { fetch: auth.keys }).verify(request);
      if (aud.length === 1) await expect(strict).resolves.toMatchObject({ sub: accessConfig.ownerSubject });
      else await expect(strict).rejects.toMatchObject({ status: 401, code: 'invalid_token' });
  });
  it.each([
    [], [browserAudience], ['c'.repeat(64)], [accessConfig.audience, 'c'.repeat(64)],
    [accessConfig.audience, browserAudience, 'c'.repeat(64)], [accessConfig.audience, accessConfig.audience],
    [accessConfig.audience, browserAudience, browserAudience],
  ])('rejects an absent, unrelated, duplicate or enlarged audience set %j', async (...aud) => {
    const auth = await accessFixture();
    const access = new FinancialAccessAuthenticator(configuration, { fetch: auth.keys });
    await expect(access.authenticateMcp(auth.request(await auth.token({ aud })))).rejects.toMatchObject({ status: 401 });
  });
  it('still rejects a missing/forged assertion, foreign owner, expired token and wrong issuer', async () => {
    const auth = await accessFixture();
    const access = new FinancialAccessAuthenticator(configuration, { fetch: auth.keys });
    await expect(access.authenticateMcp(auth.request())).rejects.toMatchObject({ status: 401 });
    await expect(access.authenticateMcp(auth.request('synthetic.forged.assertion'))).rejects.toMatchObject({ status: 401 });
    const aud = [accessConfig.audience, browserAudience];
    for (const [claims, status] of [
      [{ sub: 'synthetic-foreign-owner' }, 403], [{ exp: auth.issuedAt - 60 }, 401],
      [{ iss: 'https://other-team.cloudflareaccess.com' }, 401],
    ] as const) {
      await expect(access.authenticateMcp(auth.request(await auth.token({ aud, ...claims })))).rejects.toMatchObject({ status });
    }
  });
  it('is opt-in, rejects mixed tokens for writes, and cannot be enabled together with financial writes', async () => {
    const auth = await accessFixture();
    const mixed = auth.request(await auth.token({ aud: [accessConfig.audience, browserAudience] }));
    const { readOnlyMixedAudienceEnabled: _, ...defaultConfig } = configuration;
    await expect(new FinancialAccessAuthenticator(defaultConfig, { fetch: auth.keys }).authenticateMcp(mixed))
      .rejects.toMatchObject({ status: 401 });
    expect(() => new FinancialAccessAuthenticator({ ...configuration, financialWritesEnabled: true }, { fetch: auth.keys })).toThrow();
    const enabled = new FinancialAccessAuthenticator({ ...configuration, financialWritesEnabled: true,
      readOnlyMixedAudienceEnabled: false }, { fetch: auth.keys, permittedCompanionAudience: browserAudience });
    await expect(enabled.authenticateMcp(mixed)).rejects.toMatchObject({ status: 401 });
    await expect(enabled.authenticateBrowser(mixed)).rejects.toMatchObject({ status: 401 });
  });
  it('restores SDK ping and historical REST reads on local D1 without exposing financial writes or approval', async () => {
    const f = await portfolioFixture('d1'); cleanups.push(f.dispose);
    const opening = await f.service.append(portfolioAdmin, openingInput(), 0, 'synthetic-read-only-opening');
    const auth = await accessFixture();
    const app = createAccessFinancialWorker({ INSTRUMENTS_DB: f.local!.db,
      ACCESS_TEAM_DOMAIN: accessConfig.issuer, ACCESS_READ_AUD: accessConfig.audience,
      ACCESS_CONFIRMATION_AUD: browserAudience, ACCESS_OWNER_SUB: accessConfig.ownerSubject,
      ACCESS_READ_ENABLED: 'true', ACCESS_PORTFOLIO_READ_ENABLED: 'true',
      FINANCIAL_WRITES_ENABLED: 'false', MCP_READ_ONLY_MIXED_AUDIENCE_ENABLED: 'true',
      FINANCIAL_ORIGIN: origin, FINANCIAL_CONFIRMATION_ORIGIN: approvalOrigin,
      FINANCIAL_PORTFOLIO_ID: '10000000-0000-4000-8000-000000000001',
      FINANCIAL_OWNER_ID: portfolioAdmin.subject, FINANCIAL_OPENING_ID: opening.id,
      FINANCIAL_OPENING_REVISION: String(opening.revision),
    }, { fetch: auth.keys });
    const token = await auth.token({ aud: [accessConfig.audience, browserAudience] });
    const headers = { 'Cf-Access-Jwt-Assertion': token };
    const client = new Client({ name: 'synthetic-read-only-recovery', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      fetch: async (url, init) => {
        const request = new Request(url, init); request.headers.set('Cf-Access-Jwt-Assertion', token);
        return app.fetch(request);
      },
    })); cleanups.push(() => client.close());
    expect((await client.callTool({ name: 'ping', arguments: {} })).structuredContent).toMatchObject({ status: 'ok' });
    expect((await app.request(`${origin}/api/v1/portfolio/positions`, { headers })).status).toBe(200);
    const tools = (await client.listTools()).tools;
    expect(tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.some(tool => tool.name.startsWith('prepare_') || tool.name === 'confirm_financial_operation')).toBe(false);
    expect((await app.request(`${approvalOrigin}/financial-confirmation/10000000-0000-4000-8000-000000000099`, { headers })).status).toBe(403);
    const counts = await f.local!.db.prepare('SELECT COUNT(*) AS count FROM financial_approvals').first<{ count: number }>();
    expect(counts?.count).toBe(0);
  });
});
