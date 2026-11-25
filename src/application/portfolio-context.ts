import { PortfolioRegistryService } from './portfolio-registry';
import type { PortfolioRegistryRepository } from '../ports/portfolio-registry';
import type { InstrumentRepository } from '../ports/instruments';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';

/** Shared server resolution; client UUIDs never grant ownership or financial permission. */
export class PortfolioContextService {
  private readonly registry: PortfolioRegistryService;
  constructor(repository: PortfolioRegistryRepository, instruments: InstrumentRepository) {
    this.registry = new PortfolioRegistryService(repository, instruments);
  }
  async resolve(principal: Principal | null, id: unknown, mode: 'read' | 'write' | 'approve' = 'read') {
    requirePermission(principal, 'portfolio:read');
    if (mode !== 'read') requirePermission(principal, mode === 'write' ? 'portfolio:write' : 'portfolio:approve');
    const portfolio = await this.registry.get(principal, id);
    if (mode !== 'read' && portfolio.status !== 'active') throw new ApplicationError(403, 'portfolio_archived');
    const opening = await this.registry.opening(principal, portfolio.id);
    return { portfolio, opening, binding: { portfolio_id: portfolio.id, owner_subject: portfolio.owner_subject,
      kind: portfolio.kind, opening_id: opening.id, opening_revision: opening.revision } };
  }
}
