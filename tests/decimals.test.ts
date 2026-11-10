import { describe, expect, it } from 'vitest';
import { exactDecimalSchema } from '../src/domain/decimals';

describe('exact decimal input boundary (synthetic values)', () => {
  const quantity = exactDecimalSchema(12);
  const eurCash = exactDecimalSchema(2);

  it.each([
    ['0003.1200', '3.12'], ['-0003.1200', '-3.12'],
    ['-0', '0'], ['-000.0000', '0'], ['000', '0'],
    ['0.000000000001', '0.000000000001'],
    ['999999999999999999.123456789012', '999999999999999999.123456789012'],
    ['9007199254740993', '9007199254740993'],
  ])('canonicalizes %s without numeric coercion', (input, expected) => {
    expect(quantity.parse(input)).toBe(expected);
    expect(quantity.parse(expected)).toBe(expected);
    expect(JSON.parse(JSON.stringify({ value: quantity.parse(input) }))).toEqual({ value: expected });
  });

  it.each([1, null, undefined, true, '', 'NaN', 'Infinity', '1e3', '+1', '.1', '1.', '1,2', ' 1', '1 ', '1\n', '0x10'])
    ('rejects non-plain-decimal input %j', input => {
      expect(quantity.safeParse(input).success).toBe(false);
    });

  it('rejects excess input scale, including trailing zeros, without rounding', () => {
    expect(eurCash.parse('1.20')).toBe('1.2');
    expect(eurCash.safeParse('1.200').success).toBe(false);
    expect(quantity.safeParse('0.0000000000001').success).toBe(false);
    expect(quantity.safeParse('1.0000000000000').success).toBe(false);
  });

  it('enforces significant digits before canonicalization', () => {
    expect(quantity.parse('123456789012345678901234567890')).toBe('123456789012345678901234567890');
    expect(quantity.safeParse('1234567890123456789012345678901').success).toBe(false);
    expect(quantity.safeParse('123456789012345678901234567890.0').success).toBe(false);
    expect(quantity.parse('000000000000000000000000000001')).toBe('1');
  });

  it('preserves null versus zero and bounds input size', () => {
    expect(quantity.nullable().parse(null)).toBeNull();
    expect(quantity.parse('0')).toBe('0');
    expect(quantity.safeParse('0'.repeat(65)).success).toBe(false);
  });

  it('supports configured integer/FX scales and rejects invalid schema settings', () => {
    expect(exactDecimalSchema(0).safeParse('1.0').success).toBe(false);
    expect(exactDecimalSchema(18).parse('0.000000000000000001')).toBe('0.000000000000000001');
    for (const scale of [-1, 1.5, 19, Number.NaN]) expect(() => exactDecimalSchema(scale)).toThrow(RangeError);
  });
});
