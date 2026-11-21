import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import readApi from '../aidd_docs/api/portfolio-reads.openapi.json';
import transactionApi from '../aidd_docs/api/transactions.openapi.json';
import { validateOpenApi } from './helpers/openapi';
import { PortfolioReadService } from '../src/application/portfolio-reads';
import { PortfolioRegistryService } from '../src/application/portfolio-registry';
import { D1PortfolioRegistryRepository } from '../src/adapters/d1/portfolio-registry';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { D1OperationalOpeningRepository } from '../src/adapters/d1/operational-opening';
import { PortfolioService } from '../src/application/portfolio';
import { createAccessFinancialWorker } from '../src/entrypoints/access-financial';
import { operationalOpeningSchema } from '../src/domain/operational-opening';
import { accessFixture, accessConfig } from './helpers/access-fixtures';
import { createApp } from '../src/app';
import type { Principal } from '../src/application/authorization';
import type { RegisteredPortfolio } from '../src/domain/portfolio-registry';
import type { PerformanceReference } from '../src/domain/performance';
import { quotationFixture, quotationCollector, observation, selector } from './helpers/quotations';
import { portfolioAdmin, firstId, secondId, provenance } from './helpers/portfolio';

const at = '2026-11-21T12:00:00.000Z';
const reader: Principal = { subject: portfolioAdmin.subject, permissions: ['instruments:read', 'portfolio:read', 'quotes:read'] };
const otherReader: Principal = { ...reader, subject: 'synthetic-other-owner' };
const selection = { provider: selector.provider, price_kind: selector.price_kind, adjustment: selector.adjustment };
const query = new URLSearchParams(selection).toString();
// Materialize the existing financial schemas only in test memory; no duplicate public contract.
const contract = JSON.parse(JSON.stringify({ ...readApi, components: { ...readApi.components,
  schemas: { ...transactionApi.components.schemas, ...readApi.components.schemas } } }).replaceAll('transactions.openapi.json#', '#'));
const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
ajv.addSchema({ ...contract, $id: 'urn:pea-tracker:portfolio-reads' });
function assertResponse(schema: string, body: unknown) {
  const validate = ajv.getSchema(`urn:pea-tracker:portfolio-reads#/components/schemas/${schema}`)!;
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
}
const initial = (cash = '100', quantity?: string, instrument_id = firstId) => ({
  effective_at: '2026-11-20T12:00:00.000Z', cash: { currency: 'EUR', amount: cash },
  positions: quantity ? [{ instrument_id, quantity, declared_pru: '10', currency: 'EUR', provenance }] : [],
  provenance, correction_reason: null,
});

describe('owner-scoped multi-portfolio consultation', () => {
  let f: Awaited<ReturnType<typeof quotationFixture>>;
  let registry: D1PortfolioRegistryRepository;
  let reads: PortfolioReadService;
  let real: RegisteredPortfolio;
  let real2: RegisteredPortfolio;
  let simulation: RegisteredPortfolio;
  let empty: RegisteredPortfolio;
  let archived: RegisteredPortfolio;
  let foreign: RegisteredPortfolio;
  const own: RegisteredPortfolio[] = [];
  const references = new Map<string, PerformanceReference>();
  const clients: Client[] = [];
  function service(selected = references) {
    return new PortfolioReadService({ registry, instruments: f.instruments, transactions: new D1TransactionRepository(f.local!.db),
      quotations: f.service, references: selected, clock: () => at });
  }
  beforeAll(async () => {
    f = await quotationFixture('d1'); f.clock.now = at;
    registry = new D1PortfolioRegistryRepository(f.local!.db);
    const admin = new PortfolioRegistryService(registry, f.instruments, () => at);
    real = await admin.create(portfolioAdmin, { name: 'Synthetic real A', kind: 'real', opening: initial('100', '2') });
    real2 = await admin.create(portfolioAdmin, { name: 'Synthetic real B', kind: 'real', opening: initial('20', '1', secondId) });
    simulation = await admin.create(portfolioAdmin, { name: 'Synthetic simulated A', kind: 'simulated', opening: initial('50', '3') });
    empty = await admin.create(portfolioAdmin, { name: 'Synthetic empty simulation', kind: 'simulated', opening: initial('0') });
    const active = await admin.create(portfolioAdmin, { name: 'Synthetic archive', kind: 'real', opening: initial('30', '1') });
    archived = await admin.archive(portfolioAdmin, active.id, 1);
    foreign = await admin.create({ ...portfolioAdmin, subject: otherReader.subject }, { name: 'Synthetic other owner', kind: 'real', opening: initial('7') });
    own.push(real, real2, simulation, empty, archived);
    references.set(real.id, { source_type: 'broker_statement', portfolio_id: real.id, kind: real.kind,
      opening_state: { id: real.opening.id, revision: 1 }, journal: { version: 0 },
      evaluated_at: initial().effective_at, market_date: '2026-11-20', timestamp_precision: 'session_date',
      currency: 'EUR', securities_value: '20', cash_value: '100', total_value: '120',
      provenance: { source: 'Synthetic broker', reference: 'Synthetic reference', owner_confirmed: true } });
    reads = service();
    await f.service.ingest(quotationCollector, { observations: [observation({ price: '15', market_timestamp: '2026-11-21T11:59:00.000Z',
      fetched_at: at, session_date: '2026-11-21', provider_delay_seconds: null })] }, 'synthetic-multi-read-quotes');
  }, 30000);
  afterAll(async () => { for (const client of clients) await client.close(); await f?.dispose(); });

  it('lists only owned portfolios, including archives, with bounded continuation', async () => {
    const first = await reads.list(reader, { limit: 2 });
    const rest = await reads.list(reader, { after: first.page.next_after });
    expect([...first.data, ...rest.data].map(row => row.id)).toEqual(own.map(row => row.id).sort());
    expect(rest.page.next_after).toBeNull();
    expect((await reads.list(otherReader)).data).toEqual([foreign]);
    await expect(reads.list(reader, { owner_subject: otherReader.subject })).rejects.toMatchObject({ status: 400 });
  });
  it('validates the separate read contract against the installed official OpenAPI snapshot', () => {
    validateOpenApi(contract);
  });
  it('resolves multiple real/simulated openings and quantities without creating journals', async () => {
    for (const [row, cash, quantity] of [[real, '100', '2'], [real2, '20', '1'], [simulation, '50', '3']] as const) {
      const result = await reads.state(reader, row.id);
      expect(result).toMatchObject({ portfolio: row, read_only: true,
        state: { portfolio_id: row.id, kind: row.kind, cash: { amount: cash }, journal: { version: 0 }, opening_state: { id: row.opening.id } } });
      expect(result.state.positions[0]).toMatchObject({ quantity, pru: { status: 'available', value: '10' } });
    }
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_journals').first('n')).toBe(0);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_events').first('n')).toBe(0);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM financial_approvals').first('n')).toBe(0);
  });
  it('keeps an empty portfolio coherent, with unavailable performance rather than an invented reference', async () => {
    const result = await reads.valuation(reader, empty.id, selection);
    expect(result.valuation).toMatchObject({ portfolio_id: empty.id, kind: 'simulated', positions: [],
      cash: { amount: '0' }, portfolio_total: { exact: '0' },
      performance: { reference: null, economic_gain: { status: 'unavailable', reason: 'initial_market_reference_missing' },
        return_percentage: { status: 'unavailable' } } });
  });
  it('reads archived holdings and live stored-price estimates without reactivation or financial mutation', async () => {
    expect(await reads.get(reader, archived.id)).toMatchObject({ portfolio: archived, read_only: true });
    expect((await reads.valuation(reader, archived.id, selection)).valuation.portfolio_total?.exact).toBe('45');
    expect(await registry.get(reader.subject, archived.id)).toEqual(archived);
  });
  it('does not leak existence or data through foreign UUIDs and requires actual server permissions', async () => {
    for (const id of [foreign.id, crypto.randomUUID()]) {
      await expect(reads.get(reader, id)).rejects.toMatchObject({ status: 404, code: 'portfolio_not_found' });
      await expect(reads.state(reader, id)).rejects.toMatchObject({ status: 404, code: 'portfolio_not_found' });
      await expect(reads.valuation(reader, id, selection)).rejects.toMatchObject({ status: 404, code: 'portfolio_not_found' });
    }
    await expect(reads.state(otherReader, real.id)).rejects.toMatchObject({ status: 404 });
    await expect(reads.get(null, real.id)).rejects.toMatchObject({ status: 401 });
    await expect(reads.get({ ...reader, permissions: [] }, real.id)).rejects.toMatchObject({ status: 403 });
    await expect(reads.valuation({ ...reader, permissions: ['portfolio:read'] }, real.id, selection)).rejects.toMatchObject({ status: 403 });
    await expect(reads.get(reader, 'bad-id')).rejects.toMatchObject({ status: 400 });
  });
  it('shares prices but never performance references or holdings between portfolios', async () => {
    const valued = (await reads.valuation(reader, real.id, selection)).valuation;
    expect(valued.portfolio_total?.exact).toBe('130');
    expect(valued.performance.economic_gain).toMatchObject({ status: 'available', value: '10' });
    expect(valued.performance.return_percentage).toMatchObject({ status: 'available', method: 'modified_dietz' });
    const simulated = (await reads.valuation(reader, simulation.id, selection)).valuation;
    expect(simulated.portfolio_total?.exact).toBe('95');
    expect(simulated.performance.reference).toBeNull();
    expect(simulated.positions[0]?.quotation.quote?.id).toBe(valued.positions[0]?.quotation.quote?.id);
    const missing = (await reads.valuation(reader, real2.id, selection)).valuation;
    expect(missing.portfolio_total).toBeNull();
    expect(missing.coverage.total_complete).toBe(false);
    const incompatible = service(new Map([[simulation.id, references.get(real.id)!]]));
    await expect(incompatible.valuation(reader, simulation.id, selection)).rejects.toMatchObject({ code: 'performance_reference_mismatch' });
    await expect(reads.valuation(reader, simulation.id, { ...selection, reference: references.get(real.id) })).rejects.toMatchObject({ status: 400 });
  });
  it('clones trusted references and does not reuse a previous caller or portfolio selection', async () => {
    const source = structuredClone(references.get(real.id)!);
    const selected = service(new Map([[real.id, source]]));
    source.portfolio_id = foreign.id;
    expect((await selected.valuation(reader, real.id, selection)).valuation.performance.reference?.portfolio_id).toBe(real.id);
    expect((await reads.state(otherReader, foreign.id)).state.cash.amount).toBe('7');
    expect((await reads.state(reader, real.id)).state.cash.amount).toBe('100');
  });

  function app() {
    const authenticate = async (request: Request) => request.headers.get('X-Synthetic-Owner') === reader.subject ? reader
      : request.headers.get('X-Synthetic-Owner') === otherReader.subject ? otherReader : null;
    return createApp({ portfolioReads: { service: reads, authenticate }, mcp: { service: f.instrumentService,
      portfolioReads: reads, authenticate: async request => (await authenticate(request))!, challenge: () => 'Bearer', oauthScopes: [] } });
  }
  it('exposes GET-only REST list/details/state/valuation with owner isolation and bounded strict queries', async () => {
    const backend = app();
    const headers = { 'X-Synthetic-Owner': reader.subject };
    for (const [path, schema] of [['', 'PortfolioList'], [`/${real.id}`, 'PortfolioDetails'],
      [`/${simulation.id}/state`, 'PortfolioState'], [`/${real.id}/valuation?${query}`, 'PortfolioValuation']]) {
      const response = await backend.request(`/api/v2/portfolios${path}`, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json();
      expect(body).toMatchObject({ read_only: true });
      assertResponse(schema!, body);
    }
    expect((await backend.request(`/api/v2/portfolios/${archived.id}/state`, { headers })).status).toBe(200);
    for (const id of [foreign.id, crypto.randomUUID()]) {
      const response = await backend.request(`/api/v2/portfolios/${id}`, { headers });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'portfolio_not_found' });
    }
    expect((await backend.request(`/api/v2/portfolios/${real.id}`, { method: 'POST', headers })).status).toBe(405);
    expect((await backend.request('/api/v2/portfolios')).status).toBe(401);
    for (const suffix of ['?limit=101', '?owner_subject=other', '?limit=1&limit=2'])
      expect((await backend.request(`/api/v2/portfolios${suffix}`, { headers })).status).toBe(400);
    expect((await backend.request(`/api/v2/portfolios/${real.id}/valuation?${query}&reference=bad`, { headers })).status).toBe(400);
    expect((await backend.request(`/api/v2/portfolios/${real.id}`, { headers: { ...headers, Origin: 'https://foreign.example.invalid' } })).status).toBe(403);
    expect((await backend.request(`/api/v2/portfolios/${real.id}`, { headers: { ...headers, Accept: 'text/html' } })).status).toBe(406);
  });
  it('exposes exactly four new MCP reads and enforces cross-owner refusals through the official SDK', async () => {
    const backend = app();
    async function clientFor(principal: Principal) {
      const client = new Client({ name: 'synthetic-multi-portfolio-reader', version: '1' }); clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL('https://synthetic.example.invalid/mcp'), {
        fetch: async (url, init) => { const request = new Request(url, init); request.headers.set('X-Synthetic-Owner', principal.subject); return backend.fetch(request); },
      })); return client;
    }
    const client = await clientFor(reader);
    const tools = (await client.listTools()).tools;
    for (const name of ['list_portfolios', 'get_portfolio_details', 'get_portfolio_state', 'get_portfolio_market_value'])
      expect(tools.find(tool => tool.name === name)?.annotations?.readOnlyHint).toBe(true);
    expect(tools.every(tool => tool.annotations?.readOnlyHint)).toBe(true);
    expect((await client.callTool({ name: 'list_portfolios', arguments: {} })).structuredContent).toMatchObject({ data: expect.any(Array) });
    expect((await client.callTool({ name: 'get_portfolio_details', arguments: { portfolio_id: archived.id } })).structuredContent)
      .toMatchObject({ portfolio: { id: archived.id, status: 'archived' } });
    expect((await client.callTool({ name: 'get_portfolio_state', arguments: { portfolio_id: simulation.id } })).structuredContent)
      .toMatchObject({ state: { kind: 'simulated', cash: { amount: '50' } } });
    expect((await client.callTool({ name: 'get_portfolio_market_value', arguments: { portfolio_id: real.id, ...selection } })).structuredContent)
      .toMatchObject({ valuation: { portfolio_total: { exact: '130' } } });
    expect((await client.callTool({ name: 'get_portfolio_state', arguments: { portfolio_id: foreign.id } })).isError).toBe(true);
    const other = await clientFor(otherReader);
    expect((await other.callTool({ name: 'get_portfolio_state', arguments: { portfolio_id: real.id } })).isError).toBe(true);
    expect((await other.callTool({ name: 'get_portfolio_state', arguments: { portfolio_id: foreign.id } })).isError).not.toBe(true);
    expect((await client.callTool({ name: 'create_portfolio', arguments: {} })).isError).toBe(true);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_events').first('n')).toBe(0);
  });
  it('wires signed Worker reads while preserving the exact historical chain and fixed financial write target', async () => {
    const historical = await new PortfolioService(new D1PortfolioRepository(f.local!.db), f.instruments, () => at)
      .append(portfolioAdmin, { ...initial('40', '1'), effective_at: '2026-11-13T12:00:00.000Z' }, 0, 'synthetic-v1');
    const legacyId = crypto.randomUUID();
    const operationalId = crypto.randomUUID();
    const reference = operationalOpeningSchema.parse({ portfolio_id: legacyId, owner_subject: reader.subject,
      historical_opening_id: historical.id, historical_opening_revision: historical.revision,
      opening: { ...historical, id: operationalId, revision: 1, effective_at: initial().effective_at },
      cash_provenance: provenance, reason: 'Synthetic distinct operational opening' });
    await new D1OperationalOpeningRepository(f.local!.db, { portfolio_id: legacyId, owner_subject: reader.subject,
      id: operationalId, historical_opening_id: historical.id, historical_opening_revision: 1 }).initialize(reference);
    // Equivalent to the checked 0008 adoption, for data initialized after this test DB's migrations.
    await f.local!.db.prepare(`INSERT INTO portfolios(id,owner_subject,name,kind,status,version,opening_source,opening_id,opening_revision,created_at,updated_at)
      VALUES (?,?,'Synthetic legacy PEA','real','active',1,'operational',?,1,?,?)`).bind(legacyId, reader.subject, operationalId, at, at).run();
    const auth = await accessFixture();
    const backend = createAccessFinancialWorker({ INSTRUMENTS_DB: f.local!.db, ACCESS_TEAM_DOMAIN: accessConfig.issuer,
      ACCESS_READ_AUD: accessConfig.audience, ACCESS_OWNER_SUB: accessConfig.ownerSubject,
      ACCESS_READ_ENABLED: 'true', ACCESS_PORTFOLIO_READ_ENABLED: 'true', FINANCIAL_WRITES_ENABLED: 'true',
      ACCESS_CONFIRMATION_AUD: 'b'.repeat(64), FINANCIAL_ORIGIN: 'https://synthetic.example.invalid',
      FINANCIAL_PORTFOLIO_ID: legacyId, FINANCIAL_OWNER_ID: reader.subject,
      FINANCIAL_OPENING_ID: historical.id, FINANCIAL_OPENING_REVISION: '1', FINANCIAL_OPERATIONAL_OPENING_ID: operationalId,
    }, { fetch: auth.keys });
    const token = await auth.token();
    const headers = { 'Cf-Access-Jwt-Assertion': token };
    expect((await backend.request(`/api/v2/portfolios/${simulation.id}/state`, { headers })).status).toBe(200);
    const v2 = await backend.request(`/api/v2/portfolios/${legacyId}/state`, { headers });
    const v1 = await backend.request(`/api/v1/portfolios/${legacyId}/state`, { headers });
    expect(v2.status).toBe(200); expect(v1.status).toBe(200);
    const v2State = (await v2.json() as Awaited<ReturnType<PortfolioReadService['state']>>).state;
    const v1State = await v1.json() as Awaited<ReturnType<PortfolioService['current']>>;
    expect(v2State).toMatchObject({ portfolio_id: legacyId, opening_state: { id: operationalId }, cash: v1State.cash, positions: v1State.positions, journal: v1State.journal });
    const legacyOpening = await backend.request('/api/v1/portfolio/opening-state', { headers });
    expect(await legacyOpening.json()).toEqual(historical);
    expect((await backend.request(`/api/v2/portfolios/${real.id}/state`)).status).toBe(401);
    expect((await backend.request('/api/v2/portfolios', { headers: { 'Cf-Access-Jwt-Assertion': await auth.token({ sub: 'synthetic-wrong-subject' }) } })).status).toBe(403);
    expect((await backend.request(`/api/v2/portfolios/${foreign.id}/state`, { headers })).status).toBe(404);
    const client = new Client({ name: 'synthetic-signed-reader', version: '1' }); clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL('https://synthetic.example.invalid/mcp'), {
      fetch: async (url, init) => { const request = new Request(url, init); request.headers.set('Cf-Access-Jwt-Assertion', token); return backend.fetch(request); },
    }));
    const toolNames = (await client.listTools()).tools.map(tool => tool.name);
    expect(toolNames).toHaveLength(26);
    expect(toolNames).toEqual(expect.arrayContaining(['get_positions', 'get_opening_state', 'get_portfolio_valuation',
      'get_current_portfolio', 'get_current_portfolio_valuation', 'confirm_financial_operation', 'get_portfolio_state']));
    expect((await client.callTool({ name: 'get_current_portfolio', arguments: { portfolio_id: legacyId } })).isError).not.toBe(true);
    expect((await client.callTool({ name: 'prepare_cash_deposit', arguments: { portfolio_id: simulation.id, amount: '1',
      currency: 'EUR', effective_at: at, provenance } })).isError).toBe(true);
    expect((await client.callTool({ name: 'prepare_cash_deposit', arguments: { portfolio_id: real.id, amount: '1',
      currency: 'EUR', effective_at: at, provenance } })).isError).toBe(true);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM financial_approvals').first('n')).toBe(0);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_events').first('n')).toBe(0);
  });
});
