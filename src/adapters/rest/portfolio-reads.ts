import { Hono } from 'hono';
import type { PortfolioReadService } from '../../application/portfolio-reads';
import { requirePermission, type Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { acceptsJson, titles } from './instruments';

export interface PortfolioReadHttpDependencies {
  service: PortfolioReadService;
  authenticate(request: Request): Principal | null | Promise<Principal | null>;
}

/** Separate versioned reads; all V1/V1.1 routes retain their original dependencies. */
export function portfolioReadRoutes(dependencies: PortfolioReadHttpDependencies) {
  const app = new Hono();
  for (const path of ['/', '/:portfolioId', '/:portfolioId/state', '/:portfolioId/valuation'] as const) app.all(path, async context => {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    try {
      const request = context.req.raw;
      const principal = await dependencies.authenticate(request);
      requirePermission(principal, 'portfolio:read');
      const url = new URL(request.url);
      if (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) throw new ApplicationError(403, 'origin_forbidden');
      if (request.method !== 'GET') throw new ApplicationError(405, 'method_not_allowed');
      if (!acceptsJson(request.headers.get('Accept'))) throw new ApplicationError(406, 'not_acceptable');
      const allowed = path === '/' ? ['limit', 'after'] : path.endsWith('/valuation') ? ['provider', 'price_kind', 'adjustment'] : [];
      const query: Record<string, string | number> = {};
      for (const [key, value] of url.searchParams) {
        if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new ApplicationError(400, 'invalid_query');
        query[key] = key === 'limit' ? Number(value) : value;
      }
      const id = context.req.param('portfolioId');
      const service = dependencies.service;
      const result = path === '/' ? await service.list(principal, query)
        : path.endsWith('/valuation') ? await service.valuation(principal, id, query)
        : path.endsWith('/state') ? await service.state(principal, id) : await service.get(principal, id);
      return Response.json(result, { headers });
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
