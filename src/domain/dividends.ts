import { exactDecimalSchema } from './decimals';
import { TransactionRuleError, type TransactionEvent } from './transactions';

function cents(value: string) {
  const parsed = exactDecimalSchema(2).parse(value);
  if (parsed.startsWith('-')) throw new TransactionRuleError('invalid_dividend_amount');
  const [whole, tail = ''] = parsed.split('.');
  return BigInt(whole! + tail.padEnd(2, '0'));
}
function amount(value: bigint) {
  const digits = value.toString().padStart(3, '0');
  const tail = digits.slice(-2).replace(/0+$/, '');
  return digits.slice(0, -2) + (tail ? `.${tail}` : '');
}

/** Summarizes recorded received cash, not tax, gross entitlements or historical performance.
 * Aggregate totals may exceed individual balance precision after repeated receipts/withdrawals;
 * integer addition stays exact without imposing a new rounding or overflow rule on valid reads.
 */
export function summarizeDividends(events: readonly TransactionEvent[], portfolioId: string) {
  let received = 0n; let reversed = 0n; let reversalCount = 0;
  const payments = new Map<string, bigint>();
  const reversals = new Set<string>();
  for (const event of events) {
    if (event.portfolio_id !== portfolioId) throw new TransactionRuleError('dividend_projection_mismatch');
    if (event.input.type === 'dividend') {
      if (payments.has(event.id)) throw new TransactionRuleError('dividend_projection_mismatch');
      const value = cents(event.input.amount);
      payments.set(event.id, value); received += value;
    } else if (event.input.type === 'reversal' && payments.has(event.input.reversal_of)) {
      if (reversals.has(event.input.reversal_of)) throw new TransactionRuleError('dividend_projection_mismatch');
      reversed += payments.get(event.input.reversal_of)!; reversals.add(event.input.reversal_of); reversalCount += 1;
    }
  }
  return { currency: 'EUR' as const, scope: 'recorded_since_opening' as const, amount_basis: 'cash_received' as const,
    received: amount(received), reversed: amount(reversed), net_received: amount(received - reversed),
    payments: payments.size, reversals: reversalCount };
}
