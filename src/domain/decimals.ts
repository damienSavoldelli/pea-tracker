import { z } from 'zod';

// INSTALL's wire/storage boundary only: no arithmetic or rounding. Sign policy
// belongs to each financial field, not this reusable representation validator.
export function exactDecimalSchema(maximumScale: number) {
  if (!Number.isInteger(maximumScale) || maximumScale < 0 || maximumScale > 18) {
    throw new RangeError('Unsupported decimal scale');
  }
  return z.string().max(64).superRefine((value, context) => {
    if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(value)) {
      context.addIssue({ code: 'custom', message: 'Expected a plain decimal string' });
      return;
    }
    const unsigned = value.replace(/^-/, '');
    const [integer, fraction = ''] = unsigned.split('.');
    const significantDigits = (integer! + fraction).replace(/^0+/, '').length || 1;
    if (fraction.length > maximumScale) {
      context.addIssue({ code: 'custom', message: 'Decimal scale exceeds field limit' });
    }
    if (significantDigits > 30) {
      context.addIssue({ code: 'custom', message: 'Decimal exceeds 30 significant digits' });
    }
  }).transform(value => {
    const negative = value.startsWith('-');
    const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
    const whole = integer!.replace(/^0+/, '') || '0';
    const tail = fraction.replace(/0+$/, '');
    const magnitude = tail ? `${whole}.${tail}` : whole;
    return negative && magnitude !== '0' ? `-${magnitude}` : magnitude;
  });
}
