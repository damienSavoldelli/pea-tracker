import { Hono } from 'hono';
import type { PortfolioService } from '../../application/portfolio';
import type { ValuationService } from '../../application/valuation';
import { requirePermission, type Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { acceptsJson, titles } from './instruments';

export interface CurrentPortfolioHttpDependencies {
  portfolio: PortfolioService;
  valuation: ValuationService;
  authenticate(request: Request): Principal | null | Promise<Principal | null>;
}

/** Opt-in projected reads. Historical V1 routes and administrative writes are separate. */
export function currentPortfolioRoutes(dependencies: CurrentPortfolioHttpDependencies) {
  const app = new Hono();
  for (const view of ['state', 'valuation'] as const) app.all(`/:portfolioId/${view}`, async context => {
    const request = context.req.raw;
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    try {
      const principal = await dependencies.authenticate(request);
      requirePermission(principal, 'portfolio:read');
      if (view === 'valuation') requirePermission(principal, 'quotes:read');
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== url.origin) throw new ApplicationError(403, 'origin_forbidden');
      if (request.method !== 'GET') throw new ApplicationError(405, 'method_not_allowed');
      if (!acceptsJson(request.headers.get('Accept'))) throw new ApplicationError(406, 'not_acceptable');
      const query: Record<string, string> = {};
      for (const [key, value] of url.searchParams) {
        if (view === 'state' || !['provider', 'price_kind', 'adjustment'].includes(key) || url.searchParams.getAll(key).length !== 1)
          throw new ApplicationError(400, 'invalid_query');
        query[key] = value;
      }
      const id = context.req.param('portfolioId');
      return Response.json(view === 'state' ? await dependencies.portfolio.current(principal, id)
        : await dependencies.valuation.current(principal, id, query), { headers });
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      if (failure.status === 401) headers.set('WWW-Authenticate', 'Bearer');
      if (failure.status === 405) headers.set('Allow', 'GET');
      headers.set('Content-Type', 'application/problem+json');
      return Response.json({ type: 'about:blank', title: titles[failure.status], status: failure.status,
        code: failure.code, request_id: crypto.randomUUID() }, { status: failure.status, headers });
    }
  });
  return app;
}
