import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAccessFinancialWorker } from '../src/entrypoints/access-financial';
import { PortfolioRegistryService } from '../src/application/portfolio-registry';
import { PortfolioService } from '../src/application/portfolio';
import type { PortfolioFinancialService } from '../src/application/portfolio-financial';
import { D1PortfolioRegistryRepository } from '../src/adapters/d1/portfolio-registry';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { accessFixture, accessConfig } from './helpers/access-fixtures';
import { portfolioFixture, portfolioAdmin, provenance, firstId } from './helpers/portfolio';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

it.each([false, true])('official SDK and signed Worker preserve isolated V2 circuits with separate approval origin=%s', async separateApproval => {
  const f = await portfolioFixture('d1'); cleanups.push(f.dispose);
  const at = '2026-11-21T12:00:00.000Z';
  const origin = 'https://synthetic.example.invalid';
  const approvalOrigin = separateApproval ? 'https://synthetic-approval.example.invalid' : origin;
  const initial = { effective_at: '2026-11-20T12:00:00.000Z', positions: [{ instrument_id: firstId, quantity: '2', declared_pru: '10', currency: 'EUR', provenance }],
    cash: { currency: 'EUR', amount: '100' }, provenance, correction_reason: null };
  const historical = await new PortfolioService(new D1PortfolioRepository(f.local!.db), f.instruments, () => at)
    .append(portfolioAdmin, { ...initial, effective_at: '2026-11-13T12:00:00.000Z' }, 0, 'synthetic-historical');
  const legacyId = crypto.randomUUID();
  await f.local!.db.prepare(`INSERT INTO transaction_journals(portfolio_id,kind,owner_subject,opening_id,opening_revision,version)
    VALUES (?,'real',?,?,1,0)`).bind(legacyId, portfolioAdmin.subject, historical.id).run();
  await f.local!.db.prepare(`INSERT INTO portfolios(id,owner_subject,name,kind,status,version,opening_source,opening_id,opening_revision,created_at,updated_at)
    VALUES (?,?,'Synthetic legacy PEA','real','active',1,'historical',?,1,?,?)`).bind(legacyId, portfolioAdmin.subject, historical.id, at, at).run();
  const registry = new PortfolioRegistryService(new D1PortfolioRegistryRepository(f.local!.db), f.instruments, () => at);
  const rows = [];
  for (const kind of ['real', 'real', 'simulated', 'simulated'] as const)
    rows.push(await registry.create(portfolioAdmin, { name: `Synthetic ${kind} target`, kind, opening: initial }));
  const auth = await accessFixture();
  const environment = { INSTRUMENTS_DB: f.local!.db, ACCESS_TEAM_DOMAIN: accessConfig.issuer, ACCESS_READ_AUD: accessConfig.audience,
    ACCESS_OWNER_SUB: accessConfig.ownerSubject, ACCESS_READ_ENABLED: 'true', ACCESS_PORTFOLIO_READ_ENABLED: 'true',
    FINANCIAL_WRITES_ENABLED: 'true', ACCESS_CONFIRMATION_AUD: 'b'.repeat(64), FINANCIAL_ORIGIN: origin,
    ...(separateApproval ? { FINANCIAL_CONFIRMATION_ORIGIN: approvalOrigin, MCP_KNOWN_AUDIENCE_PAIR_ENABLED: 'true' } : {}),
    FINANCIAL_PORTFOLIO_ID: legacyId, FINANCIAL_OWNER_ID: portfolioAdmin.subject, FINANCIAL_OPENING_ID: historical.id, FINANCIAL_OPENING_REVISION: '1' };
  const backend = createAccessFinancialWorker(environment, { fetch: auth.keys });
  const token = await auth.token(separateApproval ? { aud: [accessConfig.audience, environment.ACCESS_CONFIRMATION_AUD] } : {}); const browserToken = await auth.token({ aud: [environment.ACCESS_CONFIRMATION_AUD] });
  const client = new Client({ name: 'synthetic-portfolio-writer', version: '1' }); cleanups.push(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    fetch: async (url, init) => { const request = new Request(url, init); request.headers.set('Cf-Access-Jwt-Assertion', token); return backend.fetch(request); },
  }));
  const tools = (await client.listTools()).tools;
  expect(tools).toHaveLength(26);
  expect(tools.map(tool => tool.name)).not.toContain('create_portfolio');
  expect(tools.map(tool => tool.name)).not.toContain('approve_financial_operation');
  expect(tools.map(tool => tool.name)).not.toContain('ingest_quotations');
  const input = { type: 'buy', instrument_id: firstId, amount: '20', fees: '1', quantity: '1', currency: 'EUR', effective_at: at, provenance };
  const journal = new D1TransactionRepository(f.local!.db);
  for (const row of rows) {
    const prepared = await client.callTool({ name: `prepare_${row.kind}_portfolio_operation`, arguments: { portfolio_id: row.id, input } });
    expect(prepared.isError).not.toBe(true);
    const p = prepared.structuredContent as unknown as Awaited<ReturnType<PortfolioFinancialService['prepare']>>;
    expect((await journal.get(row.id)).events).toEqual([]);
    const command = { portfolio_id: row.id, operation_id: p.operation_id, digest: p.proposal.digest };
    if (row.kind === 'real') {
      expect((await client.callTool({ name: 'confirm_real_portfolio_operation', arguments: command })).isError).toBe(true);
      expect((await backend.request(p.confirmation_url!, { headers: { 'Cf-Access-Jwt-Assertion': token } })).status).toBe(401);
      expect(new URL(p.confirmation_url!).origin).toBe(approvalOrigin);
      const page = await backend.request(p.confirmation_url!, { headers: { 'Cf-Access-Jwt-Assertion': browserToken } });
      expect(page.status).toBe(200);
      const html = await page.text(); expect(html).toContain(row.id); expect(html).toContain(row.name); expect(html).toContain('Réel');
      const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;
      const approved = await backend.request(p.confirmation_url!, { method: 'POST', headers: { Origin: approvalOrigin,
        'Cf-Access-Jwt-Assertion': browserToken, Cookie: page.headers.get('Set-Cookie')!.split(';')[0]!,
        'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf }) });
      expect(approved.status).toBe(200);
    } else {
      expect(p.confirmation_url).toBeNull();
      expect((await backend.request(`${approvalOrigin}/financial-confirmation/${p.operation_id}`, { headers: { 'Cf-Access-Jwt-Assertion': browserToken } })).status).toBe(403);
    }
    const confirmed = await client.callTool({ name: `confirm_${row.kind}_portfolio_operation`, arguments: command });
    expect(confirmed.isError).not.toBe(true);
    expect(confirmed.structuredContent).toMatchObject({ balances: { portfolio_id: row.id, kind: row.kind, cash: { amount: '79' } } });
    expect((await client.callTool({ name: `confirm_${row.kind}_portfolio_operation`, arguments: command })).structuredContent).toEqual(confirmed.structuredContent);
    expect((await client.callTool({ name: 'get_portfolio_state', arguments: { portfolio_id: row.id } })).structuredContent)
      .toMatchObject({ state: { positions: [{ quantity: '3', remaining_cost: { value: '41' } }] } });
    expect((await client.callTool({ name: 'prepare_recorded_buy', arguments: { portfolio_id: row.id,
      instrument_id: firstId, amount: '1', quantity: '1', currency: 'EUR', effective_at: at, provenance } })).isError).toBe(true);
  }
  expect((await journal.get(legacyId)).events).toEqual([]);
  const oldOpening = await backend.request('/api/v1/portfolio/opening-state', { headers: { 'Cf-Access-Jwt-Assertion': token } });
  expect(await oldOpening.json()).toEqual(historical);
  const pending = await client.callTool({ name: 'prepare_simulated_portfolio_operation', arguments: { portfolio_id: rows[2]!.id,
    input: { type: 'deposit', amount: '1', currency: 'EUR', effective_at: at, provenance } } });
  const p = pending.structuredContent as unknown as Awaited<ReturnType<PortfolioFinancialService['prepare']>>;
  await registry.archive(portfolioAdmin, rows[2]!.id, 1);
  expect((await client.callTool({ name: 'confirm_simulated_portfolio_operation', arguments: { portfolio_id: rows[2]!.id,
    operation_id: p.operation_id, digest: p.proposal.digest } })).isError).toBe(true);
  expect((await journal.get(rows[2]!.id)).events).toHaveLength(1);
  const disabled = createAccessFinancialWorker({ ...environment, FINANCIAL_WRITES_ENABLED: 'false' }, { fetch: auth.keys });
  const readClient = new Client({ name: 'synthetic-read-only', version: '1' }); cleanups.push(() => readClient.close());
  await readClient.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    fetch: async (url, init) => { const request = new Request(url, init); request.headers.set('Cf-Access-Jwt-Assertion', token); return disabled.fetch(request); },
  }));
  expect((await readClient.listTools()).tools.every(tool => tool.annotations?.readOnlyHint)).toBe(true);
}, 30000);
