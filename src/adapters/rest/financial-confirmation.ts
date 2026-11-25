import { Hono } from 'hono';
import type { Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import type { FinancialMcpService } from '../../application/financial-mcp';
import { confirmationBody, confirmationDocument, confirmationError } from './financial-confirmation-page';

const navigationParameters = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id']);
/** Browser-only approval; presentation never authorizes a journal write. */
export function financialConfirmationRoutes(service: Pick<FinancialMcpService, 'confirmationPage' | 'approve'>,
  authenticateBrowser: (request: Request) => Promise<Principal>, origin: string) {
  if (!origin.startsWith('https://') || new URL(origin).origin !== origin) throw new Error('HTTPS confirmation origin required');
  const app = new Hono<{ Variables: { styleNonce: string } }>();
  app.use('*', async (context, next) => {
    const styleNonce = crypto.randomUUID();
    context.set('styleNonce', styleNonce);
    await next();
    context.header('Cache-Control', 'no-store');
    context.header('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${styleNonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    // Native form POST needs its real Origin; never include proposal paths in Referer.
    context.header('Referrer-Policy', 'strict-origin');
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('X-Frame-Options', 'DENY');
  });
  app.all('/:id', async context => {
    try {
      const request = context.req.raw;
      const url = new URL(request.url);
      // Tracking is navigation-only, never an operation input or an approval parameter.
      if (url.origin !== origin || (url.search && (request.method !== 'GET' ||
        [...url.searchParams.keys()].some(key => !navigationParameters.has(key))))) throw new ApplicationError(403, 'origin_forbidden');
      const principal = await authenticateBrowser(request);
      const id = context.req.param('id');
      const path = `/financial-confirmation/${id}`;
      if (request.method === 'GET') {
        const csrf = crypto.randomUUID();
        const result = await service.confirmationPage(principal, id, csrf);
        context.header('Set-Cookie', `__Secure-pea-confirm=${csrf}; Path=${path}; Max-Age=300; HttpOnly; Secure; SameSite=Strict`);
        return context.html(confirmationDocument('Confirmer une opération PEA', confirmationBody(result, id, csrf), context.get('styleNonce'), true));
      }
      if (request.method !== 'POST') throw new ApplicationError(405, 'method_not_allowed');
      if (request.headers.get('Origin') !== origin || (request.headers.get('Sec-Fetch-Site') ?? 'same-origin') !== 'same-origin') throw new ApplicationError(403, 'origin_forbidden');
      if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type') ?? '')) throw new ApplicationError(415, 'unsupported_media_type');
      // Bound the body before parsing, including chunked requests without Content-Length.
      const reader = request.body?.getReader();
      if (!reader) throw new ApplicationError(400, 'invalid_confirmation');
      let bytes = 0; const chunks: string[] = []; const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 1024) { await reader.cancel(); throw new ApplicationError(413, 'body_too_large'); }
        chunks.push(decoder.decode(chunk.value, { stream: true }));
      }
      chunks.push(decoder.decode());
      const form = new URLSearchParams(chunks.join(''));
      const csrf = form.get('csrf');
      const cookies = (request.headers.get('Cookie') ?? '').split(';').map(item => item.trim()).filter(item => item.startsWith('__Secure-pea-confirm='));
      if ([...form.keys()].length !== 1 || !csrf || !/^[a-f0-9-]{36}$/.test(csrf) || cookies.length !== 1 || cookies[0] !== `__Secure-pea-confirm=${csrf}`) throw new ApplicationError(403, 'csrf_rejected');
      await service.approve(principal, id, csrf);
      context.header('Set-Cookie', `__Secure-pea-confirm=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
      return context.html(confirmationDocument('Approbation enregistrée', `<h1>Approbation enregistrée</h1><p>L'enregistrement financier n'est pas encore effectué. Revenez dans ChatGPT pour confirmer cette proposition avant son expiration.</p><p class="secondary">Référence de proposition : ${id}</p><p class="secondary">Aucun reçu d'enregistrement n'est disponible à ce stade.</p>`, context.get('styleNonce')));
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      let reconnectUrl: string | undefined;
      const id = context.req.param('id');
      if (failure.code === 'invalid_token' && context.req.method === 'GET' &&
        new URL(context.req.url).origin === origin && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
        // Official user-initiated Access logout; never redirect or revoke a session automatically.
        const logout = new URL('/cdn-cgi/access/logout', origin);
        logout.searchParams.set('returnTo', `${origin}/financial-confirmation/${id}`);
        reconnectUrl = logout.href;
      }
      const presentation = confirmationError(failure.code, reconnectUrl);
      return new Response(confirmationDocument(presentation.title, presentation.body, context.get('styleNonce')), {
        status: failure.status, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  });
  return app;
}
