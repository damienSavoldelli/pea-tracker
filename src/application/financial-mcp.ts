import { z } from 'zod';
import { portfolioIdSchema } from '../domain/transactions';
import { financialIntentSchema as intentSchema, financialIntentV2Schema } from '../domain/financial-proposal';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';
import type { TransactionService } from './transactions';
import type { FinancialApproval, FinancialApprovalRepository } from '../ports/financial-approval';

const lifetimeMs = 5 * 60 * 1000;
export const financialConfirmationSchema = z.object({ operation_id: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
// Same query and envelope as V2.0B; V1.1 exposes only configured-portfolio metadata.
export const portfolioListQuerySchema = z.object({ limit: z.number().int().min(1).max(100).default(50),
  after: portfolioIdSchema.optional() }).strict();

export interface FinancialPortfolioInfo { id: string; name: string; kind: 'real' | 'simulated' }
export interface FinancialPolicy {
  format: 1 | 2; kind: 'real' | 'simulated';
  check(principal: Principal): Promise<FinancialPortfolioInfo>;
}

/** Two-step orchestration; all financial calculations/append invariants remain in TransactionService. */
export class FinancialMcpService {
  private readonly binding: { portfolio_id: string; owner_subject: string };
  constructor(private readonly transactions: TransactionService, binding: { portfolio_id: string; owner_subject: string },
    private readonly approvals?: FinancialApprovalRepository, private readonly clock: () => string = () => new Date().toISOString(),
    private readonly confirmationOrigin?: string, private readonly policy?: FinancialPolicy) {
    this.binding = z.object({ portfolio_id: portfolioIdSchema, owner_subject: z.string().min(1).max(128) }).strict().parse(binding);
    if (policy?.format === 1 && policy.kind !== 'real') throw new Error('Legacy financial policy must remain real');
    if (confirmationOrigin && (new URL(confirmationOrigin).origin !== confirmationOrigin || !confirmationOrigin.startsWith('https://'))) throw new Error('HTTPS confirmation origin required');
  }
  private get kind() { return this.policy?.kind ?? 'real'; }
  private checkProposal(row: FinancialApproval) {
    const version = 'version' in row.proposal ? row.proposal.version : 1;
    const kind = 'kind' in row.proposal ? row.proposal.kind : 'real';
    if (version !== (this.policy?.format ?? 1) || kind !== this.kind) throw new ApplicationError(403, 'financial_circuit_mismatch');
  }
  private authorize(principal: Principal | null, id: string, write: boolean): asserts principal is Principal {
    requirePermission(principal, 'portfolio:read');
    if (write) requirePermission(principal, 'portfolio:write');
    if (id !== this.binding.portfolio_id || principal.subject !== this.binding.owner_subject) throw new ApplicationError(403, 'portfolio_access_denied');
  }
  private async digest(subject: string, intent: z.output<typeof intentSchema> | z.output<typeof financialIntentV2Schema>) {
    // Preserve the V1 prefix/order byte-for-byte. Validated V2 intents explicitly
    // override version and kind; neither field can be supplied through a V1 tool.
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, subject, kind: 'real', ...intent }));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async journal(principal: Principal | null, portfolioId: string) {
    this.authorize(principal, portfolioId, false);
    const state = await this.transactions.get(principal, portfolioId);
    if (state.balances.kind !== this.kind) throw new ApplicationError(403, 'real_portfolio_required');
    return state;
  }
  async listPortfolios(principal: Principal | null, input: unknown = {}) {
    this.authorize(principal, this.binding.portfolio_id, false);
    const query = portfolioListQuerySchema.safeParse(input);
    if (!query.success) throw new ApplicationError(400, 'invalid_query');
    const { balances } = await this.journal(principal, this.binding.portfolio_id);
    const data = query.data.after === undefined || balances.portfolio_id > query.data.after
      ? [{ id: balances.portfolio_id, kind: balances.kind, status: 'active' as const }] : [];
    return { data, page: { next_after: null }, read_only: true as const };
  }
  async prepare(principal: Principal | null, portfolioId: string, input: unknown) {
    this.authorize(principal, portfolioId, true);
    const portfolio = await this.policy?.check(principal);
    if (!this.approvals) throw new ApplicationError(503, 'financial_confirmation_unavailable');
    const preview = await this.transactions.preview(principal, portfolioId, input);
    if (preview.before.kind !== this.kind) throw new ApplicationError(403, 'real_portfolio_required');
    const preparedAt = this.clock();
    const initial = intentSchema.parse({ portfolio_id: portfolioId, input: preview.input, expected_version: preview.expected_version,
      opening_id: preview.before.opening_id, opening_revision: preview.before.opening_revision,
      idempotency_key: crypto.randomUUID(), prepared_at: preparedAt, expires_at: new Date(Date.parse(preparedAt) + lifetimeMs).toISOString() });
    const intent = this.policy?.format === 2 ? financialIntentV2Schema.parse({ ...initial, version: 2, kind: this.kind }) : initial;
    const proposal = { ...intent, digest: await this.digest(principal.subject, intent) };
    const summary = { operation: preview.input, cash_before: preview.before.cash, cash_after: preview.after.cash,
        instrument: preview.instrument,
        positions_before: preview.before.positions, positions_after: preview.after.positions,
        cash_delta: preview.cash_delta, instrument_id: preview.instrument_id, quantity_delta: preview.quantity_delta };
    await this.approvals.create({ subject: principal.subject, proposal, summary, status: 'prepared', csrf: null, approved_at: null, consumed_at: null });
    return { status: this.kind === 'real' ? 'requires_human_confirmation' as const : 'requires_mcp_confirmation' as const, proposal, summary,
      ...(portfolio ? { portfolio } : {}),
      operation_id: proposal.idempotency_key,
      confirmation_url: this.kind === 'real' && this.confirmationOrigin ? `${this.confirmationOrigin}/financial-confirmation/${proposal.idempotency_key}` : null,
      journal_written: false as const, brokerage_order: false as const };
  }
  async confirm(principal: Principal | null, input: unknown) {
    requirePermission(principal, 'portfolio:write');
    const parsed = financialConfirmationSchema.safeParse(input);
    if (!parsed.success) throw new ApplicationError(400, 'invalid_financial_proposal');
    if (!this.approvals) throw new ApplicationError(503, 'financial_confirmation_unavailable');
    const row = await this.approvals.get(parsed.data.operation_id);
    if (!row) throw new ApplicationError(404, 'financial_proposal_not_found');
    this.checkProposal(row);
    const { digest, ...intent } = row.proposal;
    this.authorize(principal, intent.portfolio_id, true);
    await this.policy?.check(principal);
    if (row.subject !== principal.subject || digest !== parsed.data.digest) throw new ApplicationError(403, 'financial_proposal_mismatch');
    const now = Date.parse(this.clock()); const prepared = Date.parse(intent.prepared_at); const expires = Date.parse(intent.expires_at);
    if (prepared > now || expires <= now || expires - prepared !== lifetimeMs) throw new ApplicationError(409, 'financial_proposal_expired');
    if (digest !== await this.digest(principal.subject, intent)) throw new ApplicationError(409, 'financial_proposal_changed');
    // A Boolean/tool permission/claimed interactive mode from the client cannot satisfy this gate.
    const state = await this.journal(principal, intent.portfolio_id);
    if (state.balances.opening_id !== intent.opening_id || state.balances.opening_revision !== intent.opening_revision) throw new ApplicationError(409, 'opening_anchor_mismatch');
    if (this.policy?.format === 2 && row.status !== 'consumed' && state.balances.version !== intent.expected_version)
      throw new ApplicationError(412, 'version_mismatch');
    if (this.kind === 'simulated' && row.status === 'prepared') {
      await this.approvals.confirmSimulated(parsed.data.operation_id, principal.subject, digest, this.clock());
    }
    if (!await this.approvals.consume(parsed.data.operation_id, principal.subject, digest, this.clock())) {
      const current = await this.approvals.get(parsed.data.operation_id);
      if (current?.status !== 'consumed') throw new ApplicationError(403, 'financial_confirmation_required');
      const prior = await this.transactions.recorded(principal, intent.portfolio_id, intent.input, intent.expected_version, intent.idempotency_key);
      if (prior) return prior;
      // Never execute twice after an ambiguous failure. Reconcile the journal, then prepare again.
      throw new ApplicationError(409, 'financial_confirmation_consumed');
    }
    return this.transactions.append(principal, intent.portfolio_id, intent.input, intent.expected_version, intent.idempotency_key);
  }
  private async approvable(principal: Principal | null, id: string) {
    requirePermission(principal, 'portfolio:approve');
    if (!z.string().uuid().safeParse(id).success) throw new ApplicationError(400, 'invalid_financial_proposal');
    if (!this.approvals) throw new ApplicationError(503, 'financial_confirmation_unavailable');
    const row = await this.approvals.get(id);
    if (!row) throw new ApplicationError(404, 'financial_proposal_not_found');
    this.checkProposal(row);
    if (this.kind !== 'real') throw new ApplicationError(403, 'browser_confirmation_real_only');
    this.authorize(principal, row.proposal.portfolio_id, false);
    if (row.subject !== principal.subject) throw new ApplicationError(403, 'portfolio_access_denied');
    await this.policy?.check(principal);
    const { digest, ...intent } = row.proposal;
    if (digest !== await this.digest(principal.subject, intent)) throw new ApplicationError(409, 'financial_proposal_changed');
    if (intent.expires_at <= this.clock()) throw new ApplicationError(409, 'financial_proposal_expired');
    return row;
  }
  async confirmationPage(principal: Principal | null, id: string, csrf: string) {
    const row = await this.approvable(principal, id);
    if (row.status !== 'prepared') throw new ApplicationError(409, 'financial_confirmation_already_used');
    if (!await this.approvals!.setCsrf(id, row.subject, csrf, this.clock())) throw new ApplicationError(409, 'financial_proposal_expired');
    const portfolio = this.policy ? await this.policy.check(principal!) : { id: row.proposal.portfolio_id, name: 'Historical PEA', kind: 'real' as const };
    return { proposal: row.proposal, summary: row.summary, portfolio };
  }
  async approve(principal: Principal | null, id: string, csrf: string) {
    const row = await this.approvable(principal, id);
    if (!await this.approvals!.approve(id, row.subject, csrf, this.clock())) throw new ApplicationError(403, 'financial_confirmation_rejected');
    return { status: 'approved' as const, operation_id: id, digest: row.proposal.digest, journal_written: false as const };
  }
}
