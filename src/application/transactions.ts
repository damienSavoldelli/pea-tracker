import { z } from 'zod';
import { applyTransaction, initialJournalBalances, journalBindingSchema, portfolioIdSchema, transactionInputSchema, TransactionRuleError, type JournalBinding, type TransactionInput } from '../domain/transactions';
import type { TransactionRepository } from '../ports/transactions';
import type { PortfolioRepository } from '../ports/portfolio';
import type { InstrumentRepository } from '../ports/instruments';
import { requirePermission, type Permission, type Principal } from './authorization';
import { ApplicationError } from './errors';

function parse<T>(schema: z.ZodType<T>, input: unknown, status: 400 | 422 = 422): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApplicationError(status, status === 400 ? 'invalid_request' : 'invalid_transaction');
  return result.data;
}
function domain<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    if (error instanceof TransactionRuleError) throw new ApplicationError(409, error.code);
    throw error;
  }
}

/** One explicitly bound portfolio; projects journal balances without modifying the V1 opening repository. */
export class TransactionService {
  private readonly binding: JournalBinding;
  constructor(private readonly repository: TransactionRepository,
    private readonly openings: Pick<PortfolioRepository, 'get'>,
    private readonly instruments: Pick<InstrumentRepository, 'get'>, binding: JournalBinding,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly id: () => string = () => crypto.randomUUID()) {
    this.binding = journalBindingSchema.parse(binding);
  }
  private authorize(principal: Principal | null, portfolioId: unknown, permission: Permission): asserts principal is Principal {
    // portfolio:write is a financial capability, never infrastructure administration.
    requirePermission(principal, permission === 'portfolio:admin' && principal?.permissions.includes('portfolio:write') ? 'portfolio:write' : permission);
    const selected = parse(portfolioIdSchema, portfolioId, 400);
    if (principal.subject !== this.binding.owner_subject || selected !== this.binding.portfolio_id) {
      throw new ApplicationError(403, 'portfolio_access_denied');
    }
  }
  private async state() {
    const opening = await this.openings.get(this.binding.opening_revision);
    if (!opening) throw new ApplicationError(404, 'opening_state_not_found');
    const initial = domain(() => initialJournalBalances(this.binding, opening));
    const stream = await this.repository.get(this.binding.portfolio_id);
    if (stream.balances && (stream.balances.opening_id !== initial.opening_id ||
        stream.balances.opening_revision !== initial.opening_revision || stream.balances.kind !== this.binding.kind)) throw new ApplicationError(409, 'opening_anchor_mismatch');
    return { events: stream.events, balances: stream.balances ?? initial };
  }
  async get(principal: Principal | null, portfolioId: unknown) {
    this.authorize(principal, portfolioId, 'portfolio:read');
    return this.state();
  }
  private async validateInstrument(transaction: TransactionInput) {
    if (transaction.type === 'buy' || transaction.type === 'sell' || transaction.type === 'dividend') {
      if (transaction.instrument_id !== undefined) {
        const instrument = await this.instruments.get(transaction.instrument_id);
        if (!instrument) throw new ApplicationError(422, 'unknown_instrument');
        if (transaction.type !== 'dividend' && instrument.quote_currency !== 'EUR') throw new ApplicationError(422, 'unsupported_transaction_currency');
        return instrument;
      }
    }
  }
  /** Read-only simulation through the same financial rules used by append. No outcome is persisted. */
  async preview(principal: Principal | null, portfolioId: unknown, input: unknown) {
    this.authorize(principal, portfolioId, 'portfolio:admin');
    const transaction = parse(transactionInputSchema, input);
    const state = await this.state();
    if (state.balances.version >= 1000) throw new ApplicationError(409, 'journal_capacity_exceeded');
    const instrument = await this.validateInstrument(transaction);
    const outcome = domain(() => applyTransaction(state.balances, state.events, transaction,
      { id: this.id(), recorded_at: this.clock(), actor: principal.subject }));
    const affected = instrument ?? (outcome.event.instrument_id ? await this.instruments.get(outcome.event.instrument_id) : null);
    return { input: transaction, expected_version: state.balances.version, before: state.balances,
      after: outcome.balances, cash_delta: outcome.event.cash_delta, instrument_id: outcome.event.instrument_id,
      instrument: affected ? { id: affected.id, name: affected.name, isin: affected.isin, provider_symbol: affected.provider_symbol } : null,
      quantity_delta: outcome.event.quantity_delta };
  }
  async append(principal: Principal | null, portfolioId: unknown, input: unknown, expected: unknown, key: unknown) {
    this.authorize(principal, portfolioId, 'portfolio:admin');
    const version = parse(z.number().int().min(0).max(1000), expected, 400);
    const replayKey = parse(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), key, 400);
    const transaction = parse(transactionInputSchema, input);
    const replay = { subject: principal.subject, key: replayKey,
      canonical_input: JSON.stringify({ binding: this.binding, expected: version, input: transaction }) };
    const prior = await this.repository.replay(this.binding.portfolio_id, replay);
    if (prior) return prior;
    if (version >= 1000) throw new ApplicationError(409, 'journal_capacity_exceeded');
    const state = await this.state();
    if (version !== state.balances.version) throw new ApplicationError(412, 'version_mismatch');
    await this.validateInstrument(transaction);
    const outcome = domain(() => applyTransaction(state.balances, state.events, transaction,
      { id: this.id(), recorded_at: this.clock(), actor: principal.subject }));
    return this.repository.append(this.binding.portfolio_id, version, outcome, replay);
  }
  /** Resolve an already consumed approval after a retry/crash, without ever appending. */
  async recorded(principal: Principal | null, portfolioId: string, input: unknown, expected: number, key: string) {
    this.authorize(principal, portfolioId, 'portfolio:admin');
    const transaction = parse(transactionInputSchema, input);
    return this.repository.replay(this.binding.portfolio_id, { subject: principal.subject, key,
      canonical_input: JSON.stringify({ binding: this.binding, expected, input: transaction }) });
  }
}
