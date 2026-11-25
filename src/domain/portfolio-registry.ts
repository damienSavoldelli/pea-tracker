import { z } from 'zod';
import { openingInputSchema, openingStateSchema } from './portfolio';
import { portfolioIdSchema } from './transactions';

const name = z.string().trim().min(1).max(160).regex(/^[^\u0000-\u001f\u007f-\u009f]+$/u);
export const portfolioKindSchema = z.enum(['real', 'simulated']);
export const portfolioRegistrationSchema = z.object({
  name, kind: portfolioKindSchema, opening: openingInputSchema,
}).strict().superRefine((value, context) => {
  if (!value.opening.cash || value.opening.correction_reason !== null || value.opening.positions.some(position => position.currency !== 'EUR'))
    context.addIssue({ code: 'custom', message: 'A new opening requires known EUR cash, EUR holdings and no correction' });
});

/** Opening identity is immutable. Version below belongs only to registry metadata. */
export const registeredPortfolioSchema = z.object({
  id: portfolioIdSchema, owner_subject: z.string().min(1).max(128), name, kind: portfolioKindSchema,
  status: z.enum(['active', 'archived']), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  opening: z.object({ source: z.enum(['independent', 'historical', 'operational']),
    id: z.string().uuid(), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict(),
  created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.updated_at < value.created_at || value.opening.source !== 'historical' && value.opening.revision !== 1 ||
      value.opening.source === 'operational' && value.kind !== 'real')
    context.addIssue({ code: 'custom', message: 'Invalid registry lifecycle or opening binding' });
});
export type RegisteredPortfolio = z.output<typeof registeredPortfolioSchema>;

export function independentOpening(portfolio: RegisteredPortfolio, input: unknown) {
  const opening = openingStateSchema.parse(input);
  if (portfolio.opening.source !== 'independent' || opening.id !== portfolio.opening.id || opening.revision !== 1 ||
      opening.revision !== portfolio.opening.revision || opening.recorded_at !== portfolio.created_at ||
      opening.effective_at > opening.recorded_at || !opening.cash || opening.correction_reason !== null ||
      opening.positions.some(position => position.currency !== 'EUR')) throw new Error('independent_opening_mismatch');
  return opening;
}
