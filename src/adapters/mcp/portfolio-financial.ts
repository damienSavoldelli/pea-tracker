import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { portfolioConfirmationSchema, type PortfolioFinancialService } from '../../application/portfolio-financial';
import { transactionInputSchema, portfolioIdSchema } from '../../domain/transactions';
import type { Principal } from '../../application/authorization';

type Guard = (action: () => Promise<Record<string, unknown>>) => Promise<{
  content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean;
}>;
export function registerPortfolioFinancialTools(server: McpServer, service: PortfolioFinancialService, principal: Principal, guarded: Guard) {
  if (!principal.permissions.includes('portfolio:write') || !principal.permissions.includes('portfolio:read')) return;
  for (const kind of ['real', 'simulated'] as const) {
    const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
    server.registerTool(`prepare_${kind}_portfolio_operation`, {
      description: kind === 'real' ? 'Prepare an already executed operation in one owned active REAL portfolio. Requires independent browser approval before a separate confirmation. Does not write the journal or place orders.'
        : 'Prepare a SIMULATED financial journal operation in one owned active simulated portfolio. No journal write until the separate confirm_simulated_portfolio_operation tool is voluntarily invoked. No real money or broker order.',
      inputSchema: z.object({ portfolio_id: portfolioIdSchema, input: transactionInputSchema }).strict(), annotations,
    }, input => guarded(() => service.prepare(principal, input.portfolio_id, input.input, kind)));
    server.registerTool(`confirm_${kind}_portfolio_operation`, {
      description: kind === 'real' ? 'Record an exact version-2 REAL proposal only after independent browser approval. No client approval flag is accepted. Idempotent receipt replay; no brokerage order.'
        : 'Explicitly confirm a previously prepared SIMULATED proposal. No browser approval is needed. Exact digest, active owner-bound simulated portfolio, expiry and single consumption are enforced. Cannot confirm real proposals.',
      inputSchema: portfolioConfirmationSchema, annotations: { ...annotations, destructiveHint: true, idempotentHint: true },
    }, input => guarded(async () => ({ ...await service.confirm(principal, input, kind) })));
  }
}
