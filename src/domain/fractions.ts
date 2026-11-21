/** Internal exact arithmetic shared by cost and gains. Wire values remain strings. */
export interface Fraction { n: bigint; d: bigint }
export const zero: Fraction = { n: 0n, d: 1n };
export function ratio(n: bigint, d = 1n): Fraction {
  if (d <= 0n) throw new RangeError('Invalid fraction denominator');
  let a = n < 0n ? -n : n; let b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}
/** Accepts already validated/generated finite decimals, including exact market-value products. */
export function parseFraction(value: string): Fraction {
  if (value.length > 128 || !/^-?[0-9]+(?:\.[0-9]{1,26})?$/.test(value)) throw new RangeError('Invalid financial decimal');
  const negative = value.startsWith('-');
  const [whole, tail = ''] = value.replace(/^-/, '').split('.');
  return ratio(BigInt(whole! + tail) * (negative ? -1n : 1n), 10n ** BigInt(tail.length));
}
export const add = (a: Fraction, b: Fraction) => ratio(a.n * b.d + b.n * a.d, a.d * b.d);
export const negate = (a: Fraction) => ({ n: -a.n, d: a.d });
export const multiply = (a: Fraction, b: Fraction) => ratio(a.n * b.n, a.d * b.d);
export const divide = (a: Fraction, b: Fraction) => ratio(a.n * b.d, a.d * b.n);
export const equal = (a: Fraction, b: Fraction) => a.n === b.n && a.d === b.d;

/** Signed half-even representation at 18 decimal places; exact fraction is never rounded. */
export function fractionValue(value: Fraction) {
  const negative = value.n < 0n;
  const scaled = (negative ? -value.n : value.n) * 10n ** 18n;
  let units = scaled / value.d;
  const remainder = scaled % value.d;
  if (remainder * 2n > value.d || remainder * 2n === value.d && units % 2n === 1n) units += 1n;
  const digits = units.toString().padStart(19, '0');
  const tail = digits.slice(-18).replace(/0+$/, '');
  return { value: (negative && units !== 0n ? '-' : '') + digits.slice(0, -18) + (tail ? `.${tail}` : ''),
    exact: { numerator: value.n.toString(), denominator: value.d.toString() }, rounded: remainder !== 0n };
}
export const availableFraction = (value: Fraction) => ({ status: 'available' as const, ...fractionValue(value) });
