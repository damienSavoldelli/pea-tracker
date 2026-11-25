import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { portfolioListQuerySchema, type PortfolioReadService } from '../../application/portfolio-reads';
import type { Principal } from '../../application/authorization';
import { portfolioIdSchema } from '../../domain/transactions';
import { valuationQuerySchema } from '../../domain/valuation';

type Guard = (action: () => Promise<Record<string, unknown>>) => Promise<{
  content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean;
}>;
/** Four read-only capabilities; existing financial tools and their schemas are untouched. */
export function registerPortfolioReadTools(server: McpServer, service: PortfolioReadService, principal: Principal, guarded: Guard) {
  if (!principal.permissions.includes('portfolio:read')) return;
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool('list_portfolios', { description: 'List only portfolios owned by the authenticated caller, with explicit nature, status and bounded pagination.',
    inputSchema: portfolioListQuerySchema, annotations }, input => guarded(() => service.list(principal, input)));
  server.registerTool('get_portfolio_details', { description: 'Read owned portfolio metadata and its exact opening reference. Archived portfolios remain read-only. No financial administration.',
    inputSchema: z.object({ portfolio_id: portfolioIdSchema }).strict(), annotations }, input => guarded(() => service.get(principal, input.portfolio_id)));
  server.registerTool('get_portfolio_state', { description: 'Read owned real or simulated holdings, cash, PRU and gains from its independent opening and existing journal. Creates no journal or transaction.',
    inputSchema: z.object({ portfolio_id: portfolioIdSchema }).strict(), annotations }, input => guarded(() => service.state(principal, input.portfolio_id)));
  if (principal.permissions.includes('quotes:read')) server.registerTool('get_portfolio_market_value', {
    description: 'Value one owned portfolio using shared stored quotations. Includes its own performance reference and Modified Dietz estimate only when applicable; missing inputs remain explicitly unavailable. Archived holdings are readable, not a frozen historical quote snapshot.',
    inputSchema: valuationQuerySchema.omit({ revision: true }).extend({ portfolio_id: portfolioIdSchema }).strict(), annotations,
  }, ({ portfolio_id, ...selection }) => guarded(() => service.valuation(principal, portfolio_id, selection)));
}
