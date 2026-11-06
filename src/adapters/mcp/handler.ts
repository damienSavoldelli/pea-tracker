import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { pingDiagnostic, service } from '../../diagnostics';

export async function handleMcp(request: Request): Promise<Response> {
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
