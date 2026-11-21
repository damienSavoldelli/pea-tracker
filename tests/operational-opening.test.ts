import { afterEach, describe, expect, it } from 'vitest';
import { migrationRejectsNonemptyJournal, privateOperationalReference } from './helpers/operational-migration.mjs';
import { initialJournalBalances } from '../src/domain/transactions';
import { projectFinancialState } from '../src/domain/cost-basis';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import api from '../aidd_docs/api/transactions.openapi.json';
import { PortfolioService } from '../src/application/portfolio';
import { TransactionService } from '../src/application/transactions';
import { InstrumentService } from '../src/application/instruments';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { D1OperationalOpeningRepository } from '../src/adapters/d1/operational-opening';
import { operationalOpeningSchema } from '../src/domain/operational-opening';
import { FinancialMcpService } from '../src/application/financial-mcp';
import { MemoryFinancialApprovalRepository } from '../src/adapters/memory/financial-approvals';
import { createAccessFinancialWorker } from '../src/entrypoints/access-financial';
import { portfolioFixture, openingInput, portfolioAdmin, portfolioReader, firstId, provenance } from './helpers/portfolio';
import { accessFixture, accessConfig } from './helpers/access-fixtures';

const portfolioId = '10000000-0000-4000-8000-000000000001';
const operationalId = '20000000-0000-4000-8000-000000000001';
const now = () => '2026-11-21T12:00:00.000Z';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture() {
  const f = await portfolioFixture('d1'); cleanups.push(f.dispose);
  const historical = await f.service.append(portfolioAdmin, openingInput(), 0, 'synthetic-opening');
  const catalogue = new InstrumentService(f.instruments, now);
  const instruments = [await f.instruments.get(firstId)];
  for (let i = 1; i < 20; i++) instruments.push(await catalogue.create(portfolioAdmin,
    { name: `Synthetic operational holding ${i}`, kind: 'etf', quote_currency: 'EUR', price_unit: 'currency_unit' }, `synthetic-${i}`));
  const reference = operationalOpeningSchema.parse({ portfolio_id: portfolioId, owner_subject: portfolioAdmin.subject,
    historical_opening_id: historical.id, historical_opening_revision: historical.revision,
    opening: { ...historical, id: operationalId, revision: 1, effective_at: '2026-11-20T22:59:59.999Z', recorded_at: now(),
      positions: instruments.map(instrument => ({ instrument_id: instrument!.id, quantity: '2', declared_pru: '7.125', currency: 'EUR', provenance })),
      cash: { currency: 'EUR', amount: '123.45' }, correction_reason: null },
    cash_provenance: { source: 'Synthetic independently verified cash statement', reference: null }, reason: 'Synthetic explicit restart, no reconstructed trades' });
  const repository = new D1OperationalOpeningRepository(f.local!.db, { portfolio_id: portfolioId, owner_subject: portfolioAdmin.subject,
    id: operationalId, historical_opening_id: historical.id, historical_opening_revision: historical.revision });
  const journals = new D1TransactionRepository(f.local!.db);
  const journal = new TransactionService(journals, { get: async () => (await repository.get())?.opening ?? null }, f.instruments,
    { portfolio_id: portfolioId, kind: 'real', owner_subject: portfolioAdmin.subject, opening_id: operationalId, opening_revision: 1 }, now);
  const portfolio = new PortfolioService(f.repository, f.instruments, now, undefined, journal, repository);
  return { ...f, historicalRepository: f.repository, historical, reference, repository, journal, portfolio, journals };
}

describe('explicit real portfolio operational start', () => {
  it('keeps historical V1 unchanged and projects exactly 20 new declarations with distinct cash provenance', async () => {
    const f = await fixture();
    await f.repository.initialize(f.reference);
    expect(await f.repository.get()).toEqual(f.reference);
    expect(await f.service.get(portfolioReader)).toEqual(f.historical);
    const current = await f.portfolio.current(portfolioReader, portfolioId);
    expect(current.positions).toHaveLength(20);
    expect(current.positions.every(position => position.quantity === '2' && position.pru.status === 'available' && position.pru.value === '7.125')).toBe(true);
    expect(current.cash.amount).toBe('123.45');
    expect(current.opening_state.id).toBe(operationalId);
    expect(current.operational_reference?.cash_provenance).toEqual(f.reference.cash_provenance);
    expect(current.operational_reference?.prior_performance_available).toBe(false);
    const ajv = new Ajv2020({ strict: false }); addFormats(ajv); ajv.addSchema({ ...api, $id: 'urn:operational:api' });
    const validate = ajv.getSchema('urn:operational:api#/components/schemas/CurrentPortfolio')!;
    expect(validate(current), JSON.stringify(validate.errors)).toBe(true);
    expect(current.journal.version).toBe(0);
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
    expect(await f.local!.db.prepare('SELECT COUNT(*) n FROM opening_revisions').first('n')).toBe(1);
  });
  it('uses the new cash and declared PRU for future exact trades, with existing receipt replay', async () => {
    const f = await fixture(); await f.repository.initialize(f.reference);
    const buy = { type: 'buy', instrument_id: firstId, quantity: '1', amount: '9', fees: '1', currency: 'EUR', effective_at: '2026-11-21T11:00:00.000Z', provenance };
    const accepted = await f.journal.append(portfolioAdmin, portfolioId, buy, 0, 'synthetic-future-buy');
    expect(await f.journal.append(portfolioAdmin, portfolioId, buy, 0, 'synthetic-future-buy')).toEqual(accepted);
    const state = await f.portfolio.current(portfolioReader, portfolioId);
    expect(state.cash.amount).toBe('113.45');
    expect(state.positions.find(position => position.instrument_id === firstId)).toMatchObject({ quantity: '3', remaining_cost: { value: '24.25' } });
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toHaveLength(1);
    expect(await f.service.get(portfolioReader)).toEqual(f.historical);
  });
  it('refuses replacement, mismatched owner, pre-reference movements and old-anchor appends', async () => {
    const f = await fixture(); await f.repository.initialize(f.reference);
    await expect(f.repository.initialize(f.reference)).rejects.toMatchObject({ status: 409 });
    await expect(f.repository.initialize({ ...f.reference, owner_subject: 'synthetic-other' })).rejects.toMatchObject({ status: 403 });
    await expect(f.journal.append(portfolioAdmin, portfolioId, { type: 'deposit', amount: '1', currency: 'EUR', effective_at: '2026-11-19T00:00:00.000Z', provenance }, 0, 'old'))
      .rejects.toMatchObject({ code: 'transaction_not_after_opening' });
    const legacy = new TransactionService(f.journals, f.historicalRepository, f.instruments,
      { portfolio_id: portfolioId, kind: 'real', owner_subject: portfolioAdmin.subject, opening_id: f.historical.id, opening_revision: 1 }, now);
    await expect(legacy.append(portfolioAdmin, portfolioId, { type: 'deposit', amount: '1', currency: 'EUR', effective_at: '2026-11-21T11:00:00.000Z', provenance }, 0, 'old-anchor'))
      .rejects.toMatchObject({ code: 'opening_anchor_mismatch' });
    await expect(f.local!.db.prepare('DELETE FROM portfolio_operational_openings').run()).rejects.toThrow();
    await expect(f.local!.db.prepare("UPDATE portfolio_operational_openings SET owner_subject='other'").run()).rejects.toThrow();
  });
  it('rejects initialization when an existing real journal has recorded operations', async () => {
    const f = await fixture();
    const old = new TransactionService(f.journals, f.historicalRepository, f.instruments,
      { portfolio_id: portfolioId, kind: 'real', owner_subject: portfolioAdmin.subject, opening_id: f.historical.id, opening_revision: 1 }, now);
    await old.append(portfolioAdmin, portfolioId, { type: 'deposit', amount: '1', currency: 'EUR', effective_at: '2026-11-10T11:00:00.000Z', provenance }, 0, 'synthetic-existing');
    await expect(f.repository.initialize(f.reference)).rejects.toMatchObject({ code: 'operational_journal_not_empty' });
    expect((await old.get(portfolioReader, portfolioId)).events).toHaveLength(1);
    expect(await f.repository.get()).toBeNull();
  });
  it('preserves MCP approval enforcement and historical/read-only service separation', async () => {
    const f = await fixture(); await f.repository.initialize(f.reference);
    const writer = { ...portfolioAdmin, permissions: [...portfolioAdmin.permissions, 'portfolio:write' as const] };
    const service = new FinancialMcpService(f.journal, { portfolio_id: portfolioId, owner_subject: writer.subject }, new MemoryFinancialApprovalRepository(), now);
    const prepared = await service.prepare(writer, portfolioId, { type: 'withdrawal', amount: '1', currency: 'EUR', effective_at: '2026-11-21T11:00:00.000Z', provenance });
    await expect(service.confirm(writer, { operation_id: prepared.operation_id, digest: prepared.proposal.digest })).rejects.toMatchObject({ code: 'financial_confirmation_required' });
    await expect(service.prepare(portfolioReader, portfolioId, prepared.proposal.input)).rejects.toMatchObject({ status: 403 });
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
    const auth = await accessFixture();
    const app = createAccessFinancialWorker({ INSTRUMENTS_DB: f.local!.db, ACCESS_TEAM_DOMAIN: accessConfig.issuer,
      ACCESS_READ_AUD: accessConfig.audience, ACCESS_OWNER_SUB: accessConfig.ownerSubject, ACCESS_READ_ENABLED: 'true', ACCESS_PORTFOLIO_READ_ENABLED: 'true',
      FINANCIAL_WRITES_ENABLED: 'false', ACCESS_CONFIRMATION_AUD: 'b'.repeat(64), FINANCIAL_ORIGIN: 'https://synthetic.example.invalid',
      FINANCIAL_PORTFOLIO_ID: portfolioId, FINANCIAL_OWNER_ID: writer.subject, FINANCIAL_OPENING_ID: f.historical.id,
      FINANCIAL_OPENING_REVISION: '1', FINANCIAL_OPERATIONAL_OPENING_ID: operationalId }, { fetch: auth.keys, clock: () => Date.parse(now()) });
    const token = await auth.token({ iat: Math.floor(Date.parse(now()) / 1000) - 1, exp: Math.floor(Date.parse(now()) / 1000) + 300 });
    const call = (path: string) => app.request(`https://synthetic.example.invalid${path}`, { headers: { 'Cf-Access-Jwt-Assertion': token } });
    expect(await (await call('/api/v1/portfolio/opening-state')).json()).toEqual(f.historical);
    const current = await (await call(`/api/v1/portfolios/${portfolioId}/state`)).json();
    expect(current).toMatchObject({ positions: expect.any(Array), cash: { amount: '123.45' }, operational_reference: { prior_performance_available: false } });
  });
});

it('migration 0007 refuses a nonempty preexisting journal atomically without touching V1 data', async () => {
  expect(await migrationRejectsNonemptyJournal(portfolioId)).toEqual({ rejected: true, events: 1, new_tables: 0 });
});

it('validates an explicitly supplied private reference through the exact domain without exposing holdings', async context => {
  const input = await privateOperationalReference();
  if (!input) { context.skip(); return; }
  const reference = operationalOpeningSchema.safeParse(input);
  // Do not include the private parsed value in assertion diagnostics.
  expect(reference.success).toBe(true);
  if (!reference.success) return;
  const row = reference.data;
  const balances = initialJournalBalances({ portfolio_id: row.portfolio_id, kind: 'real', owner_subject: row.owner_subject,
    opening_id: row.opening.id, opening_revision: 1 }, row.opening);
  const financial = projectFinancialState(row.opening, [], balances);
  expect(balances.positions.length).toBe(20);
  expect(balances.cash.amount === row.opening.cash!.amount).toBe(true);
  expect(row.opening.positions.every(position => {
    const cost = financial.costs.get(position.instrument_id);
    return cost?.pru.status === 'available' && cost.pru.value === position.declared_pru &&
      balances.positions.find(p => p.instrument_id === position.instrument_id)?.quantity === position.quantity;
  })).toBe(true);
});
