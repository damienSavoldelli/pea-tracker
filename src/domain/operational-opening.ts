import { z } from 'zod';
import { openingStateSchema, provenanceSchema } from './portfolio';
import { portfolioIdSchema } from './transactions';

/** One owner-authorized start of the existing real journal, not reconstructed trades. */
export const operationalOpeningSchema = z.object({
  portfolio_id: portfolioIdSchema, owner_subject: z.string().min(1).max(128),
  historical_opening_id: z.string().uuid(), historical_opening_revision: z.number().int().positive(),
  opening: openingStateSchema,
  cash_provenance: provenanceSchema,
  reason: z.string().min(1).max(512),
}).strict().superRefine((value, context) => {
  if (value.opening.revision !== 1 || !value.opening.cash || value.opening.id === value.historical_opening_id ||
      value.opening.positions.some(position => position.currency !== 'EUR') || value.opening.effective_at > value.opening.recorded_at) {
    context.addIssue({ code: 'custom', message: 'Invalid real operational opening' });
  }
});
export type OperationalOpening = z.output<typeof operationalOpeningSchema>;
