import { z } from 'zod';
import { portfolioIdSchema, transactionInputSchema } from './transactions';

export const financialIntentSchema = z.object({
  portfolio_id: portfolioIdSchema, input: transactionInputSchema,
  expected_version: z.number().int().min(0).max(999),
  opening_id: z.string().uuid(), opening_revision: z.number().int().positive(),
  idempotency_key: z.string().uuid(), prepared_at: z.string().datetime(), expires_at: z.string().datetime(),
}).strict();
export const financialProposalSchema = financialIntentSchema.extend({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type FinancialProposal = z.output<typeof financialProposalSchema>;
