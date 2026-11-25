import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PortfolioFinancialService } from '../src/application/portfolio-financial';
import { PortfolioContextService } from '../src/application/portfolio-context';
import { PortfolioRegistryService } from '../src/application/portfolio-registry';
import { FinancialMcpService } from '../src/application/financial-mcp';
import { TransactionService } from '../src/application/transactions';
import { PortfolioService } from '../src/application/portfolio';
import { PortfolioReadService } from '../src/application/portfolio-reads';
import { D1PortfolioRegistryRepository } from '../src/adapters/d1/portfolio-registry';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { D1FinancialApprovalRepository } from '../src/adapters/d1/financial-approvals';
import type { TransactionRepository } from '../src/ports/transactions';
import type { TransactionInput } from '../src/domain/transactions';
import type { Principal } from '../src/application/authorization';
import type { RegisteredPortfolio } from '../src/domain/portfolio-registry';
import { financialConfirmationRoutes } from '../src/adapters/rest/financial-confirmation';
import { quotationFixture } from './helpers/quotations';
import { portfolioAdmin, firstId, provenance } from './helpers/portfolio';

const at = '2026-11-21T12:00:00.000Z';
const origin = 'https://synthetic.example.invalid';
const writer: Principal = { subject: portfolioAdmin.subject, permissions: ['instruments:read', 'portfolio:read', 'portfolio:write', 'quotes:read'] };
const approver: Principal = { subject: writer.subject, permissions: ['portfolio:read', 'portfolio:approve'] };
const deposit: TransactionInput = { type: 'deposit', amount: '10', currency: 'EUR', effective_at: at, provenance };
const buy: TransactionInput = { type: 'buy', amount: '20', fees: '1', quantity: '1', instrument_id: firstId, currency: 'EUR', effective_at: at, provenance };
const command = (p: Awaited<ReturnType<PortfolioFinancialService['prepare']>>) => ({
  portfolio_id: p.proposal.portfolio_id, operation_id: p.operation_id, digest: p.proposal.digest,
});

describe('versioned owner-bound real and simulated financial confirmation', () => {
  let f: Awaited<ReturnType<typeof quotationFixture>>;
  let registry: D1PortfolioRegistryRepository;
  let transactions: D1TransactionRepository;
  let approvals: D1FinancialApprovalRepository;
  let legacy: FinancialMcpService;
  beforeAll(async () => {
    f = await quotationFixture('d1'); f.clock.now = at;
    registry = new D1PortfolioRegistryRepository(f.local!.db);
    transactions = new D1TransactionRepository(f.local!.db); approvals = new D1FinancialApprovalRepository(f.local!.db);
    const openings = new D1PortfolioRepository(f.local!.db);
    const opening = await new PortfolioService(openings, f.instruments, () => at).append(portfolioAdmin, {
      effective_at: '2026-11-13T12:00:00.000Z', positions: [], cash: { currency: 'EUR', amount: '100' }, provenance, correction_reason: null,
    }, 0, 'synthetic-legacy');
    legacy = new FinancialMcpService(new TransactionService(transactions, openings, f.instruments, {
      portfolio_id: '10000000-0000-4000-8000-000000000001', owner_subject: writer.subject, kind: 'real', opening_id: opening.id, opening_revision: 1,
    }, () => at), { portfolio_id: '10000000-0000-4000-8000-000000000001', owner_subject: writer.subject }, approvals, () => at, origin);
  }, 30000);
  afterAll(async () => { await f?.dispose(); });
  async function fixture() {
    let time = at;
    const clock = () => time;
    const admin = new PortfolioRegistryService(registry, f.instruments, clock);
    const rows: RegisteredPortfolio[] = [];
    for (const kind of ['real', 'real', 'simulated', 'simulated'] as const) rows.push(await admin.create(portfolioAdmin, {
      name: `Synthetic ${kind} <portfolio>`, kind, opening: { effective_at: '2026-11-20T12:00:00.000Z',
        cash: { currency: 'EUR', amount: '100' }, positions: [{ instrument_id: firstId, quantity: '2', declared_pru: '10', currency: 'EUR', provenance }],
        provenance, correction_reason: null },
    }));
    const service = (repository: TransactionRepository = transactions) => new PortfolioFinancialService({ registry, instruments: f.instruments,
      transactions: repository, approvals, clock, origin, legacy });
    const financial = service();
    async function approve(p: Awaited<ReturnType<typeof financial.prepare>>) {
      const csrf = crypto.randomUUID(); await financial.confirmationPage(approver, p.operation_id, csrf); await financial.approve(approver, p.operation_id, csrf);
    }
    async function record(index: number, input: TransactionInput = deposit) {
      const row = rows[index]!;
      const prepared = await financial.prepare(writer, row.id, input, row.kind);
      if (row.kind === 'real') await approve(prepared);
      return financial.confirm(writer, command(prepared), row.kind);
    }
    return { rows, financial, approve, record, admin, service, setTime: (value: string) => { time = value; } };
  }
  it('writes separately to two real and two simulated journals, with exact cash/holdings/PRU and no implicit prepare write', async () => {
    const x = await fixture();
    for (const row of x.rows) {
      const p = await x.financial.prepare(writer, row.id, buy, row.kind);
      expect(p.proposal).toMatchObject({ version: 2, kind: row.kind, portfolio_id: row.id, opening_id: row.opening.id, expected_version: 0 });
      expect((await transactions.get(row.id)).events).toHaveLength(0);
      if (row.kind === 'real') {
        expect(p.status).toBe('requires_human_confirmation');
        await expect(x.financial.confirm(writer, command(p), 'real')).rejects.toMatchObject({ code: 'financial_confirmation_required' });
        await x.approve(p);
      } else { expect(p.status).toBe('requires_mcp_confirmation'); expect(p.confirmation_url).toBeNull(); }
      const result = await x.financial.confirm(writer, command(p), row.kind);
      expect(result.balances).toMatchObject({ portfolio_id: row.id, kind: row.kind, cash: { amount: '79' }, positions: [{ quantity: '3' }] });
      expect(await x.financial.confirm(writer, command(p), row.kind)).toEqual(result);
      const state = await new PortfolioReadService({ registry, instruments: f.instruments, transactions, quotations: f.service, clock: () => at }).state(writer, row.id);
      expect(state.state.positions[0]?.remaining_cost).toMatchObject({ value: '41' });
      expect(state.state.positions[0]?.pru).toMatchObject({ status: 'available', value: '13.666666666666666667' });
      expect((await transactions.get(row.id)).events).toHaveLength(1);
      const context = await new PortfolioContextService(registry, f.instruments).resolve(writer, row.id, 'write');
      const core = new TransactionService(transactions, { get: async () => context.opening }, f.instruments, context.binding, () => at);
      await expect(core.append(writer, row.id, deposit, 0, p.operation_id)).rejects.toMatchObject({ code: 'idempotency_conflict' });
    }
    expect(new Set(x.rows.map(row => row.opening.id)).size).toBe(4);
  });
  it('reuses sales, deposits, withdrawals, dividends, fees and reversals in the simulated circuit', async () => {
    const x = await fixture();
    await x.record(2, buy);
    await x.record(2, { ...deposit, type: 'sell', instrument_id: firstId, quantity: '1', amount: '30', fees: '1' });
    const dividend = await x.record(2, { ...deposit, type: 'dividend', amount: '2.15', instrument_id: firstId });
    await x.record(2, deposit);
    await x.record(2, { ...deposit, type: 'withdrawal', amount: '5' });
    const corrected = await x.record(2, { type: 'reversal', reversal_of: dividend.event.id, reason: 'Synthetic correction', effective_at: at, provenance });
    expect(corrected.balances).toMatchObject({ cash: { amount: '113' }, version: 6, positions: [{ quantity: '2' }] });
    expect((await transactions.get(x.rows[3]!.id)).events).toEqual([]);
  });
  it('refuses foreign owners, missing permissions, client kind/owner overrides and archived preparation', async () => {
    const x = await fixture(); const row = x.rows[0]!;
    await expect(x.financial.prepare({ ...writer, subject: 'synthetic-other-owner' }, row.id, deposit, 'real')).rejects.toMatchObject({ status: 404 });
    await expect(x.financial.prepare({ ...writer, permissions: ['portfolio:read'] }, row.id, deposit, 'real')).rejects.toMatchObject({ status: 403 });
    await expect(x.financial.prepare(null, row.id, deposit, 'real')).rejects.toMatchObject({ status: 401 });
    await expect(x.financial.prepare(writer, row.id, { ...deposit, kind: 'simulated', owner_subject: 'fake' }, 'real')).rejects.toMatchObject({ status: 422 });
    await x.admin.archive(portfolioAdmin, row.id, 1);
    await expect(x.financial.prepare(writer, row.id, deposit, 'real')).rejects.toMatchObject({ code: 'portfolio_archived' });
  });
  it.each([0, 2])('rechecks active status after preparation and approval for circuit %s', async index => {
    const x = await fixture(); const row = x.rows[index]!;
    const p = await x.financial.prepare(writer, row.id, deposit, row.kind);
    if (row.kind === 'real') await x.approve(p);
    await x.admin.archive(portfolioAdmin, row.id, 1);
    await expect(x.financial.confirm(writer, command(p), row.kind)).rejects.toMatchObject({ code: 'portfolio_archived' });
    if (row.kind === 'real') await expect(x.financial.confirmationPage(approver, p.operation_id, crypto.randomUUID())).rejects.toMatchObject({ code: 'portfolio_archived' });
    expect((await transactions.get(row.id)).events).toEqual([]);
  });
  it.each([false, true])('rejects an archive racing after consumption, including populated journal=%s', async populated => {
    const x = await fixture(); const row = x.rows[2]!;
    if (populated) await x.record(2);
    const racing: TransactionRepository = {
      get: id => transactions.get(id), replay: (id, replay) => transactions.replay(id, replay),
      append: async (...args) => { await x.admin.archive(portfolioAdmin, row.id, 1); return transactions.append(...args); },
    };
    const service = x.service(racing);
    const p = await service.prepare(writer, row.id, deposit, 'simulated');
    await expect(service.confirm(writer, command(p), 'simulated')).rejects.toMatchObject({ code: 'portfolio_write_denied' });
    expect((await transactions.get(row.id)).events).toHaveLength(populated ? 1 : 0);
    expect((await approvals.get(p.operation_id))?.status).toBe('consumed');
  });
  it('cannot cross real/simulated circuits, selected portfolios, browser approval or V1/V2 confirmation', async () => {
    const x = await fixture();
    const real = await x.financial.prepare(writer, x.rows[0]!.id, deposit, 'real');
    const sim = await x.financial.prepare(writer, x.rows[2]!.id, deposit, 'simulated');
    await expect(x.financial.confirm(writer, command(real), 'simulated')).rejects.toMatchObject({ code: 'financial_circuit_mismatch' });
    await expect(x.financial.confirm(writer, command(sim), 'real')).rejects.toMatchObject({ code: 'financial_circuit_mismatch' });
    await expect(x.financial.confirm(writer, { ...command(real), portfolio_id: x.rows[1]!.id }, 'real')).rejects.toMatchObject({ code: 'financial_circuit_mismatch' });
    await expect(x.financial.prepare(writer, x.rows[2]!.id, deposit, 'real')).rejects.toMatchObject({ code: 'financial_circuit_mismatch' });
    await expect(x.financial.confirmationPage(approver, sim.operation_id, crypto.randomUUID())).rejects.toMatchObject({ code: 'browser_confirmation_real_only' });
    await expect(legacy.confirm(writer, { operation_id: real.operation_id, digest: real.proposal.digest })).rejects.toMatchObject({ code: 'financial_circuit_mismatch' });
    expect(await approvals.confirmSimulated(real.operation_id, writer.subject, real.proposal.digest, at)).toBe(false);
    await expect(x.financial.confirm(writer, { ...command(sim), owner_subject: writer.subject }, 'simulated')).rejects.toMatchObject({ status: 400 });
  });
  it.each([0, 2])('rejects expired proposals for circuit %s before consumption', async index => {
    const x = await fixture(); const row = x.rows[index]!;
    const p = await x.financial.prepare(writer, row.id, deposit, row.kind);
    if (row.kind === 'real') await x.approve(p);
    x.setTime('2026-11-21T12:05:00.000Z');
    await expect(x.financial.confirm(writer, command(p), row.kind)).rejects.toMatchObject({ code: 'financial_proposal_expired' });
    expect((await transactions.get(row.id)).events).toEqual([]);
  });
  it.each([0, 2])('consumes at most once under concurrent confirmations and replays the exact receipt for circuit %s', async index => {
    const x = await fixture(); const row = x.rows[index]!;
    const p = await x.financial.prepare(writer, row.id, deposit, row.kind);
    if (row.kind === 'real') await x.approve(p);
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => x.financial.confirm(writer, command(p), row.kind)));
    expect(outcomes.some(result => result.status === 'fulfilled')).toBe(true);
    const original = await x.financial.confirm(writer, command(p), row.kind);
    expect((await transactions.get(row.id)).events.map(event => event.id)).toEqual([original.event.id]);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_outcomes WHERE portfolio_id=?').bind(row.id).first('n')).toBe(1);
    expect(await x.financial.confirm(writer, command(p), row.kind)).toEqual(original);
    await x.record(index, deposit);
    expect(await x.financial.confirm(writer, command(p), row.kind)).toEqual(original);
  });
  it('rejects changed permission, subject, digest and stale expected version without replacing an approval', async () => {
    const x = await fixture(); const row = x.rows[2]!;
    const first = await x.financial.prepare(writer, row.id, deposit, 'simulated');
    const stale = await x.financial.prepare(writer, row.id, buy, 'simulated');
    await expect(x.financial.confirm({ ...writer, subject: 'synthetic-other' }, command(first), 'simulated')).rejects.toMatchObject({ status: 404 });
    await expect(x.financial.confirm({ ...writer, permissions: [] }, command(first), 'simulated')).rejects.toMatchObject({ status: 403 });
    await expect(x.financial.confirm(writer, { ...command(first), digest: '0'.repeat(64) }, 'simulated')).rejects.toMatchObject({ code: 'financial_proposal_mismatch' });
    await x.financial.confirm(writer, command(first), 'simulated');
    await expect(x.financial.confirm(writer, command(stale), 'simulated')).rejects.toMatchObject({ status: 412 });
    expect((await approvals.get(stale.operation_id))?.status).toBe('prepared');
  });
  it('rejects a correctly hashed but incompatible opening before consuming the proposal', async () => {
    const x = await fixture(); const row = x.rows[2]!;
    const original = await x.financial.prepare(writer, row.id, deposit, 'simulated');
    const { digest: _digest, ...base } = original.proposal;
    const intent = { ...base, opening_id: x.rows[3]!.opening.id, idempotency_key: crypto.randomUUID() };
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, subject: writer.subject, kind: 'real', ...intent }));
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    await approvals.create({ subject: writer.subject, proposal: { ...intent, digest }, summary: {}, status: 'prepared', csrf: null, approved_at: null, consumed_at: null });
    await expect(x.financial.confirm(writer, { portfolio_id: row.id, operation_id: intent.idempotency_key, digest }, 'simulated'))
      .rejects.toMatchObject({ code: 'opening_anchor_mismatch' });
    expect((await approvals.get(intent.idempotency_key))?.status).toBe('prepared');
  });
  it('displays the exact real portfolio ID/name/nature safely and refuses unauthorized browser actions', async () => {
    const x = await fixture(); const row = x.rows[0]!;
    const p = await x.financial.prepare(writer, row.id, buy, 'real');
    const routes = financialConfirmationRoutes(x.financial, async () => approver, origin);
    const page = await routes.fetch(new Request(`${origin}/${p.operation_id}`));
    const html = await page.text();
    expect(page.status).toBe(200); expect(html).toContain(row.id); expect(html).toContain('Réel');
    expect(html).toContain('Synthetic real &lt;portfolio&gt;'); expect(html).not.toContain('Synthetic real <portfolio>');
    await expect(x.financial.confirmationPage(writer, p.operation_id, crypto.randomUUID())).rejects.toMatchObject({ status: 403 });
    await expect(x.financial.approve(approver, p.operation_id, 'bad-csrf')).rejects.toMatchObject({ status: 403 });
  });
  it('enforces immutable owner/kind/anchor and SQL rejection of a copied journal binding', async () => {
    const x = await fixture(); const a = x.rows[0]!; const b = x.rows[1]!;
    await expect(f.local!.db.prepare(`INSERT INTO transaction_journals(portfolio_id,kind,owner_subject,opening_id,opening_revision,version)
      VALUES (?,'real',?,?,1,0)`).bind(a.id, writer.subject, b.opening.id).run()).rejects.toThrow();
    for (const [field, value] of [['owner_subject', 'synthetic-other'], ['kind', 'simulated'], ['opening_id', b.opening.id]] as const)
      await expect(f.local!.db.prepare(`UPDATE portfolios SET ${field}=? WHERE id=?`).bind(value, a.id).run()).rejects.toThrow();
    expect((await f.local!.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });
});
