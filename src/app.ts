import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { handleMcp, type ProtectedMcpDependencies } from './adapters/mcp/handler';
import { authenticationFailure } from './adapters/auth/metadata';
import { health } from './adapters/rest/health';
import { instrumentRoutes, type InstrumentHttpDependencies } from './adapters/rest/instruments';
import { portfolioRoutes, type PortfolioHttpDependencies } from './adapters/rest/portfolio';
import { quotationRoutes, type QuotationHttpDependencies } from './adapters/rest/quotations';
import { valuationRoutes, type ValuationHttpDependencies } from './adapters/rest/valuation';

export function createApp(dependencies: { instruments?: InstrumentHttpDependencies; portfolio?: PortfolioHttpDependencies; quotations?: QuotationHttpDependencies; valuation?: ValuationHttpDependencies; mcp?: ProtectedMcpDependencies } = {}) {
  const app = new Hono();
  app.use('*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
    context.header('X-Content-Type-Options', 'nosniff');
  });
  app.route('/api/v1/health', health);
  app.use('/mcp', bodyLimit({
    maxSize: 64 * 1024,
    onError: context => context.json({ error: 'Request body too large' }, 413),
  }));
  const protectedMcp = dependencies.mcp;
  if (protectedMcp) {
    if (protectedMcp.metadata) app.get('/.well-known/oauth-protected-resource/mcp', context => context.json(protectedMcp.metadata!));
    if (protectedMcp.restMetadata) app.get('/.well-known/oauth-protected-resource/api/v1', context => context.json(protectedMcp.restMetadata!));
    app.all('/mcp', async context => {
      try {
        const principal = await protectedMcp.authenticate(context.req.raw);
        return await handleMcp(context.req.raw, { principal, service: protectedMcp.service, challenge: protectedMcp.challenge,
          ...(protectedMcp.oauthScopes ? { oauthScopes: protectedMcp.oauthScopes } : {}),
          ...(protectedMcp.portfolio ? { portfolio: protectedMcp.portfolio } : {}),
          ...(protectedMcp.quotations ? { quotations: protectedMcp.quotations } : {}),
          ...(protectedMcp.valuation ? { valuation: protectedMcp.valuation } : {}) });
      } catch (error) { return authenticationFailure(error, protectedMcp.challenge); }
    });
  } else app.all('/mcp', context => handleMcp(context.req.raw));
  if (dependencies.instruments?.service && typeof dependencies.instruments.authenticate === 'function') {
    app.route('/api/v1/instruments', instrumentRoutes(dependencies.instruments));
  }
  if (dependencies.portfolio?.service && typeof dependencies.portfolio.authenticate === 'function') {
    app.route('/api/v1/portfolio', portfolioRoutes(dependencies.portfolio));
  }
  if (dependencies.quotations?.service && typeof dependencies.quotations.authenticate === 'function') {
    app.route('/api/v1', quotationRoutes(dependencies.quotations));
  }
  if (dependencies.valuation?.service && typeof dependencies.valuation.authenticate === 'function') {
    app.route('/api/v1/portfolio', valuationRoutes(dependencies.valuation));
  }
  app.onError(() => Response.json({ error: 'Internal server error' }, { status: 500 }));
  return app;
}
