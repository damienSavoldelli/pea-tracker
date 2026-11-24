import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Principal } from '../../application/authorization';
import { financialConfirmationSchema, portfolioListQuerySchema, type FinancialMcpService } from '../../application/financial-mcp';
import { portfolioIdSchema, transactionInputSchema } from '../../domain/transactions';

type Guard = (action: () => Promise<Record<string, unknown>>) => Promise<{
  content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean;
}>;
/** Opt-in adapter only. No accounting rules or client-asserted approval here. */
export function registerFinancialTools(server: McpServer, service: FinancialMcpService, principal: Principal, guarded: Guard) {
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  if (principal.permissions.includes('portfolio:read')) server.registerTool('list_portfolios', {
    description: 'Discover authorized portfolios before calling tools requiring portfolio_id. Use data[].id as portfolio_id; never use opening_state.id. V1.1 returns only the configured owner portfolio with id, kind and status; read_only describes this listing, not financial write permission.',
    inputSchema: portfolioListQuerySchema,
    outputSchema: z.object({ data: z.array(z.object({ id: portfolioIdSchema, kind: z.enum(['real', 'simulated']),
      status: z.enum(['active', 'archived']) })), page: z.object({ next_after: portfolioIdSchema.nullable() }), read_only: z.literal(true) }),
    annotations: read,
  }, input => guarded(() => service.listPortfolios(principal, input)));
  if (principal.permissions.includes('portfolio:read')) server.registerTool('get_transaction_journal', {
    description: 'Read recorded V1.1 operations and projected cash/quantities for the explicitly authorized real portfolio. Discover portfolio_id with list_portfolios and use data[].id; never use opening_state.id as portfolio_id.',
    inputSchema: z.object({ portfolio_id: portfolioIdSchema }).strict(), annotations: read,
  }, input => guarded(() => service.journal(principal, input.portfolio_id)));
  if (!principal.permissions.includes('portfolio:write')) return;
  const names = ['prepare_cash_deposit', 'prepare_cash_withdrawal', 'prepare_received_dividend',
    'prepare_recorded_buy', 'prepare_recorded_sell', 'prepare_transaction_reversal'] as const;
  for (const [index, schema] of transactionInputSchema.options.entries()) {
    const shape = Object.fromEntries(Object.entries(schema.shape).filter(([key]) => key !== 'type'));
    server.registerTool(names[index]!, {
      description: 'Prepare an ALREADY executed EUR operation, or a traceable correction. Discover portfolio_id with list_portfolios and use data[].id; never use opening_state.id as portfolio_id. Stores an expiring immutable proposal only; does not change holdings/cash or place a brokerage order. Show its recap and ask the owner to open confirmation_url. No approval is possible through MCP.',
      inputSchema: z.object({ ...shape, portfolio_id: portfolioIdSchema }).strict(),
      // Preparation persists a proposal, although it does not append a journal event.
      annotations: { ...read, readOnlyHint: false, idempotentHint: false },
    }, input => guarded(() => {
      const { portfolio_id, ...operation } = input;
      return service.prepare(principal, portfolio_id, { ...operation, type: schema.shape.type.value });
    }));
  }
  server.registerTool('confirm_financial_operation', {
    description: 'Record exactly one previously prepared operation ONLY after owner approval on the protected browser page. No confirmed flag or MCP annotation grants approval. Replays return the same recorded result. Scheduled tasks cannot approve operations. Never places a brokerage order.',
    inputSchema: financialConfirmationSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, input => guarded(async () => ({ ...await service.confirm(principal, input) })));
}
