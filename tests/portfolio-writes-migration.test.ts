import { afterEach, expect, it } from 'vitest';
import { openLocalD1, runLocalMigrations, type LocalD1 } from './helpers/d1-local.mjs';
import { migrationFixture } from './helpers/d1-migration-fixtures.mjs';
import { PortfolioService } from '../src/application/portfolio';
import { TransactionService } from '../src/application/transactions';
import { FinancialMcpService } from '../src/application/financial-mcp';
import { PortfolioFinancialService } from '../src/application/portfolio-financial';
import { PortfolioContextService } from '../src/application/portfolio-context';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { D1InstrumentRepository } from '../src/adapters/d1/instruments';
import { D1OperationalOpeningRepository } from '../src/adapters/d1/operational-opening';
import { D1PortfolioRegistryRepository } from '../src/adapters/d1/portfolio-registry';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { D1FinancialApprovalRepository } from '../src/adapters/d1/financial-approvals';
import { operationalOpeningSchema } from '../src/domain/operational-opening';
import { portfolioAdmin, provenance } from './helpers/portfolio';

const clock = () => '2026-11-21T12:00:00.000Z';
const writer = { subject: portfolioAdmin.subject, permissions: ['portfolio:read', 'portfolio:write'] as const };
const approver = { subject: portfolioAdmin.subject, permissions: ['portfolio:read', 'portfolio:approve'] as const };
const input = { type: 'deposit', amount: '10.01', currency: 'EUR', effective_at: clock(), provenance };
let local: LocalD1 | undefined;
afterEach(async () => { await local?.cleanup(); local = undefined; });

it('upgrades a nonempty V2.0-B journal without changing financial rows, V1 proposals/digests or canonical receipts', async () => {
  local = await openLocalD1({ migrate: false }); const directory = local.directory;
  await local.dispose();
  const previous = await migrationFixture(directory, 'v2.0b');
  await runLocalMigrations(directory, { migrationsDirectory: previous });
  local = await openLocalD1({ directory, migrate: false });
  const openings = new D1PortfolioRepository(local.db);
  const instruments = new D1InstrumentRepository(local.db);
  const historical = await new PortfolioService(openings, instruments, clock).append(portfolioAdmin, {
    effective_at: '2026-11-13T12:00:00.000Z', positions: [], cash: { currency: 'EUR', amount: '100' }, provenance, correction_reason: null,
  }, 0, 'synthetic-v1');
  const id = crypto.randomUUID(); const openingId = crypto.randomUUID();
  const operational = operationalOpeningSchema.parse({ portfolio_id: id, owner_subject: writer.subject,
    historical_opening_id: historical.id, historical_opening_revision: historical.revision,
    opening: { ...historical, id: openingId, effective_at: '2026-11-20T12:00:00.000Z' }, cash_provenance: provenance, reason: 'Synthetic migration opening' });
  await new D1OperationalOpeningRepository(local.db, { portfolio_id: id, owner_subject: writer.subject, id: openingId,
    historical_opening_id: historical.id, historical_opening_revision: 1 }).initialize(operational);
  await local.db.prepare(`INSERT INTO portfolios(id,owner_subject,name,kind,status,version,opening_source,opening_id,opening_revision,created_at,updated_at)
    VALUES (?,?,'Synthetic historic PEA','real','active',1,'operational',?,1,?,?)`).bind(id, writer.subject, openingId, clock(), clock()).run();
  const binding = { portfolio_id: id, owner_subject: writer.subject, kind: 'real' as const, opening_id: openingId, opening_revision: 1 };
  const journal = new TransactionService(new D1TransactionRepository(local.db), { get: async () => operational.opening }, instruments, binding, clock);
  const approvals = new D1FinancialApprovalRepository(local.db);
  const legacy = new FinancialMcpService(journal, { portfolio_id: id, owner_subject: writer.subject }, approvals, clock);
  const first = await journal.append(writer, id, input, 0, 'synthetic-old-receipt');
  const pending = await legacy.prepare(writer, id, input);
  expect('version' in pending.proposal).toBe(false);
  const { digest, ...intent } = pending.proposal;
  // Freeze the original V1.1 digest formula independently from the implementation.
  const expected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
    JSON.stringify({ version: 1, subject: writer.subject, kind: 'real', ...intent }))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  expect(digest).toBe(expected);
  const tables = ['opening_revisions', 'opening_positions', 'opening_outcomes', 'portfolio_operational_openings', 'portfolios',
    'transaction_journals', 'transaction_events', 'transaction_outcomes', 'financial_approvals'];
  const before = await Promise.all(tables.map(async table => ({ table, rows: (await local!.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results })));
  await local.dispose(); await runLocalMigrations(directory);
  local = await openLocalD1({ directory, migrate: false });
  const after = await Promise.all(tables.map(async table => ({ table, rows: (await local!.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results })));
  expect(after).toEqual(before);
  const repository = new D1PortfolioRegistryRepository(local.db);
  const reopenedInstruments = new D1InstrumentRepository(local.db);
  const contexts = new PortfolioContextService(repository, reopenedInstruments);
  const reopened = new TransactionService(new D1TransactionRepository(local.db), { get: async () => operational.opening }, reopenedInstruments, binding, clock);
  const reloadedApprovals = new D1FinancialApprovalRepository(local.db);
  const guarded = new FinancialMcpService(reopened, { portfolio_id: id, owner_subject: writer.subject }, reloadedApprovals, clock,
    'https://synthetic.example.invalid', { format: 1, kind: 'real', check: async principal => {
      const context = await contexts.resolve(principal, id, principal.permissions.includes('portfolio:write') ? 'write' : 'approve');
      return { id, name: context.portfolio.name, kind: context.portfolio.kind };
    } });
  const multi = new PortfolioFinancialService({ registry: repository, instruments: reopenedInstruments, transactions: new D1TransactionRepository(local.db),
    approvals: reloadedApprovals, clock, origin: 'https://synthetic.example.invalid', legacy: guarded });
  expect(await reopened.append(writer, id, input, 0, 'synthetic-old-receipt')).toEqual(first);
  const nonce = crypto.randomUUID();
  expect((await multi.confirmationPage(approver, pending.operation_id, nonce)).portfolio).toMatchObject({ id, name: 'Synthetic historic PEA', kind: 'real' });
  await multi.approve(approver, pending.operation_id, nonce);
  // The historical confirmation still has NO portfolio_id argument.
  const command = { operation_id: pending.operation_id, digest: pending.proposal.digest };
  const accepted = await guarded.confirm(writer, command);
  expect(accepted.balances.version).toBe(2);
  expect(await guarded.confirm(writer, command)).toEqual(accepted);
  expect((await reloadedApprovals.get(pending.operation_id))?.proposal).toEqual(pending.proposal);
  await expect(multi.confirm(writer, { ...command, portfolio_id: id }, 'real')).rejects.toMatchObject({ code: 'financial_circuit_mismatch' });
  expect(await new D1PortfolioRepository(local.db).get()).toEqual(historical);
  expect((await local.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
}, 60000);
