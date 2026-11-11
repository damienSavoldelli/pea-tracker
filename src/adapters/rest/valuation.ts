import { Hono } from 'hono';
import type { ValuationService } from '../../application/valuation';
import { requirePermission, type Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { acceptsJson, titles } from './instruments';

export interface ValuationHttpDependencies {
  service: ValuationService;
  authenticate(request: Request): Principal | null | Promise<Principal | null>;
}
export function valuationRoutes(dependencies: ValuationHttpDependencies) {
  const app = new Hono();
  app.all('/valuation', async context => {
    const request = context.req.raw;
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    try {
      const principal = await dependencies.authenticate(request);
      requirePermission(principal, 'portfolio:read');
      requirePermission(principal, 'quotes:read');
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== new URL(request.url).origin) throw new ApplicationError(403, 'origin_forbidden');
      if (request.method !== 'GET') throw new ApplicationError(405, 'method_not_allowed');
      if (!acceptsJson(request.headers.get('Accept'))) throw new ApplicationError(406, 'not_acceptable');
      const query: Record<string, unknown> = {};
      const params = new URL(request.url).searchParams;
      for (const [key, value] of params) {
        if (!['provider', 'price_kind', 'adjustment', 'revision'].includes(key) || params.getAll(key).length !== 1) throw new ApplicationError(400, 'invalid_query');
        if (key === 'revision') {
          if (!/^[1-9][0-9]{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ApplicationError(400, 'invalid_query');
          query[key] = Number(value);
        } else query[key] = value;
      }
      return Response.json(await dependencies.service.get(principal, query), { headers });
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      if (failure.status === 401) headers.set('WWW-Authenticate', 'Bearer');
      if (failure.status === 405) headers.set('Allow', 'GET');
      headers.set('Content-Type', 'application/problem+json');
      return Response.json({ type: 'about:blank', title: titles[failure.status], status: failure.status, code: failure.code, request_id: crypto.randomUUID() }, { status: failure.status, headers });
    }
  });
  return app;
}
