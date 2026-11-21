import { Hono } from 'hono';
import { requirePermission, type Principal } from './application/authorization';
import { ApplicationError } from './application/errors';
import type { TransactionService } from './application/transactions';
import { acceptsJson, readJson, titles } from './adapters/rest/instruments';

/** Explicit local/test composition only. No deployed Worker or MCP imports these administrative routes. */
export function createTransactionApp(service: TransactionService,
  authenticate: (request: Request) => Principal | null | Promise<Principal | null>) {
  const app = new Hono();
  app.use('*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
    context.header('X-Content-Type-Options', 'nosniff');
  });
  app.all('/api/v1/portfolios/:portfolioId/transactions', async context => {
    try {
      const request = context.req.raw;
      const principal = await authenticate(request);
      requirePermission(principal, request.method === 'POST' ? 'portfolio:admin' : 'portfolio:read');
      const portfolioId = context.req.param('portfolioId');
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== new URL(request.url).origin) throw new ApplicationError(403, 'origin_forbidden');
      if (new URL(request.url).search) throw new ApplicationError(400, 'invalid_query');
      if (!acceptsJson(request.headers.get('Accept'))) throw new ApplicationError(406, 'not_acceptable');
      if (request.method === 'GET') {
        const state = await service.get(principal, portfolioId);
        return Response.json(state, { headers: { ETag: `"${state.balances.version}"`, 'Cache-Control': 'no-store' } });
      }
      if (request.method !== 'POST') throw new ApplicationError(405, 'method_not_allowed');
      const match = /^"(0|[1-9][0-9]{0,3})"$/.exec(request.headers.get('If-Match') ?? '');
      if (!match) throw new ApplicationError(428, 'version_required');
      const result = await service.append(principal, portfolioId, await readJson(request, 8192),
        Number(match[1]), request.headers.get('Idempotency-Key'));
      return Response.json(result, { status: 201,
        headers: { ETag: `"${result.balances.version}"`, 'Cache-Control': 'no-store' } });
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/problem+json' };
      if (failure.status === 401) headers['WWW-Authenticate'] = 'Bearer';
      if (failure.status === 405) headers.Allow = 'GET, POST';
      return Response.json({ type: 'about:blank', title: titles[failure.status], status: failure.status, code: failure.code, request_id: crypto.randomUUID() },
        { status: failure.status, headers });
    }
  });
  return app;
}
