import { z } from 'zod';
import { exactDecimalSchema } from './decimals';
import { quotationSelectorSchema } from './quotations';

/** Provider and quote type selected for a valuation, optionally pinned to a state revision.
 * @remarks Selection is explicit; omitting a revision asks the application for its current opening state.
 */
export const valuationQuerySchema = quotationSelectorSchema.omit({ instrument_id: true }).extend({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();

// Finite decimal products/sums only. BigInt stays inside the calculation boundary,
// never in JSON/D1. Inputs have <=30 significant / 12 fractional digits. Even 100
// maximal position products sum exactly, with no intermediate precision loss.
function parts(value: string) {
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value) || value.length > 128) throw new RangeError('Invalid valuation decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 26) throw new RangeError('Invalid valuation scale');
  return { coefficient: BigInt(whole! + fraction), scale: fraction.length };
}
function decimal(coefficient: bigint, scale: number) {
  const digits = coefficient.toString().padStart(scale + 1, '0');
  if (!scale) return digits;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return digits.slice(0, -scale) + (fraction ? `.${fraction}` : '');
}
/** Multiplies exact quantity and price, applying the declared quote unit without rounding.
 * @param quantity - Non-negative holding quantity as a decimal string.
 * @param price - Positive provider price as a decimal string.
 * @param unit - Whether the provider price is in currency units or hundredths of a unit.
 * @returns Exact market value as a decimal string, before display rounding.
 * @remarks Hundredth-unit prices are divided by 100; all arithmetic remains integer-backed.
 */
export function positionMarketValue(quantity: string, price: string, unit: 'currency_unit' | 'hundredth_currency_unit') {
  const input = exactDecimalSchema(12);
  const q = parts(input.parse(quantity));
  const p = parts(input.parse(price));
  return decimal(q.coefficient * p.coefficient, q.scale + p.scale + (unit === 'hundredth_currency_unit' ? 2 : 0));
}
/** Adds exact decimal amounts before any display rounding.
 * @param values - Exact non-negative decimal amounts to aggregate.
 * @returns Their exact sum as a decimal string.
 */
export function sumMarketValues(values: readonly string[]) {
  if (values.length > 101) throw new RangeError('Valuation sum exceeds portfolio bounds');
  const parsed = values.map(parts);
  const scale = Math.max(0, ...parsed.map(value => value.scale));
  return decimal(parsed.reduce((sum, value) => sum + value.coefficient * 10n ** BigInt(scale - value.scale), 0n), scale);
}
/** Formats an exact EUR amount to cents using the approved half-even rule.
 * @param exact - Unrounded aggregate amount in EUR.
 * @returns Both the unchanged exact value and its two-decimal display form.
 * @remarks Call only after aggregating unrounded position values to avoid cumulative rounding drift.
 */
export function eurAmount(exact: string) {
  const { coefficient, scale } = parts(exact);
  let cents: bigint;
  if (scale <= 2) cents = coefficient * 10n ** BigInt(2 - scale);
  else {
    const divisor = 10n ** BigInt(scale - 2);
    cents = coefficient / divisor;
    const remainder = coefficient % divisor;
    if (remainder * 2n > divisor || remainder * 2n === divisor && cents % 2n === 1n) cents += 1n;
  }
  const digits = cents.toString().padStart(3, '0');
  return { exact, display: `${digits.slice(0, -2)}.${digits.slice(-2)}`, currency: 'EUR' as const };
}
