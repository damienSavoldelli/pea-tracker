import { Hono } from 'hono';
import type { Principal } from '../../application/authorization';
import { ApplicationError } from '../../application/errors';
import type { FinancialMcpService } from '../../application/financial-mcp';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const navigationParameters = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id']);
function confirmationDocument(title: string, body: string, styleNonce: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style nonce="${styleNonce}">
    :root { font-family: system-ui, sans-serif; color: #172b3a; background: #f3f6f8; line-height: 1.5; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px 16px; }
    main { max-width: 720px; margin: 0 auto; padding: 28px; background: #fff; border: 1px solid #d5dee5; border-radius: 12px; }
    h1 { margin-top: 0; font-size: 1.6rem; line-height: 1.25; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 8px; border-bottom: 1px solid #d5dee5; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { width: 42%; }
    details { margin: 20px 0; overflow-wrap: anywhere; }
    summary { cursor: pointer; }
    button { width: 100%; min-height: 48px; padding: 12px 16px; border: 0; border-radius: 8px; background: #174b43; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    button:focus-visible, summary:focus-visible { outline: 3px solid #276bba; outline-offset: 4px; }
    @media (max-width: 520px) { main { padding: 20px 16px; } tr, th, td { display: block; width: 100%; } th { border-bottom: 0; padding-bottom: 0; } td { padding-top: 4px; } }
  </style></head><body><main>${body}</main></body></html>`;
}
/** No scripts, external assets, management UI, or approval endpoint reachable through MCP. */
export function financialConfirmationRoutes(service: FinancialMcpService,
  authenticateBrowser: (request: Request) => Promise<Principal>, origin: string) {
  if (!origin.startsWith('https://') || new URL(origin).origin !== origin) throw new Error('HTTPS confirmation origin required');
  const app = new Hono<{ Variables: { styleNonce: string } }>();
  app.use('*', async (context, next) => {
    const styleNonce = crypto.randomUUID();
    context.set('styleNonce', styleNonce);
    await next();
    context.header('Cache-Control', 'no-store');
    context.header('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${styleNonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    context.header('Referrer-Policy', 'no-referrer');
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
        const operation = result.proposal.input;
        const title = { buy: 'Achat exécuté', sell: 'Vente exécutée', deposit: 'Versement', withdrawal: 'Retrait', dividend: 'Dividende encaissé', reversal: 'Contrepassation' }[operation.type];
        const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
        const field = (value: unknown) => typeof value === 'string' ? value : 'Indisponible';
        const rows: [string, string][] = [['Opération', title], ['Date UTC', operation.effective_at],
          ['Source', operation.provenance.source], ['Référence source', operation.provenance.reference ?? 'Non renseignée']];
        if (operation.type !== 'reversal') rows.push([operation.type === 'dividend' ? 'Montant effectivement reçu' : 'Montant hors frais', `${operation.amount} EUR`]);
        else rows.push(['Opération corrigée', operation.reversal_of], ['Motif', operation.reason]);
        if (operation.type === 'buy' || operation.type === 'sell') rows.push(['Quantité', operation.quantity], ['Frais déclarés', operation.fees === undefined ? 'Non renseignés' : `${operation.fees} EUR`]);
        if (result.summary.instrument) {
          const instrument = object(result.summary.instrument);
          rows.push(['Instrument', field(instrument.name)], ['ISIN', field(instrument.isin)]);
        }
        rows.push(['Liquidités avant', `${field(object(result.summary.cash_before).amount)} EUR`],
          ['Variation des liquidités', `${field(result.summary.cash_delta)} EUR`],
          ['Liquidités après', `${field(object(result.summary.cash_after).amount)} EUR`]);
        if (result.summary.quantity_delta !== null) rows.push(['Variation des titres', field(result.summary.quantity_delta)]);
        const summary = rows.map(([label, value]) => `<tr><th scope="row">${escape(label)}</th><td>${escape(value)}</td></tr>`).join('');
        context.header('Set-Cookie', `__Secure-pea-confirm=${csrf}; Path=${path}; Max-Age=300; HttpOnly; Secure; SameSite=Strict`);
        return context.html(confirmationDocument('Confirmer une opération PEA', `<h1>Autoriser cet enregistrement</h1><p>Il s'agit uniquement de journaliser une opération déjà exécutée. Aucun ordre de bourse ne sera envoyé.</p><table>${summary}</table><p>Expiration UTC : ${escape(result.proposal.expires_at)}</p><details><summary>Référence de validation</summary><p>${escape(id)}<br>${escape(result.proposal.digest)}</p></details><form method="post" action="${path}"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">J'approuve cette opération exacte</button></form>`, context.get('styleNonce')));
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
      return context.html(confirmationDocument('Approbation enregistrée', '<h1>Approbation enregistrée</h1><p>Revenez dans ChatGPT pour enregistrer cette opération avant son expiration.</p>', context.get('styleNonce')));
    } catch (error) {
      const failure = error instanceof ApplicationError ? error : new ApplicationError(500, 'internal_error');
      return new Response(failure.code, { status: failure.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  });
  return app;
}
