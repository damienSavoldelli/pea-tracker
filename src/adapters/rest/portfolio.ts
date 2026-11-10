import { Hono } from 'hono';
import { requirePermission, requirePrincipal, type Principal } from '../../application/authorization';
import type { PortfolioService } from '../../application/portfolio';
import { ApplicationError } from '../../application/errors';
import { acceptsJson, readJson, titles } from './instruments';

export interface PortfolioHttpDependencies {
  service: PortfolioService;
  authenticate(request: Request): Principal | null | Promise<Principal | null>;
}
export function portfolioRoutes(dependencies: PortfolioHttpDependencies) {
  const app = new Hono();
  async function handle(request: Request, kind: 'opening' | 'positions' | 'revision', revision?: string) {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const allow = kind === 'opening' ? 'GET, POST' : 'GET';
    try {
      const principal = await dependencies.authenticate(request);
      requirePrincipal(principal);
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== new URL(request.url).origin) throw new ApplicationError(403, 'origin_forbidden');
      if (!allow.split(', ').includes(request.method)) throw new ApplicationError(405, 'method_not_allowed');
      requirePermission(principal, request.method === 'GET' ? 'portfolio:read' : 'portfolio:admin');
      if (!acceptsJson(request.headers.get('Accept'))) throw new ApplicationError(406, 'not_acceptable');
      const query: { limit?: number; cursor?: string } = {};
      const params = new URL(request.url).searchParams;
      for (const [key, value] of params) {
        if (kind !== 'positions' || !['limit', 'cursor'].includes(key) || params.getAll(key).length !== 1) throw new ApplicationError(400, 'invalid_query');
        if (key === 'limit') {
          if (!/^[1-9][0-9]{0,2}$/.test(value)) throw new ApplicationError(400, 'invalid_query');
          query.limit = Number(value);
        } else query.cursor = value;
      }
      if (request.method === 'POST') {
        const match = request.headers.get('If-Match');
        if (match === null) throw new ApplicationError(428, 'precondition_required');
        if (!/^"(?:0|[1-9][0-9]*)"$/.test(match)) throw new ApplicationError(400, 'invalid_precondition');
        const state = await dependencies.service.append(principal, await readJson(request, 128 * 1024), Number(match.slice(1, -1)), request.headers.get('Idempotency-Key'));
        headers.set('ETag', `"${state.revision}"`);
        headers.set('Location', `/api/v1/portfolio/opening-state/revisions/${state.revision}`);
        return Response.json(state, { status: 201, headers });
      }
      if (revision !== undefined && !/^[1-9][0-9]*$/.test(revision)) throw new ApplicationError(400, 'invalid_request');
      const data = kind === 'positions' ? await dependencies.service.positions(principal, query)
        : await dependencies.service.get(principal, revision === undefined ? undefined : Number(revision));
      headers.set('ETag', `"${data.revision}"`);
      return Response.json(data, { headers });
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      if (failure.status === 401) headers.set('WWW-Authenticate', 'Bearer');
      if (failure.status === 405) headers.set('Allow', allow);
      headers.set('Content-Type', 'application/problem+json');
      return Response.json({ type: 'about:blank', title: titles[failure.status], status: failure.status, code: failure.code,
        request_id: crypto.randomUUID(), ...(failure.fieldPaths.length ? { field_paths: failure.fieldPaths } : {}) }, { status: failure.status, headers });
    }
  }
  app.all('/opening-state', c => handle(c.req.raw, 'opening'));
  app.all('/opening-state/revisions/:revision', c => handle(c.req.raw, 'revision', c.req.param('revision')));
  app.all('/positions', c => handle(c.req.raw, 'positions'));
  return app;
}
