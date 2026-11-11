import { Hono } from 'hono';
import type { QuotationService } from '../../application/quotations';
import { requirePermission, type Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import { acceptsJson, readJson, titles } from './instruments';

export interface QuotationHttpDependencies {
  service: QuotationService;
  authenticate(request: Request): Principal | null | Promise<Principal | null>;
}
export function quotationRoutes(dependencies: QuotationHttpDependencies) {
  const app = new Hono();
  async function handle(request: Request, kind: 'history' | 'status' | 'batch') {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const method = kind === 'batch' ? 'POST' : 'GET';
    try {
      const principal = await dependencies.authenticate(request);
      requirePermission(principal, kind === 'batch' ? 'quotes:ingest' : 'quotes:read');
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== new URL(request.url).origin) throw new ApplicationError(403, 'origin_forbidden');
      if (request.method !== method) throw new ApplicationError(405, 'method_not_allowed');
      if (!acceptsJson(request.headers.get('Accept'))) throw new ApplicationError(406, 'not_acceptable');
      const query: Record<string, unknown> = {};
      const params = new URL(request.url).searchParams;
      const allowed = kind === 'batch' ? [] : ['instrument_id', 'provider', 'price_kind', 'adjustment', ...(kind === 'history' ? ['from', 'to', 'limit', 'cursor'] : [])];
      for (const [key, value] of params) {
        if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new ApplicationError(400, 'invalid_query');
        if (key === 'limit') {
          if (!/^[1-9][0-9]{0,2}$/.test(value)) throw new ApplicationError(400, 'invalid_query');
          query.limit = Number(value);
        } else query[key] = value;
      }
      if (kind === 'batch') return Response.json(await dependencies.service.ingest(principal, await readJson(request, 128 * 1024), request.headers.get('Idempotency-Key')), { status: 201, headers });
      return Response.json(kind === 'status' ? await dependencies.service.status(principal, query) : await dependencies.service.history(principal, query), { headers });
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      if (failure.status === 401) headers.set('WWW-Authenticate', 'Bearer');
      if (failure.status === 405) headers.set('Allow', method);
      headers.set('Content-Type', 'application/problem+json');
      return Response.json({ type: 'about:blank', title: titles[failure.status], status: failure.status, code: failure.code,
        request_id: crypto.randomUUID(), ...(failure.fieldPaths.length ? { field_paths: failure.fieldPaths } : {}) }, { status: failure.status, headers });
    }
  }
  app.all('/quotations', c => handle(c.req.raw, 'history'));
  app.all('/quotation-status', c => handle(c.req.raw, 'status'));
  app.all('/quotation-batches', c => handle(c.req.raw, 'batch'));
  return app;
}
