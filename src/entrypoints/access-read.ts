import { Hono } from 'hono';
import { z } from 'zod';
import { AccessAuthenticator, accessConfiguration } from '../adapters/auth/access-authenticator';
import type { AccessJwtOptions } from '../adapters/auth/access-jwt';
import { D1InstrumentRepository } from '../adapters/d1/instruments';
import { D1QuotationRepository } from '../adapters/d1/quotations';
import { D1PortfolioRepository } from '../adapters/d1/portfolio';
import { InstrumentService } from '../application/instruments';
import { QuotationService } from '../application/quotations';
import { PortfolioService } from '../application/portfolio';
import { ValuationService } from '../application/valuation';
import type { Principal } from '../application/authorization';
import { createApp } from '../app';

/** Mounts the existing REST/MCP readers, leaving every mutation route absent.
 * @remarks Authorization remains enforced by the shared services. This route
 * allowlist additionally prevents administrative or ingestion adapters being reached.
 */
export function createAccessReadApp(instruments: InstrumentService, quotations: QuotationService,
  authenticate: (request: Request) => Promise<Principal>,
  portfolioReads?: { portfolio: PortfolioService; valuation: ValuationService }) {
  const backend = createApp({
    instruments: { service: instruments, authenticate },
    quotations: { service: quotations, authenticate },
    ...(portfolioReads ? {
      portfolio: { service: portfolioReads.portfolio, authenticate },
      valuation: { service: portfolioReads.valuation, authenticate },
    } : {}),
    mcp: { service: instruments, quotations, ...portfolioReads, authenticate, challenge: () => 'Bearer', oauthScopes: [] },
  });
  const app = new Hono();
  app.use('*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
    context.header('X-Content-Type-Options', 'nosniff');
  });
  const forward = (request: Request) => backend.fetch(request);
  app.all('/mcp', context => forward(context.req.raw));
  app.get('/api/v1/instruments', context => forward(context.req.raw));
  app.get('/api/v1/instruments/:id', context => forward(context.req.raw));
  app.get('/api/v1/quotation-status', context => forward(context.req.raw));
  app.get('/api/v1/quotations', context => forward(context.req.raw));
  if (portfolioReads) {
    app.get('/api/v1/portfolio/opening-state', context => forward(context.req.raw));
    app.get('/api/v1/portfolio/opening-state/revisions/:revision', context => forward(context.req.raw));
    app.get('/api/v1/portfolio/positions', context => forward(context.req.raw));
    app.get('/api/v1/portfolio/valuation', context => forward(context.req.raw));
  }
  return app;
}

const configuration = z.object({
  INSTRUMENTS_DB: z.custom<D1Database>(value => value !== null && typeof value === 'object' && 'prepare' in value),
  ACCESS_TEAM_DOMAIN: accessConfiguration.shape.issuer,
  ACCESS_READ_AUD: accessConfiguration.shape.audience,
  ACCESS_OWNER_SUB: accessConfiguration.shape.ownerSubject,
  ACCESS_READ_ENABLED: z.enum(['true', 'false']),
  ACCESS_PORTFOLIO_READ_ENABLED: z.enum(['true', 'false']).default('false'),
}).strict();

/** Creates a D1-backed owner-only quotation reader with no write capability.
 * @param environment - Native D1 binding and independently approved Access application settings.
 * @param options - Existing JWT verifier dependencies, injectable for synthetic tests.
 * @remarks Only the verified owner gains read permissions; token scope claims never
 * select permissions. Portfolio reads additionally require explicit configuration,
 * so existing quotation-only deployments do not silently expose portfolio data.
 */
export function createAccessReadWorker(environment: D1LocalEnv & Record<string, unknown>, options: AccessJwtOptions = {}) {
  const config = configuration.parse(environment);
  const owner = new AccessAuthenticator({ issuer: config.ACCESS_TEAM_DOMAIN,
    audience: config.ACCESS_READ_AUD, ownerSubject: config.ACCESS_OWNER_SUB }, options);
  const instruments = new D1InstrumentRepository(config.INSTRUMENTS_DB);
  const quotations = new QuotationService(new D1QuotationRepository(config.INSTRUMENTS_DB), instruments);
  const portfolio = config.ACCESS_PORTFOLIO_READ_ENABLED === 'true'
    ? new PortfolioService(new D1PortfolioRepository(config.INSTRUMENTS_DB), instruments) : undefined;
  const app = createAccessReadApp(new InstrumentService(instruments), quotations, async request => {
    await owner.authenticate(request);
    return Object.freeze({ subject: 'owner:financial-read',
      permissions: Object.freeze(['instruments:read', 'quotes:read', ...(portfolio ? ['portfolio:read' as const] : [])] as const) });
  }, portfolio ? { portfolio, valuation: new ValuationService(portfolio, quotations) } : undefined);
  return config.ACCESS_READ_ENABLED === 'true' ? app : new Hono().all('*', () => unavailable());
}

function unavailable(): Response {
  return Response.json({ type: 'about:blank', title: 'Service Unavailable', status: 503, code: 'read_unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

const applications = new WeakMap<object, ReturnType<typeof createAccessReadWorker>>();
export default {
  async fetch(request: Request, environment: D1LocalEnv & Record<string, unknown>): Promise<Response> {
    try {
      let app = applications.get(environment);
      if (!app) {
        app = createAccessReadWorker(environment);
        applications.set(environment, app);
      }
      return await app.fetch(request);
    } catch { return unavailable(); }
  },
} satisfies ExportedHandler<D1LocalEnv & Record<string, unknown>>;
