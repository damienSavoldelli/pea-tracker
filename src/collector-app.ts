import { createApp } from './app';
import type { QuotationService } from './application/quotations';
import type { TokenVerifier } from './adapters/auth/token-verifier';
import type { AccessServiceAuthenticator } from './adapters/auth/access-service-authenticator';
import { Hono } from 'hono';
import { quotationRoutes } from './adapters/rest/quotations';

// Explicit opt-in only; no deployed entrypoint imports this composition.
// Reuse the existing distinct audience/client/subject/scope verification policy.
export function createCollectorApp(verifier: TokenVerifier, service: QuotationService) {
  return createApp({ quotations: { service, ingestionOnly: true, authenticate: request => verifier.authenticate(request, 'collector') } });
}

// Machine origin exposes no health, MCP, portfolio, administrative or read routes.
// Only trusted composition supplies the verifier and default-deny ingestion grants.
export function createAccessCollectorApp(authenticator: AccessServiceAuthenticator, service: QuotationService) {
  const app = new Hono();
  app.use('*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
    context.header('X-Content-Type-Options', 'nosniff');
  });
  app.route('/api/v1', quotationRoutes({ service, ingestionOnly: true,
    authenticate: request => authenticator.authenticate(request), challenge: () => 'CF-Access-Service-Token' }));
  return app;
}
