import { z } from 'zod';

/** Stable UUID format used to identify an instrument across application boundaries. */
export const instrumentIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

/** Checks the ISIN shape and its Luhn check digit without normalizing caller input.
 * @param value - Candidate ISIN in its required uppercase representation.
 * @returns Whether the value has a valid format and check digit.
 */
export function validIsin(value: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;
  const digits = [...value].map(char => /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char).join('');
  let sum = 0;
  for (let i = digits.length - 1, multiplier = 1; i >= 0; i--, multiplier = 3 - multiplier) {
    const digit = Number(digits[i]) * multiplier;
    sum += digit > 9 ? digit - 9 : digit;
  }
  return sum % 10 === 0;
}

const name = z.string()
  .regex(/^(?!.*[\u0000-\u001F\u007F-\u009F])\S(?:.*\S)?$/u)
  .refine(value => [...value].length <= 160 && value === value.trim());
const metadata = {
  name,
  kind: z.enum(['stock', 'etf']),
  isin: z.string().refine(validIsin).nullable().default(null),
  quote_currency: z.string().regex(/^[A-Z]{3}$/),
  price_unit: z.enum(['currency_unit', 'hundredth_currency_unit']),
  exchange_mic: z.string().regex(/^[A-Z0-9]{4}$/).nullable().default(null),
  provider_symbol: z.string().min(1).max(64).regex(/^[A-Za-z0-9.^=:_-]+$/).nullable().default(null),
  active: z.boolean().default(true),
};

/** Metadata accepted when an administrator adds an instrument to the catalog. */
export const createInstrumentSchema = z.object(metadata).strict();
/** Mutable catalog fields; identity, ISIN, currency, and quote unit remain immutable.
 * @remarks An update must change at least one of the allowed mutable fields.
 */
export const updateInstrumentSchema = z.object({ name: name.optional(), active: z.boolean().optional() })
  .strict().refine(value => value.name !== undefined || value.active !== undefined);
/** Persisted catalog record, including optimistic-concurrency and audit fields. */
export const instrumentSchema = z.object({
  id: instrumentIdSchema,
  ...metadata,
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();
export type Instrument = z.output<typeof instrumentSchema>;
export type CreateInstrument = z.output<typeof createInstrumentSchema>;
export type UpdateInstrument = z.output<typeof updateInstrumentSchema>;
