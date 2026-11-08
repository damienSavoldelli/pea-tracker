import { Hono } from 'hono';
import { requirePermission, requirePrincipal, type Principal } from '../../application/authorization';
import { ApplicationError, type ErrorStatus } from '../../application/errors';
import type { InstrumentService } from '../../application/instruments';

export interface InstrumentHttpDependencies {
  service: InstrumentService;
  authenticate: (request: Request) => Principal | null | Promise<Principal | null>;
}

const titles: Record<ErrorStatus, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 406: 'Not Acceptable', 409: 'Conflict', 412: 'Precondition Failed',
  413: 'Content Too Large', 415: 'Unsupported Media Type', 422: 'Unprocessable Content',
  428: 'Precondition Required', 500: 'Internal Server Error',
};

function acceptsJson(value: string | null) {
  if (value === null) return true;
  let specificity = -1;
  let quality = 0;
  for (const entry of value.split(',')) {
    const [rawType, ...parameters] = entry.trim().toLowerCase().split(';');
    const match = rawType === 'application/json' ? 2 : rawType === 'application/*' ? 1 : rawType === '*/*' ? 0 : -1;
    if (match < 0) continue;
    const qValues = parameters.map(item => item.trim()).filter(item => item.startsWith('q='));
    const rawQuality = qValues[0]?.slice(2) ?? '1';
    if (qValues.length > 1 || !/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(rawQuality)) continue;
    const q = Number(rawQuality);
    if (match > specificity) { specificity = match; quality = q; }
    else if (match === specificity) quality = Math.max(quality, q);
  }
  return quality > 0;
}

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ApplicationError(415, 'unsupported_media_type');
  }
  const maximum = 16 * 1024;
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > maximum) throw new ApplicationError(413, 'body_too_large');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maximum) {
          await reader.cancel();
          throw new ApplicationError(413, 'body_too_large');
        }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ApplicationError(400, 'invalid_json'); }
}

function queryInput(request: Request, item: boolean) {
  const params = new URL(request.url).searchParams;
  const input: { limit?: number; active?: boolean; cursor?: string } = {};
  for (const key of params.keys()) {
    if (item || !['limit', 'active', 'cursor'].includes(key) || params.getAll(key).length !== 1) {
      throw new ApplicationError(400, 'invalid_query');
    }
  }
  if (params.has('limit')) {
    const value = params.get('limit')!;
    if (!/^[1-9][0-9]{0,2}$/.test(value)) throw new ApplicationError(400, 'invalid_query');
    input.limit = Number(value);
  }
  if (params.has('active')) {
    const value = params.get('active');
    if (value !== 'true' && value !== 'false') throw new ApplicationError(400, 'invalid_query');
    input.active = value === 'true';
  }
  if (params.has('cursor')) input.cursor = params.get('cursor')!;
  return input;
}

export function instrumentRoutes(dependencies: InstrumentHttpDependencies) {
  const app = new Hono();
  const handle = async (request: Request, id?: string) => {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const allow = id === undefined ? 'GET, POST' : 'GET, PATCH';
    try {
      const principal = await dependencies.authenticate(request);
      requirePrincipal(principal);
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== new URL(request.url).origin) throw new ApplicationError(403, 'origin_forbidden');
      if (!allow.split(', ').includes(request.method)) throw new ApplicationError(405, 'method_not_allowed');
      requirePermission(principal, request.method === 'GET' ? 'instruments:read' : 'instruments:admin');
      if (!acceptsJson(request.headers.get('Accept'))) throw new ApplicationError(406, 'not_acceptable');
      const query = queryInput(request, id !== undefined || request.method !== 'GET');
      if (request.method === 'GET') {
        const data = id === undefined ? await dependencies.service.list(principal, query) : await dependencies.service.get(principal, id);
        if ('version' in data) headers.set('ETag', `"${data.version}"`);
        return Response.json(data, { headers });
      }
      if (request.method === 'POST') {
        const data = await dependencies.service.create(principal, await readJson(request), request.headers.get('Idempotency-Key'));
        headers.set('Location', `/api/v1/instruments/${data.id}`);
        headers.set('ETag', `"${data.version}"`);
        return Response.json(data, { status: 201, headers });
      }
      const match = request.headers.get('If-Match');
      if (match === null) throw new ApplicationError(428, 'precondition_required');
      if (!/^"[1-9][0-9]*"$/.test(match)) throw new ApplicationError(400, 'invalid_precondition');
      const version = Number(match.slice(1, -1));
      const data = await dependencies.service.update(principal, id, await readJson(request), version);
      headers.set('ETag', `"${data.version}"`);
      return Response.json(data, { headers });
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      if (failure.status === 401) headers.set('WWW-Authenticate', 'Bearer');
      if (failure.status === 405) headers.set('Allow', allow);
      headers.set('Content-Type', 'application/problem+json');
      const body: { type: string; title: string; status: number; code: string; request_id: string; field_paths?: string[] } = {
        type: 'about:blank', title: titles[failure.status], status: failure.status, code: failure.code, request_id: crypto.randomUUID(),
      };
      if (failure.fieldPaths.length > 0) body.field_paths = failure.fieldPaths;
      return new Response(JSON.stringify(body), { status: failure.status, headers });
    }
  };
  app.all('/', context => handle(context.req.raw));
  app.all('/:id', context => handle(context.req.raw, context.req.param('id')));
  return app;
}
