import { afterEach, describe, expect, it } from 'vitest';
import { openLocalD1, runLocalMigrations, type LocalD1 } from './helpers/d1-local.mjs';
import { migrationFixture } from './helpers/d1-migration-fixtures.mjs';
import { D1PortfolioRegistryRepository } from '../src/adapters/d1/portfolio-registry';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { D1OperationalOpeningRepository } from '../src/adapters/d1/operational-opening';
import { D1InstrumentRepository } from '../src/adapters/d1/instruments';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { D1FinancialApprovalRepository } from '../src/adapters/d1/financial-approvals';
import { PortfolioService } from '../src/application/portfolio';
import { TransactionService } from '../src/application/transactions';
import { FinancialMcpService } from '../src/application/financial-mcp';
import { InstrumentService } from '../src/application/instruments';
import { operationalOpeningSchema } from '../src/domain/operational-opening';
import { portfolioAdmin, portfolioReader, provenance } from './helpers/portfolio';

const at = () => '2026-11-21T12:00:00.000Z';
const portfolioId = '10000000-0000-4000-8000-000000000001';
const operationalId = '20000000-0000-4000-8000-000000000001';
const writer = { ...portfolioAdmin, permissions: [...portfolioAdmin.permissions, 'portfolio:write' as const] };
const deposit = { type: 'deposit', amount: '1.01', currency: 'EUR', effective_at: '2026-11-21T11:00:00.000Z', provenance };
const tables = ['instruments', 'instrument_create_outcomes', 'opening_revisions', 'opening_positions', 'opening_outcomes',
  'quotation_observations', 'quotation_batch_outcomes', 'transaction_journals', 'transaction_events', 'transaction_outcomes',
  'portfolio_operational_openings', 'financial_approvals'];
async function snapshot(db: D1Database) {
  return Promise.all(tables.map(async table => ({ table, rows: (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results })));
}

describe('additive registry migration from populated V1.1', () => {
  let local: LocalD1 | undefined;
  afterEach(async () => { await local?.cleanup(); local = undefined; });
  it.each([
    { operational: true, populated: true }, { operational: true, populated: false }, { operational: false, populated: true },
  ])('preserves existing identity, anchors and receipts: %s', async scenario => {
    local = await openLocalD1({ migrate: false });
    const directory = local.directory;
    await local.dispose();
    const previous = await migrationFixture(directory, 'v1.1');
    await runLocalMigrations(directory, { migrationsDirectory: previous });
    local = await openLocalD1({ directory, migrate: false });
    const openings = new D1PortfolioRepository(local.db);
    const instruments = new D1InstrumentRepository(local.db);
    const historicalService = new PortfolioService(openings, instruments, at);
    const instrument = await new InstrumentService(instruments, at).create(portfolioAdmin,
      { name: 'Synthetic migration holding', kind: 'etf', quote_currency: 'EUR', price_unit: 'currency_unit' }, 'synthetic-instrument');
    const historical = await historicalService.append(portfolioAdmin, {
      effective_at: '2026-11-13T12:00:00.000Z', positions: [{ instrument_id: instrument.id, quantity: '2', declared_pru: '7.125', currency: 'EUR', provenance }],
      cash: { currency: 'EUR', amount: '100' }, provenance, correction_reason: null,
    }, 0, 'synthetic-historical');
    const reference = operationalOpeningSchema.parse({ portfolio_id: portfolioId, owner_subject: portfolioAdmin.subject,
      historical_opening_id: historical.id, historical_opening_revision: historical.revision,
      opening: { ...historical, id: operationalId, effective_at: '2026-11-20T22:59:59.999Z',
        positions: [{ instrument_id: instrument.id, quantity: '3', declared_pru: '9.21', currency: 'EUR', provenance }],
        cash: { currency: 'EUR', amount: '123.45' } },
      cash_provenance: provenance, reason: 'Synthetic reference, no reconstructed history' });
    if (scenario.operational) await new D1OperationalOpeningRepository(local.db, { portfolio_id: portfolioId,
      owner_subject: portfolioAdmin.subject, id: operationalId, historical_opening_id: historical.id, historical_opening_revision: 1 }).initialize(reference);
    const selected = scenario.operational ? reference.opening : historical;
    const binding = { portfolio_id: portfolioId, owner_subject: portfolioAdmin.subject, kind: 'real' as const,
      opening_id: selected.id, opening_revision: selected.revision };
    const journal = new TransactionService(new D1TransactionRepository(local.db), { get: async () => selected }, instruments, binding, at);
    const accepted = scenario.populated ? await journal.append(portfolioAdmin, portfolioId, deposit, 0, 'synthetic-prior-receipt') : null;
    const financialBinding = { portfolio_id: portfolioId, owner_subject: portfolioAdmin.subject };
    const financial = new FinancialMcpService(journal, financialBinding, new D1FinancialApprovalRepository(local.db), at);
    const prepared = await financial.prepare(writer, portfolioId, deposit);
    const before = await snapshot(local.db);
    const beforeState = await journal.get(portfolioReader, portfolioId);
    await local.dispose();
    await runLocalMigrations(directory);
    local = await openLocalD1({ directory, migrate: false });
    expect(await snapshot(local.db)).toEqual(before);
    expect(await new D1PortfolioRepository(local.db).get()).toEqual(historical);
    const registry = new D1PortfolioRegistryRepository(local.db);
    const row = await registry.get(portfolioAdmin.subject, portfolioId);
    expect(row).toMatchObject({ id: portfolioId, owner_subject: portfolioAdmin.subject, kind: 'real',
      opening: { source: scenario.operational ? 'operational' : 'historical', id: selected.id, revision: selected.revision } });
    expect(await registry.opening(portfolioAdmin.subject, portfolioId)).toEqual(selected);
    const reopened = new TransactionService(new D1TransactionRepository(local.db), { get: async () => selected },
      new D1InstrumentRepository(local.db), binding, at);
    expect(await reopened.get(portfolioReader, portfolioId)).toEqual(beforeState);
    if (accepted) expect(await reopened.append(portfolioAdmin, portfolioId, deposit, 0, 'synthetic-prior-receipt')).toEqual(accepted);
    const approvals = new D1FinancialApprovalRepository(local.db);
    expect((await approvals.get(prepared.operation_id))?.proposal).toEqual(prepared.proposal);
    const financialAfter = new FinancialMcpService(reopened, financialBinding, approvals, at);
    await expect(financialAfter.confirm(writer, { operation_id: prepared.operation_id, digest: prepared.proposal.digest }))
      .rejects.toMatchObject({ code: 'financial_confirmation_required' });
    expect((await local.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    expect(await registry.get('synthetic-other-owner', portfolioId)).toBeNull();
    // The same official CLI migration command is safely repeatable.
    await local.dispose(); await runLocalMigrations(directory);
    local = await openLocalD1({ directory, migrate: false });
    expect(await snapshot(local.db)).toEqual(before);
    expect(await new D1PortfolioRegistryRepository(local.db).get(portfolioAdmin.subject, portfolioId)).toEqual(row);
  }, 60000);
});
