import { z } from 'zod';
import { exactDecimalSchema } from './decimals';
import { instrumentIdSchema } from './instruments';

const text = z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f-\u009f]+$/u);
export const provenanceSchema = z.object({ source: text, reference: text.nullable() }).strict();
const unsigned = (scale: number) => exactDecimalSchema(scale).refine(value => !value.startsWith('-'), 'Negative opening values are unsupported');
export const openingPositionSchema = z.object({
  instrument_id: instrumentIdSchema,
  quantity: unsigned(12).refine(value => value !== '0', 'Omit zero-quantity positions'),
  declared_pru: unsigned(12),
  currency: z.string().regex(/^[A-Z]{3}$/),
  provenance: provenanceSchema,
}).strict();
const cashSchema = z.object({ currency: z.literal('EUR'), amount: unsigned(2) }).strict();
export const openingInputSchema = z.object({
  effective_at: z.string().datetime(),
  provenance: provenanceSchema,
  positions: z.array(openingPositionSchema).max(100),
  // Unknown cash is null, never silently zero. Non-EUR cash/FX is not supported.
  cash: cashSchema.nullable(),
  correction_reason: text.nullable(),
}).strict().superRefine((value, context) => {
  const ids = value.positions.map(item => item.instrument_id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['positions'], message: 'Duplicate instrument' });
});
export const openingStateSchema = openingInputSchema.safeExtend({
  id: instrumentIdSchema,
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  recorded_at: z.string().datetime(),
});
export type OpeningInput = z.output<typeof openingInputSchema>;
export type OpeningState = z.output<typeof openingStateSchema>;

export const positionPageSchema = z.object({
  revision: z.number().int().min(1), effective_at: z.string().datetime(),
  data: z.array(openingPositionSchema),
  page: z.object({ next_cursor: z.string().nullable() }).strict(),
  history: z.object({ performance_available: z.literal(false), reason: z.literal('opening_state_only') }).strict(),
}).strict();
