import { describe, expect, it } from 'vitest';
import { positionMarketValue, sumMarketValues, eurAmount } from '../src/domain/valuation';

describe('exact EUR valuation arithmetic', () => {
  it.each([
    ['3', '0.10', 'currency_unit', '0.3'],
    ['3', '10', 'hundredth_currency_unit', '0.3'],
    ['0.000000000001', '0.000000000001', 'hundredth_currency_unit', '0.00000000000000000000000001'],
    ['9007199254740993', '9007199254740993', 'currency_unit', '81129638414606699710187514626049'],
  ] as const)('computes %s × %s (%s) exactly', (quantity, price, unit, exact) => {
    expect(positionMarketValue(quantity, price, unit)).toBe(exact);
  });
  it.each([['1.005', '1.00'], ['1.015', '1.02'], ['1.025', '1.02'], ['1.035', '1.04'], ['9.995', '10.00'], ['0', '0.00'], ['0.00501', '0.01'], ['0.00499', '0.00']])
    ('rounds %s half-even to %s', (exact, display) => expect(eurAmount(exact).display).toBe(display));
  it('sums exact products before rounding each aggregate', () => {
    expect(eurAmount('0.005').display).toBe('0.00');
    expect(eurAmount(sumMarketValues(['0.005', '0.005'])).display).toBe('0.01');
    expect(sumMarketValues(['1', '0.00000000000000000000000001'])).toBe('1.00000000000000000000000001');
    expect(sumMarketValues([])).toBe('0');
  });
  it('retains exact maximal products and a hundred-position aggregate', () => {
    const maximum = '999999999999999999999999999999';
    const value = positionMarketValue(maximum, maximum, 'currency_unit');
    const expected = (BigInt(maximum) ** 2n * 100n).toString();
    expect(sumMarketValues(Array(100).fill(value))).toBe(expected);
  });
  it.each(['-1', '1e3', 'NaN', '0.0000000000001', '9'.repeat(31)])('rejects invalid input %s without rounding', input => {
    expect(() => positionMarketValue(input, '1', 'currency_unit')).toThrow();
  });
});
