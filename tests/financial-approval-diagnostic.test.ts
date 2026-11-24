import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAccessFinancialWorker } from '../src/entrypoints/access-financial';
import { forwardFinancialApproval } from '../src/entrypoints/financial-approval-relay';
import { accessFixture, accessConfig } from './helpers/access-fixtures';

const origin = 'https://synthetic-read.example.invalid';
const approvalOrigin = 'https://synthetic-approval.example.invalid';
const path = '/financial-confirmation/auth-check';
const browserAudience = 'b'.repeat(64);

async function fixture(overrides = {}) {
  const auth = await accessFixture();
  const forbidden = () => { throw new Error('Diagnostic must not access D1'); };
  const prepare = vi.fn(forbidden); const batch = vi.fn(forbidden);
  const app = createAccessFinancialWorker({ INSTRUMENTS_DB: { prepare, batch,
    exec: vi.fn(forbidden), withSession: vi.fn(forbidden), dump: vi.fn(forbidden) },
    ACCESS_TEAM_DOMAIN: accessConfig.issuer, ACCESS_READ_AUD: accessConfig.audience,
    ACCESS_CONFIRMATION_AUD: browserAudience, ACCESS_OWNER_SUB: accessConfig.ownerSubject,
    ACCESS_READ_ENABLED: 'true', ACCESS_PORTFOLIO_READ_ENABLED: 'true',
    FINANCIAL_WRITES_ENABLED: 'false', MCP_READ_ONLY_MIXED_AUDIENCE_ENABLED: 'true',
    FINANCIAL_APPROVAL_DIAGNOSTICS_ENABLED: 'true', FINANCIAL_ORIGIN: origin,
    FINANCIAL_CONFIRMATION_ORIGIN: approvalOrigin,
    FINANCIAL_PORTFOLIO_ID: '10000000-0000-4000-8000-000000000001',
    FINANCIAL_OPENING_ID: '10000000-0000-4000-8000-000000000002', FINANCIAL_OPENING_REVISION: '1',
    ...overrides,
  }, { fetch: auth.keys, onDiagnostic: () => {} });
  const relay = (request: Request) => forwardFinancialApproval(request, approvalOrigin, {
    fetch: async input => app.fetch(new Request(input)),
  });
  const read = (token?: string, url = `${approvalOrigin}${path}`, extra: Record<string, string> = {}) => relay(new Request(url, {
    headers: { ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...extra },
  }));
  return { auth, app, relay, read, prepare, batch };
}

describe('read-only browser authentication diagnostic', () => {
  it('verifies the signed browser-only identity through the relay, without D1 or sensitive output', async () => {
    const f = await fixture(); const token = await f.auth.token({ aud: [browserAudience] });
    const response = await f.read(token);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', check: 'browser_identity', financial_writes_enabled: false });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.batch).not.toHaveBeenCalled();
    const approval = await f.read(token, `${approvalOrigin}/financial-confirmation/10000000-0000-4000-8000-000000000099`);
    expect(approval.status).toBe(403); expect(await approval.text()).toContain('financial_writes_disabled');
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.batch).not.toHaveBeenCalled();
  });
  it.each([
    [accessConfig.audience], [accessConfig.audience, browserAudience], [browserAudience, accessConfig.audience],
    [browserAudience, browserAudience], ['c'.repeat(64)],
  ])('rejects MCP, mixed, duplicate and unrelated audiences %j', async (...aud) => {
    const f = await fixture();
    expect((await f.read(await f.auth.token({ aud }))).status).toBe(401);
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.batch).not.toHaveBeenCalled();
  });
  it('rejects missing/forged tokens, another owner, expiry and wrong issuer', async () => {
    const f = await fixture();
    expect((await f.read()).status).toBe(401);
    expect((await f.read('synthetic.forged.assertion')).status).toBe(401);
    for (const [claims, status] of [
      [{ sub: 'synthetic-other-owner' }, 403], [{ exp: f.auth.issuedAt - 60 }, 401],
      [{ iss: 'https://other-team.cloudflareaccess.com' }, 401],
    ] as const) expect((await f.read(await f.auth.token({ aud: [browserAudience], ...claims }))).status).toBe(status);
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.batch).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'DELETE', 'HEAD'])('never forwards diagnostic method %s', async method => {
    const fetch = vi.fn();
    const response = await forwardFinancialApproval(new Request(`${approvalOrigin}${path}`, {
      method, headers: { 'Cf-Access-Jwt-Assertion': 'synthetic.assertion.only' },
    }), approvalOrigin, { fetch });
    expect(response.status).toBe(405); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects the MCP origin, queries, bearer and service credentials', async () => {
    const f = await fixture(); const token = await f.auth.token({ aud: [browserAudience] });
    expect((await f.app.request(`${origin}${path}`, { headers: { 'Cf-Access-Jwt-Assertion': token } })).status).toBe(403);
    expect((await f.read(token, `${approvalOrigin}${path}?utm_source=chatgpt.com`)).status).toBe(403);
    for (const extra of [{ Authorization: 'Bearer synthetic' }, { 'CF-Access-Client-Id': 'synthetic' }, { 'CF-Access-Client-Secret': 'synthetic' }])
      expect((await f.read(token, undefined, extra)).status).toBe(403);
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.batch).not.toHaveBeenCalled();
  });
  it.each([
    { FINANCIAL_APPROVAL_DIAGNOSTICS_ENABLED: undefined },
    { FINANCIAL_APPROVAL_DIAGNOSTICS_ENABLED: 'false' },
    { FINANCIAL_WRITES_ENABLED: 'true', MCP_READ_ONLY_MIXED_AUDIENCE_ENABLED: 'false' },
    { ACCESS_READ_ENABLED: 'false' },
  ])('fails closed when disabled or financial writes are enabled: %j', async overrides => {
    const f = await fixture(overrides); const token = await f.auth.token({ aud: [browserAudience] });
    expect((await f.read(token)).status).toBe(overrides.ACCESS_READ_ENABLED === 'false' ? 503 : 404);
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.batch).not.toHaveBeenCalled();
  });
  it('leaves the recovered MCP ping working and does not expose a diagnostic MCP tool', async () => {
    const f = await fixture(); const token = await f.auth.token({ aud: [accessConfig.audience, browserAudience] });
    const client = new Client({ name: 'synthetic-diagnostic-regression', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        fetch: async (url, init) => {
          const request = new Request(url, init); request.headers.set('Cf-Access-Jwt-Assertion', token);
          return f.app.fetch(request);
        },
      }));
      expect((await client.callTool({ name: 'ping', arguments: {} })).structuredContent).toMatchObject({ status: 'ok' });
      const tools = (await client.listTools()).tools;
      expect(tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
      expect(tools.some(tool => tool.name.includes('auth_check') || tool.name.includes('approve'))).toBe(false);
      expect(f.prepare).not.toHaveBeenCalled(); expect(f.batch).not.toHaveBeenCalled();
    } finally { await client.close(); }
  });
});
