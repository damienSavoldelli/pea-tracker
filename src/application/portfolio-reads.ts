import { z } from 'zod';
import { PortfolioContextService } from './portfolio-context';
import { PortfolioService } from './portfolio';
import { TransactionService } from './transactions';
import { ValuationService } from './valuation';
import type { InstrumentRepository } from '../ports/instruments';
import type { PortfolioRegistryRepository } from '../ports/portfolio-registry';
import type { PortfolioRepository } from '../ports/portfolio';
import type { TransactionRepository } from '../ports/transactions';
import type { QuotationService } from './quotations';
import type { PerformanceReference } from '../domain/performance';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';

export const portfolioListQuerySchema = z.object({ limit: z.number().int().min(1).max(100).default(50),
  after: z.string().uuid().optional() }).strict();

/** Read-only resolution. No active-portfolio state and no write/approval service escapes this boundary. */
export class PortfolioReadService {
  private readonly contexts: PortfolioContextService;
  private readonly references: ReadonlyMap<string, PerformanceReference>;
  constructor(private readonly dependencies: {
    registry: PortfolioRegistryRepository; instruments: InstrumentRepository; transactions: TransactionRepository;
    quotations: QuotationService; references?: ReadonlyMap<string, PerformanceReference>; clock?: () => string;
  }) {
    this.contexts = new PortfolioContextService(dependencies.registry, dependencies.instruments);
    this.references = new Map([...(dependencies.references ?? [])].map(([id, reference]) => [id, structuredClone(reference)]));
  }
  async list(principal: Principal | null, input: unknown = {}) {
    requirePermission(principal, 'portfolio:read');
    const parsed = portfolioListQuerySchema.safeParse(input);
    if (!parsed.success) throw new ApplicationError(400, 'invalid_query');
    // One extra metadata row determines continuation without an unbounded count.
    const rows = await this.dependencies.registry.list(principal.subject, parsed.data.limit + 1, parsed.data.after);
    const data = rows.slice(0, parsed.data.limit);
    return { data, page: { next_after: rows.length > data.length ? data.at(-1)!.id : null }, read_only: true as const };
  }
  private async resolve(principal: Principal | null, id: unknown) {
    const { portfolio, opening } = await this.contexts.resolve(principal, id);
    // The registry parser validates both kind and status. Archived portfolios are readable,
    // never reactivated or written; they are not promised a frozen archive-date valuation.
    const reference = this.references.get(portfolio.id);
    if (reference && (reference.portfolio_id !== portfolio.id || reference.kind !== portfolio.kind ||
      reference.opening_state.id !== opening.id || reference.opening_state.revision !== opening.revision))
      throw new ApplicationError(409, 'performance_reference_mismatch');
    return { portfolio, opening, reference };
  }
  async get(principal: Principal | null, id: unknown) {
    const { portfolio, opening, reference } = await this.resolve(principal, id);
    return { portfolio, read_only: true as const,
      opening: { id: opening.id, revision: opening.revision, effective_at: opening.effective_at, provenance: opening.provenance },
      performance_reference: reference ? { status: 'configured' as const } : { status: 'unavailable' as const, reason: 'initial_market_reference_missing' } };
  }
  private async services(principal: Principal | null, id: unknown) {
    const resolved = await this.resolve(principal, id);
    const { portfolio, opening, reference } = resolved;
    const openings: PortfolioRepository = {
      get: async revision => revision === undefined || revision === opening.revision ? structuredClone(opening) : null,
      append: async () => { throw new ApplicationError(403, 'read_only_portfolio'); },
    };
    const binding = { portfolio_id: portfolio.id, owner_subject: portfolio.owner_subject, kind: portfolio.kind,
      opening_id: opening.id, opening_revision: opening.revision };
    // Reuse exact existing journal/projection rules. Calling get does not create a journal.
    const journal = new TransactionService(this.dependencies.transactions, openings, this.dependencies.instruments, binding, this.dependencies.clock);
    const service = new PortfolioService(openings, this.dependencies.instruments, this.dependencies.clock, undefined, journal);
    return { ...resolved, service, valuation: new ValuationService(service, this.dependencies.quotations, reference) };
  }
  async state(principal: Principal | null, id: unknown) {
    const { portfolio, service } = await this.services(principal, id);
    return { portfolio, read_only: true as const, state: await service.current(principal, portfolio.id) };
  }
  async valuation(principal: Principal | null, id: unknown, input: unknown) {
    requirePermission(principal, 'portfolio:read');
    requirePermission(principal, 'quotes:read');
    const { portfolio, valuation } = await this.services(principal, id);
    return { portfolio, read_only: true as const, valuation: await valuation.current(principal, portfolio.id, input) };
  }
}
