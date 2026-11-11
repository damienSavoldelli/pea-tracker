import { z } from 'zod';
import { exactDecimalSchema } from './decimals';
import { quotationSelectorSchema } from './quotations';

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
export function positionMarketValue(quantity: string, price: string, unit: 'currency_unit' | 'hundredth_currency_unit') {
  const input = exactDecimalSchema(12);
  const q = parts(input.parse(quantity));
  const p = parts(input.parse(price));
  return decimal(q.coefficient * p.coefficient, q.scale + p.scale + (unit === 'hundredth_currency_unit' ? 2 : 0));
}
export function sumMarketValues(values: readonly string[]) {
  if (values.length > 101) throw new RangeError('Valuation sum exceeds portfolio bounds');
  const parsed = values.map(parts);
  const scale = Math.max(0, ...parsed.map(value => value.scale));
  return decimal(parsed.reduce((sum, value) => sum + value.coefficient * 10n ** BigInt(scale - value.scale), 0n), scale);
}
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
