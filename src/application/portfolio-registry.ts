import { z } from 'zod';
import { portfolioRegistrationSchema, registeredPortfolioSchema } from '../domain/portfolio-registry';
import { openingStateSchema } from '../domain/portfolio';
import { portfolioIdSchema } from '../domain/transactions';
import type { PortfolioRegistryRepository } from '../ports/portfolio-registry';
import type { InstrumentRepository } from '../ports/instruments';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';

/** Unmounted internal administration. No HTTP/MCP adapter or default owner. */
export class PortfolioRegistryService {
  constructor(private readonly repository: PortfolioRegistryRepository,
    private readonly instruments: Pick<InstrumentRepository, 'get'>,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly id: () => string = () => crypto.randomUUID()) {}

  async create(principal: Principal | null, input: unknown) {
    requirePermission(principal, 'portfolio:admin');
    const parsed = portfolioRegistrationSchema.safeParse(input);
    if (!parsed.success) throw new ApplicationError(422, 'invalid_portfolio_registration');
    const { name, kind, opening: initial } = parsed.data;
    const at = this.clock();
    if (Date.parse(initial.effective_at) > Date.parse(at)) throw new ApplicationError(422, 'future_opening_state');
    for (const position of initial.positions) {
      const instrument = await this.instruments.get(position.instrument_id);
      if (!instrument) throw new ApplicationError(422, 'unknown_instrument');
      if (instrument.quote_currency !== 'EUR') throw new ApplicationError(422, 'unsupported_opening_currency');
    }
    const opening = openingStateSchema.parse({ ...initial, effective_at: new Date(initial.effective_at).toISOString(),
      positions: [...initial.positions].sort((a, b) => a.instrument_id.localeCompare(b.instrument_id)),
      id: this.id(), revision: 1, recorded_at: at });
    const portfolio = registeredPortfolioSchema.parse({ id: this.id(), owner_subject: principal.subject, name, kind,
      status: 'active', version: 1, opening: { source: 'independent', id: opening.id, revision: 1 }, created_at: at, updated_at: at });
    return this.repository.create(portfolio, opening);
  }
  async get(principal: Principal | null, id: unknown) {
    requirePermission(principal, 'portfolio:read');
    const selected = portfolioIdSchema.safeParse(id);
    if (!selected.success) throw new ApplicationError(400, 'invalid_portfolio_id');
    const row = await this.repository.get(principal.subject, selected.data);
    if (!row) throw new ApplicationError(404, 'portfolio_not_found');
    return row;
  }
  async list(principal: Principal | null, input: unknown = {}) {
    requirePermission(principal, 'portfolio:read');
    const query = z.object({ limit: z.number().int().min(1).max(100).default(50), after: portfolioIdSchema.optional() }).strict().safeParse(input);
    if (!query.success) throw new ApplicationError(400, 'invalid_query');
    return this.repository.list(principal.subject, query.data.limit, query.data.after);
  }
  async opening(principal: Principal | null, id: unknown) {
    const row = await this.get(principal, id);
    const opening = await this.repository.opening(row.owner_subject, row.id);
    if (!opening || opening.id !== row.opening.id || opening.revision !== row.opening.revision)
      throw new ApplicationError(409, 'opening_anchor_mismatch');
    return opening;
  }
  async archive(principal: Principal | null, id: unknown, expected: unknown) {
    requirePermission(principal, 'portfolio:admin');
    const row = await this.get(principal, id);
    const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1).safeParse(expected);
    if (!version.success) throw new ApplicationError(400, 'invalid_version');
    return this.repository.archive(row.owner_subject, row.id, version.data, this.clock());
  }
}
