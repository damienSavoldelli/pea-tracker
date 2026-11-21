import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import transactionApi from '../aidd_docs/api/transactions.openapi.json';
import { createApp } from '../src/app';
import { PortfolioService } from '../src/application/portfolio';
import { ValuationService } from '../src/application/valuation';
import { TransactionService } from '../src/application/transactions';
import { ApplicationError } from '../src/application/errors';
import type { Principal } from '../src/application/authorization';
import { MemoryPortfolioRepository } from '../src/adapters/memory/portfolio';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { MemoryTransactionRepository } from '../src/adapters/memory/transactions';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { firstId, secondId, openingInput, portfolioAdmin, provenance } from './helpers/portfolio';
import { quotationFixture, quotationCollector, observation } from './helpers/quotations';
import { valuationSelection } from './helpers/valuation';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse, validateOpenApi } from './helpers/openapi';
import { marketReference } from '../src/domain/performance';

const portfolioId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const reader: Principal = { subject: portfolioAdmin.subject, permissions: ['instruments:read', 'portfolio:read', 'quotes:read'] };
const effective_at = '2026-11-10T10:00:00.000Z';
const deposit = { type: 'deposit', amount: '10', currency: 'EUR', effective_at, provenance };
const buy = { ...deposit, type: 'buy', instrument_id: secondId, quantity: '3', amount: '30' };
const query = new URLSearchParams(valuationSelection).toString();
const cleanups: (() => Promise<unknown>)[] = [];
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ ...transactionApi, $id: 'urn:pea-tracker:projected-contract' });
function assertProjected(schema: 'CurrentPortfolio' | 'CurrentPortfolioValuation', value: unknown) {
  const validate = ajv.getSchema(`urn:pea-tracker:projected-contract#/components/schemas/${schema}`)!;
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
}
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture(kind: 'memory' | 'd1' = 'memory') {
  const f = await quotationFixture(kind);
  cleanups.push(f.dispose);
  f.clock.now = '2026-11-10T12:00:00.000Z';
  f.grants[0]!.instrument_ids.push(secondId);
  const openings = f.local ? new D1PortfolioRepository(f.local.db) : new MemoryPortfolioRepository();
  const journals = f.local ? new D1TransactionRepository(f.local.db) : new MemoryTransactionRepository();
  const historical = new PortfolioService(openings, f.instruments, () => f.clock.now);
  const input = openingInput();
  const opening = await historical.append(portfolioAdmin, { ...input, cash: { currency: 'EUR', amount: '100' },
    positions: [{ ...input.positions[0]!, quantity: '2' }] }, 0, 'synthetic-opening');
  const journal = new TransactionService(journals, openings, f.instruments, { portfolio_id: portfolioId,
    owner_subject: portfolioAdmin.subject, kind: 'real', opening_id: opening.id, opening_revision: opening.revision }, () => f.clock.now);
  const portfolio = new PortfolioService(openings, f.instruments, () => f.clock.now, undefined, journal);
  const valuation = new ValuationService(portfolio, f.service);
  const append = (input: unknown, version: number, key: string) => journal.append(portfolioAdmin, portfolioId, input, version, key);
  const seed = (ids = [firstId, secondId]) => f.service.ingest(quotationCollector,
    { observations: ids.map(instrument_id => observation({ instrument_id, price: '15' })) }, 'synthetic-quotes');
  return { ...f, openings, journals, historical, opening, journal, portfolio, valuation, append, seed };
}

for (const kind of ['memory', 'd1'] as const) describe(`${kind} projected portfolio reads`, () => {
  it('requires a selected market reference for monetary gain and treats dated flows, dividends and fees once', async () => {
    const f = await fixture(kind);
    f.context.expected_session_date = '2026-11-10';
    await f.service.ingest(quotationCollector, { observations: [firstId, secondId].map(instrument_id => observation({
      instrument_id, price: '15', market_timestamp: '2026-11-10T11:59:00.000Z', fetched_at: f.clock.now,
      session_date: '2026-11-10', provider_delay_seconds: 0 })) }, 'reference-quotes');
    const baseline = await f.valuation.current(reader, portfolioId, valuationSelection);
    expect(baseline.performance.economic_gain).toMatchObject({ status: 'unavailable', reason: 'initial_market_reference_missing' });
    expect(marketReference(baseline)).toMatchObject({ initial_value: { value: '130' }, initial_cash: '100' });
    const selected = new ValuationService(f.portfolio, f.service, baseline);
    baseline.portfolio_total!.exact = '999'; // The trusted composition clones its selected snapshot.
    f.clock.now = '2026-11-10T13:01:00.000Z';
    await f.append({ ...deposit, amount: '20', effective_at: '2026-11-10T12:30:00.000Z' }, 0, 'deposit');
    await f.append({ ...deposit, type: 'withdrawal', amount: '5', effective_at: '2026-11-10T12:35:00.000Z' }, 1, 'withdrawal');
    await f.append({ ...deposit, type: 'dividend', amount: '2', effective_at: '2026-11-10T12:40:00.000Z' }, 2, 'income');
    await f.append({ ...buy, quantity: '1', amount: '15', fees: '1', effective_at: '2026-11-10T12:45:00.000Z' }, 3, 'trade');
    const state = await f.portfolio.current(reader, portfolioId);
    const value = await selected.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolio', state); assertProjected('CurrentPortfolioValuation', value);
    expect(state).not.toHaveProperty('events');
    expect(state).toMatchObject({ opening_state: { cash: { amount: '100' } }, cash_flows: { deposits: '20', withdrawals: '5', net_contributions: '15' } });
    expect(value).toMatchObject({ portfolio_total: { exact: '146' }, performance: { reference: { initial_value: { value: '130' } },
      economic_gain: { value: '1' }, cash_flows: state.cash_flows, return_percentage: { status: 'unavailable' } } });
    expect(value.performance.warnings).toContain('freshness_stale');
    expect(await f.valuation.get(reader, valuationSelection)).toMatchObject({ portfolio_total: { exact: '130' } });
  }, 30000);

  it('combines exact realized/unrealized gains without adding cash, fees or dividends twice', async () => {
    const f = await fixture(kind);
    await f.append({ ...buy, fees: '1.25' }, 0, 'buy-fees');
    await f.append({ ...buy, type: 'sell', quantity: '1', amount: '20', fees: '0.25' }, 1, 'sale'); await f.seed();
    const state = await f.portfolio.current(reader, portfolioId);
    const value = await f.valuation.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolio', state); assertProjected('CurrentPortfolioValuation', value);
    expect(state.realized.total).toMatchObject({ exact: { numerator: '28', denominator: '3' } });
    expect(value).toMatchObject({ portfolio_total: { exact: '148.5' }, realized: state.realized,
      unrealized: { status: 'complete', total: { exact: { numerator: '4939', denominator: '150' } }, percentage_basis: 'remaining_securities_cost' } });
    expect(value.positions[1]!.unrealized.gain).toMatchObject({ exact: { numerator: '55', denominator: '6' } });
    expect(value.positions[1]!.warnings).toContain('quote_predates_portfolio_state');
    await f.append({ type: 'dividend', amount: '2.15', currency: 'EUR', effective_at, provenance }, 2, 'dividend');
    const income = await f.valuation.current(reader, portfolioId, valuationSelection);
    expect(income).toMatchObject({ portfolio_total: { exact: '150.65' }, realized: value.realized,
      unrealized: value.unrealized, dividends: { net_received: '2.15' }, history: { performance_available: false } });
  }, 30000);

  it('identifies recorded dividends in both current reads, with unchanged holdings and historical V1 valuation', async () => {
    const f = await fixture(kind); await f.seed();
    const before = await f.portfolio.current(reader, portfolioId);
    const payout = await f.append({ type: 'dividend', instrument_id: secondId, currency: 'EUR', amount: '2.15', effective_at, provenance }, 0, 'dividend');
    const state = await f.portfolio.current(reader, portfolioId);
    const value = await f.valuation.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolio', state); assertProjected('CurrentPortfolioValuation', value);
    expect(state).toMatchObject({ cash: { amount: '102.15' }, dividends: { received: '2.15', reversed: '0', net_received: '2.15' } });
    expect(state.positions.map(({ quantity, pru, remaining_cost }) => ({ quantity, pru, remaining_cost })))
      .toEqual(before.positions.map(({ quantity, pru, remaining_cost }) => ({ quantity, pru, remaining_cost })));
    expect(value).toMatchObject({ portfolio_total: { exact: '132.15' }, securities_total: { exact: '30' }, dividends: state.dividends });
    expect(await f.valuation.get(reader, valuationSelection)).toMatchObject({ portfolio_total: { exact: '130' }, cash: { declared: { amount: '100' } } });
    await f.append({ type: 'reversal', reversal_of: payout.event.id, effective_at, provenance, reason: 'Synthetic dividend correction' }, 1, 'undo-dividend');
    const reversed = await f.valuation.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolioValuation', reversed);
    expect(reversed).toMatchObject({ portfolio_total: { exact: '130' }, dividends: { received: '2.15', reversed: '2.15', net_received: '0' } });
  }, 30000);

  it('shows fee-inclusive purchase cost and net sale cash in both current reads without altering historical V1', async () => {
    const f = await fixture(kind);
    await f.append({ ...buy, fees: '1.25' }, 0, 'fees'); await f.seed();
    let state = await f.portfolio.current(reader, portfolioId);
    let value = await f.valuation.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolio', state); assertProjected('CurrentPortfolioValuation', value);
    expect(state).toMatchObject({ cash: { amount: '68.75' }, positions: [{}, { remaining_cost: { value: '31.25' },
      pru: { exact: { numerator: '125', denominator: '12' } }, cost_provenance: { opening_fees: 'not_applicable' } }] });
    expect(value).toMatchObject({ portfolio_total: { exact: '143.75' }, securities_total: { exact: '75' }, cost_basis_policy: { opening_fees: 'unknown' } });
    await f.append({ ...buy, type: 'sell', quantity: '1', amount: '20', fees: '0.25' }, 1, 'sale-fees');
    state = await f.portfolio.current(reader, portfolioId); value = await f.valuation.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolio', state); assertProjected('CurrentPortfolioValuation', value);
    expect(state).toMatchObject({ cash: { amount: '88.5' }, positions: [{}, { remaining_cost: { exact: { numerator: '125', denominator: '6' } },
      pru: { exact: { numerator: '125', denominator: '12' } } }] });
    expect(value.portfolio_total?.exact).toBe('148.5');
    expect(await f.valuation.get(reader, valuationSelection)).toMatchObject({ portfolio_total: { exact: '130' }, cash: { declared: { amount: '100' } } });
  }, 30000);

  it('isolates real and simulated portfolio costs while sharing opening and journal storage', async () => {
    const f = await fixture(kind);
    const simulatedJournal = new TransactionService(f.journals, f.openings, f.instruments, { portfolio_id: otherId,
      kind: 'simulated', owner_subject: portfolioAdmin.subject, opening_id: f.opening.id, opening_revision: 1 }, () => f.clock.now);
    const simulated = new PortfolioService(f.openings, f.instruments, () => f.clock.now, undefined, simulatedJournal);
    await f.append({ ...buy, instrument_id: firstId, quantity: '1', amount: '20' }, 0, 'same-key');
    await simulatedJournal.append(portfolioAdmin, otherId, { ...buy, instrument_id: firstId, quantity: '1', amount: '5' }, 0, 'same-key');
    expect(await f.portfolio.current(reader, portfolioId)).toMatchObject({ kind: 'real', positions: [{ remaining_cost: { value: '26.24' } }] });
    expect(await simulated.current(reader, otherId)).toMatchObject({ kind: 'simulated', positions: [{ remaining_cost: { value: '11.24' } }] });
    await f.append({ ...buy, type: 'sell', instrument_id: firstId, quantity: '1', amount: '10' }, 1, 'sale');
    await simulatedJournal.append(portfolioAdmin, otherId, { ...buy, type: 'sell', instrument_id: firstId, quantity: '1', amount: '10' }, 1, 'sale');
    expect((await f.portfolio.current(reader, portfolioId)).realized.total).toMatchObject({ exact: { numerator: '94', denominator: '75' } });
    expect((await simulated.current(reader, otherId)).realized.total).toMatchObject({ exact: { numerator: '469', denominator: '75' } });
    await expect(f.portfolio.current(reader, otherId)).rejects.toMatchObject({ status: 403 });
  }, 30000);

  it('projects the complete lifecycle once, including a new holding and reversal, without changing V1', async () => {
    const f = await fixture(kind);
    const before = await f.historical.get(reader);
    expect(await f.portfolio.current(reader, portfolioId)).toMatchObject({ view: 'current_projected', journal: { version: 0 }, cash: { amount: '100' } });
    await f.append(deposit, 0, 'deposit');
    const purchase = await f.append(buy, 1, 'buy');
    await f.append(buy, 1, 'buy');
    let state = await f.portfolio.current(reader, portfolioId);
    assertProjected('CurrentPortfolio', state);
    expect(state).toMatchObject({ portfolio_id: portfolioId, kind: 'real', journal: { version: 2 }, cash: { amount: '80' },
      opening_state: { id: before.id, revision: 1 }, holdings_basis: 'opening_state_and_transactions', cost_basis_status: 'computed' });
    expect(state.positions).toMatchObject([firstId, secondId].map((instrument_id, index) => ({ instrument_id,
      quantity: index ? '3' : '2', currency: 'EUR', pru: { status: 'available', value: index ? '10' : '3.12' } })));
    await f.append({ ...buy, type: 'sell', quantity: '1', amount: '12' }, 2, 'sale');
    await f.append({ ...deposit, type: 'withdrawal', amount: '5' }, 3, 'withdrawal');
    await f.append({ type: 'reversal', reversal_of: purchase.event.id, effective_at, reason: 'Synthetic correction', provenance }, 4, 'reverse-buy')
      .then(() => { throw new Error('Overselling reversal must fail'); }, error => expect(error.code).toBe('insufficient_quantity'));
    const extra = await f.append(deposit, 4, 'extra');
    await f.append({ type: 'reversal', reversal_of: extra.event.id, effective_at, reason: 'Synthetic correction', provenance }, 5, 'reverse-extra');
    state = await f.portfolio.current(reader, portfolioId);
    expect(state).toMatchObject({ journal: { version: 6 }, cash: { amount: '87' }, positions: [{ quantity: '2' }, { quantity: '2' }] });
    expect(await f.portfolio.get(reader)).toEqual(before);
    expect((await f.portfolio.positions(reader, {})).history.reason).toBe('opening_state_only');
  }, 30000);

  it('values projected quantities/cash through exact V1 arithmetic with honest partial coverage', async () => {
    const f = await fixture(kind);
    await f.append(buy, 0, 'buy');
    const partial = await f.valuation.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolioValuation', partial);
    expect(partial).toMatchObject({ portfolio_total: null,
      unrealized: { status: 'partial', total: null, percentage: { status: 'unavailable' } },
      known_assets_subtotal: { exact: '70' }, coverage: { valued: 0, not_valued: 2, total_complete: false } });
    await f.seed();
    const current = await f.valuation.current(reader, portfolioId, valuationSelection);
    assertProjected('CurrentPortfolioValuation', current);
    expect(current).toMatchObject({ view: 'current_projected', journal: { version: 1 }, cash: { amount: '70' },
      securities_total: { exact: '75' }, portfolio_total: { exact: '145' }, coverage: { total_complete: true },
      history: { performance_available: false, reason: 'performance_not_computed' } });
    expect(current.positions.every(position => !('declared_pru' in position) && position.pru.status === 'available')).toBe(true);
    expect(current.positions[0]!.warnings).toContain('quote_predates_portfolio_state');
    expect(await f.valuation.get(reader, valuationSelection)).toMatchObject({ portfolio_total: { exact: '130' }, cash: { declared: { amount: '100' } },
      positions: [{ quantity: '2', declared_pru: '3.12' }], calculation: { holdings_basis: 'opening_state_only' } });
  }, 30000);
});

it('pins the journal anchor even after a later correction of the historical opening', async () => {
  const f = await fixture();
  await f.append(deposit, 0, 'deposit');
  await f.historical.append(portfolioAdmin, { ...openingInput(), cash: { currency: 'EUR', amount: '999' },
    correction_reason: 'Synthetic later correction' }, 1, 'correction');
  expect((await f.portfolio.get(reader)).revision).toBe(2);
  expect(await f.portfolio.current(reader, portfolioId)).toMatchObject({ opening_state: { revision: 1 }, cash: { amount: '110' } });
});

it('keeps a newly acquired holding explicitly unvalued when only opening holdings have quotations', async () => {
  const f = await fixture();
  await f.append(buy, 0, 'buy'); await f.seed([firstId]);
  const value = await f.valuation.current(reader, portfolioId, valuationSelection);
  assertProjected('CurrentPortfolioValuation', value);
  expect(value).toMatchObject({ securities_subtotal: { exact: '30' }, known_assets_subtotal: { exact: '100' },
    securities_total: null, portfolio_total: null, coverage: { valued: 1, not_valued: 1 } });
  expect(value.positions[1]).toMatchObject({ instrument_id: secondId, market_value: null, reasons: ['quotation_missing'] });
});

it('captures positions and cash from the same journal version during a concurrent append', async () => {
  const f = await fixture();
  const portfolio = new PortfolioService(f.openings, f.instruments, () => f.clock.now, undefined, { get: async (principal, id) => {
    const captured = await f.journal.get(principal, id);
    await f.append(buy, 0, 'concurrent-buy');
    return captured;
  } });
  expect(await portfolio.current(reader, portfolioId)).toMatchObject({ journal: { version: 0 }, cash: { amount: '100' }, positions: [{ quantity: '2' }] });
  expect(await f.portfolio.current(reader, portfolioId)).toMatchObject({ journal: { version: 1 }, cash: { amount: '70' } });
});

it('keeps complete zero-title cash valuation and rejects a state ahead of the evaluation clock', async () => {
  const f = await fixture();
  await f.append({ ...buy, type: 'sell', instrument_id: firstId, quantity: '2', amount: '30' }, 0, 'sell-all');
  expect(await f.valuation.current(reader, portfolioId, valuationSelection)).toMatchObject({ positions: [], portfolio_total: { exact: '130' },
    securities_total: { exact: '0' }, coverage: { positions: 0, total_complete: true } });
  f.clock.now = '2026-11-10T09:59:59.000Z';
  await expect(f.portfolio.current(reader, portfolioId)).rejects.toMatchObject({ code: 'portfolio_state_after_evaluation' });
});

it('fails closed without a configured journal, wrong owner/portfolio or missing permission', async () => {
  const f = await fixture();
  await expect(f.historical.current(reader, portfolioId)).rejects.toMatchObject({ status: 503 });
  await expect(f.portfolio.current(reader, otherId)).rejects.toMatchObject({ status: 403 });
  await expect(f.portfolio.current({ ...reader, subject: 'another-owner' }, portfolioId)).rejects.toMatchObject({ status: 403 });
  await expect(f.portfolio.current(null, portfolioId)).rejects.toMatchObject({ status: 401 });
  await expect(f.valuation.current({ ...reader, permissions: ['portfolio:read'] }, portfolioId, valuationSelection)).rejects.toMatchObject({ status: 403 });
  await expect(f.valuation.current(reader, portfolioId, { ...valuationSelection, revision: 1 })).rejects.toMatchObject({ status: 400 });
});

it('exposes additive read-only REST/MCP views including fees/dividends and keeps V1 responses/schema unchanged', async () => {
  validateOpenApi(transactionApi);
  const f = await fixture();
  await f.append({ ...buy, fees: '1.25' }, 0, 'buy'); await f.seed();
  await f.append({ type: 'dividend', currency: 'EUR', amount: '2.15', effective_at, provenance }, 1, 'dividend');
  let principal: Principal | null = reader;
  const app = createApp({ portfolio: { service: f.portfolio, authenticate: () => principal },
    valuation: { service: f.valuation, authenticate: () => principal },
    currentPortfolio: { portfolio: f.portfolio, valuation: f.valuation, authenticate: () => principal },
    mcp: { service: f.instrumentService, portfolio: f.portfolio, valuation: f.valuation,
      currentPortfolio: f.portfolio, currentValuation: f.valuation, authenticate: async () => {
        if (!principal) throw new ApplicationError(401, 'unauthenticated'); return principal;
      }, challenge: () => 'Bearer' } });
  const server = await startOAuthHttpFixture(app); cleanups.push(() => server.close());
  const statePath = `/api/v1/portfolios/${portfolioId}/state`;
  const valuePath = `/api/v1/portfolios/${portfolioId}/valuation?${query}`;
  const get = (path: string, init?: RequestInit) => fetch(server.url + path, init);
  const client = new Client({ name: 'synthetic-projected-reader', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url)));
  try {
    expect((await client.listTools()).tools.every(tool => tool.annotations?.readOnlyHint === true && tool.annotations.destructiveHint === false)).toBe(true);
    for (const [name, path, args] of [
      ['get_current_portfolio', statePath, { portfolio_id: portfolioId }],
      ['get_current_portfolio_valuation', valuePath, { portfolio_id: portfolioId, ...valuationSelection }],
    ] as const) {
      const response = await get(path);
      expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
      assertProjected(name === 'get_current_portfolio' ? 'CurrentPortfolio' : 'CurrentPortfolioValuation', await response.clone().json());
      expect(await response.clone().json()).toMatchObject({ dividends: { received: '2.15', net_received: '2.15' } });
      expect((await client.callTool({ name, arguments: args })).structuredContent).toEqual(await response.json());
      expect((await client.listTools()).tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
    const old = await get(`/api/v1/portfolio/valuation?${query}`);
    await assertContractResponse('GET', '/api/v1/portfolio/valuation', old);
    expect((await client.callTool({ name: 'get_portfolio_valuation', arguments: valuationSelection })).structuredContent).toEqual(await old.json());
    const oldPositions = await get('/api/v1/portfolio/positions');
    await assertContractResponse('GET', '/api/v1/portfolio/positions', oldPositions);
    expect((await client.callTool({ name: 'get_positions', arguments: {} })).structuredContent).toEqual(await oldPositions.json());
    expect((await client.callTool({ name: 'get_current_portfolio', arguments: { portfolio_id: otherId } })).isError).toBe(true);
    expect((await client.callTool({ name: 'get_current_portfolio_valuation', arguments: { portfolio_id: portfolioId, ...valuationSelection, revision: 1 } })).isError).toBe(true);
    expect((await client.callTool({ name: 'get_current_portfolio_valuation', arguments: { portfolio_id: portfolioId, ...valuationSelection, initial_value: '1' } })).isError).toBe(true);
    for (const path of [statePath, valuePath]) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((await get(path, { method })).status).toBe(405);
      expect((await get(path, { headers: { Origin: 'https://untrusted.invalid' } })).status).toBe(403);
      expect((await get(path, { headers: { Accept: 'text/html' } })).status).toBe(406);
    }
    for (const path of [statePath + '?revision=1', valuePath + '&revision=1', valuePath + '&provider=synthetic']) expect((await get(path)).status).toBe(400);
    principal = { ...reader, subject: 'another-owner' }; expect((await get(statePath)).status).toBe(403);
    principal = { ...reader, permissions: ['instruments:read'] };
    expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('get_current_portfolio');
    expect((await get(statePath)).status).toBe(403);
    principal = null; expect((await get(statePath)).status).toBe(401);
  } finally { await client.close(); }
  expect((await createApp().request(statePath)).status).toBe(404);
});
