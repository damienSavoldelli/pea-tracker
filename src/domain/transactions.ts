import { z } from 'zod';
import { exactDecimalSchema } from './decimals';
import { instrumentIdSchema } from './instruments';
import { provenanceSchema, type OpeningState } from './portfolio';

export const portfolioIdSchema = z.string().uuid();
const positive = (scale: number) => exactDecimalSchema(scale).refine(value => value !== '0' && !value.startsWith('-'));
const common = { effective_at: z.string().datetime().transform(value => new Date(value).toISOString()), provenance: provenanceSchema };
const cash = { ...common, currency: z.literal('EUR'), amount: positive(2) };
const fees = exactDecimalSchema(2).refine(value => !value.startsWith('-')).optional();
/** Trade amount is gross, with separately declared fees. Absent fees retain legacy behavior and canonical replay input. */
export const transactionInputSchema = z.discriminatedUnion('type', [
  z.object({ ...cash, type: z.literal('deposit') }).strict(),
  z.object({ ...cash, type: z.literal('withdrawal') }).strict(),
  z.object({ ...cash, type: z.literal('dividend'), instrument_id: instrumentIdSchema.optional() }).strict(),
  z.object({ ...cash, type: z.literal('buy'), instrument_id: instrumentIdSchema, quantity: positive(12), fees }).strict(),
  z.object({ ...cash, type: z.literal('sell'), instrument_id: instrumentIdSchema, quantity: positive(12), fees }).strict(),
  z.object({ ...common, type: z.literal('reversal'), reversal_of: z.string().uuid(),
    reason: z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f-\u009f]+$/u) }).strict(),
]);
export type TransactionInput = z.output<typeof transactionInputSchema>;

/** Trusted composition binds one journal to one immutable V1 opening revision; never select latest implicitly. */
export const journalBindingSchema = z.object({
  portfolio_id: portfolioIdSchema, kind: z.enum(['real', 'simulated']), owner_subject: z.string().min(1).max(128),
  opening_id: z.string().uuid(), opening_revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type JournalBinding = z.output<typeof journalBindingSchema>;
export interface JournalBalances {
  portfolio_id: string; kind: 'real' | 'simulated'; opening_id: string; opening_revision: number; opening_effective_at: string;
  version: number; last_effective_at: string; cash: { currency: 'EUR'; amount: string };
  positions: { instrument_id: string; quantity: string }[]; cost_basis_status: 'not_computed';
}
export interface TransactionEvent {
  id: string; portfolio_id: string; sequence: number; recorded_at: string; actor: string;
  input: TransactionInput; cash_delta: string; instrument_id: string | null; quantity_delta: string | null;
}
export interface TransactionOutcome { event: TransactionEvent; balances: JournalBalances }

/** Validate durable records on the repository boundary; BigInt never crosses JSON or SQL. */
export const transactionOutcomeSchema: z.ZodType<TransactionOutcome> = z.object({
  event: z.object({ id: z.string().uuid(), portfolio_id: portfolioIdSchema,
    sequence: z.number().int().min(1).max(1000), recorded_at: z.string().datetime(), actor: z.string().min(1).max(128),
    input: transactionInputSchema, cash_delta: exactDecimalSchema(2),
    instrument_id: instrumentIdSchema.nullable(), quantity_delta: exactDecimalSchema(12).nullable() }).strict(),
  balances: z.object({ portfolio_id: portfolioIdSchema, kind: z.enum(['real', 'simulated']), opening_id: z.string().uuid(),
    opening_revision: z.number().int().positive(), opening_effective_at: z.string().datetime(),
    version: z.number().int().min(1).max(1000), last_effective_at: z.string().datetime(),
    cash: z.object({ currency: z.literal('EUR'), amount: exactDecimalSchema(2).refine(value => !value.startsWith('-')) }).strict(),
    positions: z.array(z.object({ instrument_id: instrumentIdSchema, quantity: positive(12) }).strict()).max(100),
    cost_basis_status: z.literal('not_computed') }).strict(),
}).strict().refine(value => value.event.portfolio_id === value.balances.portfolio_id &&
  value.event.sequence === value.balances.version && value.event.input.effective_at === value.balances.last_effective_at);

function units(value: string, scale: number): bigint {
  const canonical = exactDecimalSchema(scale).parse(value);
  const [whole, fraction = ''] = canonical.replace(/^-/, '').split('.');
  return BigInt(whole! + fraction.padEnd(scale, '0')) * (canonical.startsWith('-') ? -1n : 1n);
}
function decimal(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, '0');
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  const parsed = exactDecimalSchema(scale).safeParse(sign + digits.slice(0, -scale) + (fraction ? `.${fraction}` : ''));
  if (!parsed.success) fail('balance_precision_exceeded');
  return parsed.data;
}
export class TransactionRuleError extends Error {
  constructor(readonly code: string) { super(code); }
}
function fail(code: string): never { throw new TransactionRuleError(code); }

/** Initializes an isolated projection without altering the declared PRU, positions or cash of V1. */
export function initialJournalBalances(binding: JournalBinding, opening: OpeningState): JournalBalances {
  if (opening.id !== binding.opening_id || opening.revision !== binding.opening_revision) fail('opening_anchor_mismatch');
  if (!opening.cash) fail('opening_cash_unknown');
  if (opening.positions.some(position => position.currency !== 'EUR')) fail('unsupported_opening_currency');
  return { portfolio_id: binding.portfolio_id, kind: binding.kind, opening_id: opening.id, opening_revision: opening.revision,
    opening_effective_at: opening.effective_at, version: 0, last_effective_at: opening.effective_at,
    cash: { ...opening.cash }, positions: opening.positions.map(({ instrument_id, quantity }) => ({ instrument_id, quantity })),
    cost_basis_status: 'not_computed' };
}

/** Applies exact signed movements; equal effective instants are deterministically ordered by sequence. */
export function applyTransaction(balances: JournalBalances, history: readonly TransactionEvent[], input: TransactionInput,
  metadata: { id: string; recorded_at: string; actor: string }): TransactionOutcome {
  if (input.effective_at <= balances.opening_effective_at) fail('transaction_not_after_opening');
  if (input.effective_at < balances.last_effective_at) fail('transaction_out_of_order');
  if (input.effective_at > metadata.recorded_at) fail('future_transaction');
  let cashDelta: bigint;
  let instrumentId: string | null = null;
  let quantityDelta: bigint | null = null;
  if (input.type === 'reversal') {
    const original = history.find(event => event.id === input.reversal_of && event.portfolio_id === balances.portfolio_id);
    if (!original) fail('transaction_not_found');
    if (original.input.type === 'reversal') fail('reversal_of_reversal_unsupported');
    if (history.some(event => event.input.type === 'reversal' && event.input.reversal_of === original.id)) fail('transaction_already_reversed');
    cashDelta = -units(original.cash_delta, 2);
    instrumentId = original.instrument_id;
    quantityDelta = original.quantity_delta === null ? null : -units(original.quantity_delta, 12);
  } else {
    cashDelta = units(input.amount, 2) * (input.type === 'buy' || input.type === 'withdrawal' ? -1n : 1n);
    if (input.type === 'dividend') instrumentId = input.instrument_id ?? null;
    if (input.type === 'buy' || input.type === 'sell') {
      const fee = units(input.fees ?? '0', 2);
      if (input.type === 'sell' && fee > units(input.amount, 2)) fail('negative_sale_proceeds');
      cashDelta -= fee;
      instrumentId = input.instrument_id;
      quantityDelta = units(input.quantity, 12) * (input.type === 'sell' ? -1n : 1n);
    }
  }
  const nextCash = units(balances.cash.amount, 2) + cashDelta;
  if (nextCash < 0n) fail('insufficient_cash');
  const positions = new Map(balances.positions.map(position => [position.instrument_id, units(position.quantity, 12)]));
  if (instrumentId !== null && quantityDelta !== null) {
    const nextQuantity = (positions.get(instrumentId) ?? 0n) + quantityDelta;
    if (nextQuantity < 0n) fail('insufficient_quantity');
    if (nextQuantity === 0n) positions.delete(instrumentId); else positions.set(instrumentId, nextQuantity);
  }
  if (positions.size > 100) fail('position_limit_exceeded');
  const version = balances.version + 1;
  return {
    event: { ...metadata, portfolio_id: balances.portfolio_id, sequence: version, input: structuredClone(input),
      cash_delta: decimal(cashDelta, 2), instrument_id: instrumentId,
      quantity_delta: quantityDelta === null ? null : decimal(quantityDelta, 12) },
    balances: { ...structuredClone(balances), version, last_effective_at: input.effective_at,
      cash: { currency: 'EUR', amount: decimal(nextCash, 2) },
      positions: [...positions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([instrument_id, quantity]) => ({ instrument_id, quantity: decimal(quantity, 12) })) },
  };
}
