import type { InstrumentRepository } from '../ports/instruments';
import type { PortfolioRegistryRepository } from '../ports/portfolio-registry';
import type { TransactionRepository } from '../ports/transactions';
import type { FinancialApprovalRepository } from '../ports/financial-approval';
import { PortfolioContextService } from './portfolio-context';
import { TransactionService } from './transactions';
import { FinancialMcpService, financialConfirmationSchema } from './financial-mcp';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';
import { portfolioIdSchema } from '../domain/transactions';

export const portfolioConfirmationSchema = financialConfirmationSchema.extend({ portfolio_id: portfolioIdSchema }).strict();

/** Version-2 financial orchestration; reuses the exact existing transaction engine. */
export class PortfolioFinancialService {
  private readonly contexts: PortfolioContextService;
  constructor(private readonly dependencies: { registry: PortfolioRegistryRepository; instruments: InstrumentRepository;
    transactions: TransactionRepository; approvals: FinancialApprovalRepository; clock?: () => string;
    origin: string; legacy: FinancialMcpService }) {
    this.contexts = new PortfolioContextService(dependencies.registry, dependencies.instruments);
  }
  private async service(principal: Principal | null, id: unknown, kind: 'real' | 'simulated', mode: 'write' | 'approve') {
    const context = await this.contexts.resolve(principal, id, mode);
    if (context.portfolio.kind !== kind) throw new ApplicationError(403, 'financial_circuit_mismatch');
    const transactions = new TransactionService(this.dependencies.transactions,
      { get: async revision => revision === undefined || revision === context.opening.revision ? context.opening : null },
      this.dependencies.instruments, context.binding, this.dependencies.clock);
    return new FinancialMcpService(transactions, { portfolio_id: context.portfolio.id, owner_subject: context.portfolio.owner_subject },
      this.dependencies.approvals, this.dependencies.clock, this.dependencies.origin, { format: 2, kind,
        check: async actor => {
          const current = await this.contexts.resolve(actor, context.portfolio.id, mode);
          if (current.portfolio.kind !== kind || current.opening.id !== context.opening.id || current.opening.revision !== context.opening.revision)
            throw new ApplicationError(409, 'opening_anchor_mismatch');
          return { id: current.portfolio.id, name: current.portfolio.name, kind: current.portfolio.kind };
        } });
  }
  async prepare(principal: Principal | null, id: string, input: unknown, kind: 'real' | 'simulated') {
    return (await this.service(principal, id, kind, 'write')).prepare(principal, id, input);
  }
  async confirm(principal: Principal | null, input: unknown, kind: 'real' | 'simulated') {
    requirePermission(principal, 'portfolio:write');
    const parsed = portfolioConfirmationSchema.safeParse(input);
    if (!parsed.success) throw new ApplicationError(400, 'invalid_financial_proposal');
    const row = await this.dependencies.approvals.get(parsed.data.operation_id);
    if (!row || row.subject !== principal.subject) throw new ApplicationError(404, 'financial_proposal_not_found');
    if (!('version' in row.proposal) || row.proposal.kind !== kind || row.proposal.portfolio_id !== parsed.data.portfolio_id)
      throw new ApplicationError(403, 'financial_circuit_mismatch');
    const service = await this.service(principal, parsed.data.portfolio_id, kind, 'write');
    return service.confirm(principal, { operation_id: parsed.data.operation_id, digest: parsed.data.digest });
  }
  private async browserService(principal: Principal | null, id: string) {
    requirePermission(principal, 'portfolio:approve');
    const row = await this.dependencies.approvals.get(id);
    if (!row || row.subject !== principal.subject) throw new ApplicationError(404, 'financial_proposal_not_found');
    if (!('version' in row.proposal)) return this.dependencies.legacy;
    if (row.proposal.kind !== 'real') throw new ApplicationError(403, 'browser_confirmation_real_only');
    return this.service(principal, row.proposal.portfolio_id, 'real', 'approve');
  }
  async confirmationPage(principal: Principal | null, id: string, csrf: string) {
    return (await this.browserService(principal, id)).confirmationPage(principal, id, csrf);
  }
  async approve(principal: Principal | null, id: string, csrf: string) {
    return (await this.browserService(principal, id)).approve(principal, id, csrf);
  }
}
