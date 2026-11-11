import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { pingDiagnostic, service } from '../../diagnostics';
import { requirePermission, type Principal } from '../../application/authorization';
import type { InstrumentService } from '../../application/instruments';
import { instrumentIdSchema, instrumentSchema } from '../../domain/instruments';
import { ApplicationError } from '../../application/errors';
import type { PortfolioService } from '../../application/portfolio';
import type { QuotationService } from '../../application/quotations';
import { quotationHistoryQuerySchema } from '../../application/quotations';
import { quotationSelectorSchema } from '../../domain/quotations';

export interface ProtectedMcpDependencies {
  service: InstrumentService;
  portfolio?: PortfolioService;
  quotations?: QuotationService;
  authenticate(request: Request): Promise<Principal>;
  challenge(status: 401 | 403): string;
  metadata?: { resource: string; authorization_servers: string[]; scopes_supported: string[]; bearer_methods_supported: string[] };
  oauthScopes?: readonly string[];
  restMetadata?: { resource: string; authorization_servers: string[]; scopes_supported: string[]; bearer_methods_supported: string[] };
}
interface FinancialContext {
  principal: Principal;
  service: InstrumentService;
  portfolio?: PortfolioService;
  quotations?: QuotationService;
  challenge(status: 401 | 403): string;
  oauthScopes?: readonly string[];
}

export async function handleMcp(request: Request, financial?: FinancialContext): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed' } },
      { status: 405, headers: { Allow: 'POST' } },
    );
  }

  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const server = new McpServer({ name: service.service, version: service.version });
  if (financial) {
    requirePermission(financial.principal, 'instruments:read');
    const securitySchemes = [{ type: 'oauth2', scopes: [...(financial.oauthScopes ?? ['mcp:read', 'portfolio:read'])] }];
    const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    const guarded = async (action: () => Promise<Record<string, unknown>>) => {
      try {
        requirePermission(financial.principal, 'instruments:read');
        const result = await action();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
        return { isError: true, content: [{ type: 'text' as const, text: failure.code }],
          ...(failure.status === 401 || failure.status === 403 ? { _meta: { 'mcp/www_authenticate': [financial.challenge(failure.status)] } } : {}) };
      }
    };
    server.registerTool('list_instruments', { description: 'List authorized instrument metadata.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional(), active: z.boolean().optional(), cursor: z.string().max(256).optional() }).strict(),
      outputSchema: z.object({ data: z.array(instrumentSchema), page: z.object({ next_cursor: z.string().nullable() }) }),
      annotations, _meta: { securitySchemes } }, input => guarded(() => financial.service.list(financial.principal, input)));
    server.registerTool('get_instrument', { description: 'Read authorized instrument metadata.', inputSchema: z.object({ id: instrumentIdSchema }).strict(), outputSchema: instrumentSchema,
      annotations, _meta: { securitySchemes } }, input => guarded(() => financial.service.get(financial.principal, input.id)));
    if (financial.quotations && financial.principal.permissions.includes('quotes:read')) {
      const quotations = financial.quotations;
      server.registerTool('get_quotation_status', { description: 'Read a declared price and explicit collection/market ages. No real-time guarantee.',
        inputSchema: quotationSelectorSchema, annotations, _meta: { securitySchemes } }, input => guarded(() => quotations.status(financial.principal, input)));
      server.registerTool('list_quotations', { description: 'Read bounded immutable provider observations, with market and fetch timestamps.',
        inputSchema: quotationHistoryQuerySchema, annotations, _meta: { securitySchemes } }, input => guarded(() => quotations.history(financial.principal, input)));
    }
    if (financial.portfolio && financial.principal.permissions.includes('portfolio:read')) {
      const portfolio = financial.portfolio;
      server.registerTool('get_opening_state', { description: 'Read a declared opening-state revision. Corrections are not trades.',
        inputSchema: z.object({ revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() }).strict(),
        annotations, _meta: { securitySchemes } }, input => guarded(() => portfolio.get(financial.principal, input.revision)));
      server.registerTool('get_positions', { description: 'Read opening positions and declared PRU; no reconstructed historical cost or performance.',
        inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().max(256).optional() }).strict(),
        annotations, _meta: { securitySchemes } }, input => guarded(() => portfolio.positions(financial.principal, input)));
    }
  }
  server.registerTool('ping', {
    description: 'Return public diagnostic information. No portfolio data is available.',
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      status: z.literal('ok'),
      service: z.literal('pea-tracker'),
      version: z.literal('0.1.0'),
      timestamp: z.string().datetime(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const diagnostic = pingDiagnostic();
    return {
      content: [{ type: 'text', text: JSON.stringify(diagnostic) }],
      structuredContent: diagnostic,
    };
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
