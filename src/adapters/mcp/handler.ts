import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { pingDiagnostic, service } from '../../diagnostics';
import { requirePermission, type Principal } from '../../application/authorization';
import type { InstrumentService } from '../../application/instruments';
import { instrumentIdSchema, instrumentSchema } from '../../domain/instruments';
import { ApplicationError } from '../../application/errors';

export interface ProtectedMcpDependencies {
  service: InstrumentService;
  authenticate(request: Request): Promise<Principal>;
  challenge(status: 401 | 403): string;
  metadata: { resource: string; authorization_servers: string[]; scopes_supported: string[]; bearer_methods_supported: string[] };
  restMetadata?: { resource: string; authorization_servers: string[]; scopes_supported: string[]; bearer_methods_supported: string[] };
}
interface FinancialContext {
  principal: Principal;
  service: InstrumentService;
  challenge(status: 401 | 403): string;
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
    const securitySchemes = [{ type: 'oauth2', scopes: ['mcp:read', 'portfolio:read'] }];
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
