import { z } from 'zod';
import { openingInputSchema, openingStateSchema } from '../domain/portfolio';
import type { PortfolioRepository } from '../ports/portfolio';
import type { InstrumentRepository } from '../ports/instruments';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';
import type { TransactionService } from './transactions';
import { costBasisPolicy, projectFinancialState } from '../domain/cost-basis';
import { TransactionRuleError } from '../domain/transactions';
import { summarizeDividends } from '../domain/dividends';
import { summarizeExternalFlows } from '../domain/performance';
import type { OperationalOpeningRepository } from '../ports/operational-opening';

function parse<T>(schema: z.ZodType<T>, input: unknown, status: 400 | 422 = 422): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApplicationError(status, status === 400 ? 'invalid_request' : 'invalid_opening_state',
    [...new Set(result.error.issues.map(issue => issue.path.join('.')).filter(Boolean))].slice(0, 20));
  return result.data;
}
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const list = z.object({ limit: z.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(256).optional() }).strict();
const cursor = z.object({ version: z.literal(1), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), offset: z.number().int().min(1).max(99) }).strict();
const encode = (revision: number, offset: number) => btoa(JSON.stringify({ version: 1, revision, offset })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Manages immutable dated opening-state revisions and revision-pinned position reads. */
export class PortfolioService {
  constructor(private readonly repository: PortfolioRepository, private readonly instruments: InstrumentRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly id: () => string = () => crypto.randomUUID(),
    private readonly journal?: Pick<TransactionService, 'get'>,
    private readonly operational?: Pick<OperationalOpeningRepository, 'get'>) {}

  /** Reads one captured journal version as current quantities and cash; opening declarations remain immutable.
   * Current cost/PRU is derived separately; historical declarations remain unchanged.
   */
  async current(principal: Principal | null, portfolioId: unknown) {
    return (await this.currentSnapshot(principal, portfolioId)).state;
  }

  /** Shared snapshot for consistent downstream valuation/flow calculations; events are not a public DTO. */
  async currentSnapshot(principal: Principal | null, portfolioId: unknown) {
    requirePermission(principal, 'portfolio:read');
    if (!this.journal) throw new ApplicationError(503, 'portfolio_journal_unavailable');
    const { balances, events } = await this.journal.get(principal, portfolioId);
    const reference = this.operational ? await this.operational.get() : null;
    if (this.operational && !reference) throw new ApplicationError(503, 'operational_opening_unavailable');
    const opening = reference?.opening ?? await this.get(principal, balances.opening_revision);
    if (opening.id !== balances.opening_id) throw new ApplicationError(409, 'opening_anchor_mismatch');
    const evaluatedAt = this.clock();
    if (balances.last_effective_at > evaluatedAt) throw new ApplicationError(409, 'portfolio_state_after_evaluation');
    let financial: ReturnType<typeof projectFinancialState>;
    try { financial = projectFinancialState(opening, events, balances); }
    catch (error) {
      if (error instanceof TransactionRuleError) throw new ApplicationError(409, error.code);
      throw error;
    }
    const positions = balances.positions.map(position => ({ ...position, currency: 'EUR' as const, ...financial.costs.get(position.instrument_id)! }));
    const available = positions.filter(position => position.pru.status === 'available').length;
    const state = {
      view: 'current_projected' as const, portfolio_id: balances.portfolio_id, kind: balances.kind, evaluated_at: evaluatedAt,
      opening_state: { id: opening.id, revision: opening.revision, effective_at: opening.effective_at,
        recorded_at: opening.recorded_at, provenance: opening.provenance, cash: opening.cash },
      ...(reference ? { operational_reference: { id: opening.id, reason: reference.reason,
        historical_opening: { id: reference.historical_opening_id, revision: reference.historical_opening_revision },
        cash_provenance: reference.cash_provenance, prior_performance_available: false as const } } : {}),
      journal: { version: balances.version, last_effective_at: balances.last_effective_at },
      positions,
      cash: { ...balances.cash }, holdings_basis: 'opening_state_and_transactions' as const,
      cost_basis_status: available === positions.length ? 'computed' as const : available ? 'partial' as const : 'unavailable' as const,
      cost_basis_policy: costBasisPolicy,
      dividends: summarizeDividends(events, balances.portfolio_id),
      realized: financial.realized,
      cash_flows: summarizeExternalFlows(events, balances.portfolio_id),
      history: { performance_available: false as const, reason: 'performance_not_computed' as const },
    };
    return { state, events };
  }

  /** Loads one opening-state revision.
   * @param principal - Authenticated caller with `portfolio:read` permission.
   * @param revision - Optional positive revision number; omission selects the current state.
   * @returns The complete immutable opening-state revision.
   * @throws {ApplicationError} If authorization or revision validation fails, or no such state exists.
   */
  async get(principal: Principal | null, revision?: unknown) {
    requirePermission(principal, 'portfolio:read');
    const selected = revision === undefined ? undefined : parse(z.number().int().positive().max(Number.MAX_SAFE_INTEGER), revision, 400);
    const state = await this.repository.get(selected);
    if (!state) throw new ApplicationError(404, 'opening_state_not_found');
    return state;
  }

  /** Appends a complete initial state or correction as a new immutable revision.
   * @param principal - Authenticated administrator whose subject scopes the idempotency record.
   * @param input - Full dated portfolio state, including its declared provenance and known cash.
   * @param expected - Current revision expected by the caller; zero is used only for initialization.
   * @param key - Stable idempotency key for safely retrying the same append.
   * @returns The newly stored revision or the original result of an idempotent replay.
   * @throws {ApplicationError} If authorization, validation, referenced-instrument, or concurrency checks fail.
   * @remarks Corrections replace the complete snapshot; they do not represent trades or reconstruct historical cost.
   */
  async append(principal: Principal | null, input: unknown, expected: unknown, key: unknown) {
    requirePermission(principal, 'portfolio:admin');
    const expectedRevision = parse(version, expected, 400);
    const idempotencyKey = parse(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), key, 400);
    const data = parse(openingInputSchema, input);
    // Every line inherits this declared reference timestamp. No trade/settlement
    // inference, cost reconstruction or prior transaction is introduced.
    data.effective_at = new Date(data.effective_at).toISOString();
    data.positions.sort((a, b) => a.instrument_id < b.instrument_id ? -1 : a.instrument_id > b.instrument_id ? 1 : 0);
    if ((expectedRevision === 0) !== (data.correction_reason === null)) throw new ApplicationError(422, 'invalid_correction_reason');
    for (const position of data.positions) {
      if (!await this.instruments.get(position.instrument_id)) throw new ApplicationError(422, 'unknown_instrument');
    }
    const recordedAt = this.clock();
    if (data.effective_at > recordedAt) throw new ApplicationError(422, 'future_opening_state');
    const state = openingStateSchema.parse({ ...data, id: this.id(), revision: expectedRevision + 1, recorded_at: recordedAt });
    return this.repository.append(state, expectedRevision, { subject: principal.subject, key: idempotencyKey, canonicalInput: JSON.stringify({ expected: expectedRevision, input: data }) });
  }

  /** Lists a page of positions from one pinned opening-state revision.
   * @param principal - Authenticated caller with `portfolio:read` permission.
   * @param input - Page size and optional opaque cursor containing the revision and offset.
   * @returns Position data, continuation cursor, and explicit unavailability of historical performance.
   * @throws {ApplicationError} If authorization, query validation, or cursor validation fails.
   * @remarks Every page stays on the cursor's revision even if a newer opening state is appended.
   */
  async positions(principal: Principal | null, input: unknown) {
    requirePermission(principal, 'portfolio:read');
    const query = parse(list, input, 400);
    let selected: z.output<typeof cursor> | undefined;
    if (query.cursor) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
        selected = cursor.parse(JSON.parse(atob(query.cursor.replace(/-/g, '+').replace(/_/g, '/'))));
        if (encode(selected.revision, selected.offset) !== query.cursor) throw new Error();
      } catch { throw new ApplicationError(400, 'invalid_cursor'); }
    }
    const state = await this.get(principal, selected?.revision);
    const offset = selected?.offset ?? 0;
    if (offset > 0 && offset >= state.positions.length) throw new ApplicationError(400, 'invalid_cursor');
    const data = state.positions.slice(offset, offset + query.limit);
    return { revision: state.revision, effective_at: state.effective_at, data,
      page: { next_cursor: offset + data.length < state.positions.length ? encode(state.revision, offset + data.length) : null },
      history: { performance_available: false as const, reason: 'opening_state_only' as const } };
  }
}
