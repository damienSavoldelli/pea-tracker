import { Hono } from 'hono';
import { z } from 'zod';
import { FinancialAccessAuthenticator } from '../adapters/auth/financial-access';
import { accessConfiguration } from '../adapters/auth/access-authenticator';
import type { AccessJwtOptions } from '../adapters/auth/access-jwt';
import { D1InstrumentRepository } from '../adapters/d1/instruments';
import { D1PortfolioRepository } from '../adapters/d1/portfolio';
import { D1QuotationRepository } from '../adapters/d1/quotations';
import { D1TransactionRepository } from '../adapters/d1/transactions';
import { D1FinancialApprovalRepository } from '../adapters/d1/financial-approvals';
import { createMarketCalendar } from '../adapters/calendar/market-calendar';
import { InstrumentService } from '../application/instruments';
import { PortfolioService } from '../application/portfolio';
import { QuotationService } from '../application/quotations';
import { ValuationService } from '../application/valuation';
import { TransactionService } from '../application/transactions';
import { FinancialMcpService } from '../application/financial-mcp';
import { portfolioIdSchema } from '../domain/transactions';
import { createFinancialManagementApp } from '../financial-app';
import { D1OperationalOpeningRepository } from '../adapters/d1/operational-opening';

const configuration = z.object({
  INSTRUMENTS_DB: z.custom<D1Database>(value => value !== null && typeof value === 'object' && 'prepare' in value && 'batch' in value),
  ACCESS_TEAM_DOMAIN: accessConfiguration.shape.issuer,
  ACCESS_READ_AUD: accessConfiguration.shape.audience,
  ACCESS_OWNER_SUB: accessConfiguration.shape.ownerSubject,
  ACCESS_READ_ENABLED: z.enum(['true', 'false']), ACCESS_PORTFOLIO_READ_ENABLED: z.literal('true'),
  FINANCIAL_WRITES_ENABLED: z.enum(['true', 'false']).default('false'),
  ACCESS_CONFIRMATION_AUD: accessConfiguration.shape.audience,
  FINANCIAL_ORIGIN: z.string().url(), FINANCIAL_PORTFOLIO_ID: portfolioIdSchema,
  FINANCIAL_OWNER_ID: z.string().min(1).max(128).default('owner:financial-read'),
  FINANCIAL_OPENING_ID: z.string().uuid(), FINANCIAL_OPENING_REVISION: z.coerce.number().int().positive(),
  FINANCIAL_OPERATIONAL_OPENING_ID: z.string().uuid().optional(),
}).strict();
const unavailable = () => new Response('financial_service_unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });

/** Optional replacement composition for the SAME financial Worker and D1, never ingestion.
 * No Wrangler configuration currently selects it. Activation requires explicit authorization.
 */
export function createAccessFinancialWorker(environment: D1LocalEnv & Record<string, unknown>, options: AccessJwtOptions = {}) {
  const { MARKET_CALENDAR_ASSIGNMENTS, ...values } = environment;
  const config = configuration.parse(values);
  const clock = () => new Date(options.clock?.() ?? Date.now()).toISOString();
  const access = new FinancialAccessAuthenticator({ issuer: config.ACCESS_TEAM_DOMAIN, audience: config.ACCESS_READ_AUD,
    browserAudience: config.ACCESS_CONFIRMATION_AUD, ownerSubject: config.ACCESS_OWNER_SUB, internalSubject: config.FINANCIAL_OWNER_ID,
    financialWritesEnabled: config.FINANCIAL_WRITES_ENABLED === 'true' }, options);
  const instruments = new D1InstrumentRepository(config.INSTRUMENTS_DB);
  const openings = new D1PortfolioRepository(config.INSTRUMENTS_DB);
  const operational = config.FINANCIAL_OPERATIONAL_OPENING_ID ? new D1OperationalOpeningRepository(config.INSTRUMENTS_DB, {
    portfolio_id: config.FINANCIAL_PORTFOLIO_ID, owner_subject: config.FINANCIAL_OWNER_ID,
    id: config.FINANCIAL_OPERATIONAL_OPENING_ID,
    historical_opening_id: config.FINANCIAL_OPENING_ID, historical_opening_revision: config.FINANCIAL_OPENING_REVISION,
  }) : undefined;
  const journalOpenings = operational ? { get: async (revision?: number) => {
    const reference = await operational.get();
    return reference && (revision === undefined || revision === reference.opening.revision) ? reference.opening : null;
  } } : openings;
  const binding = { portfolio_id: config.FINANCIAL_PORTFOLIO_ID, owner_subject: config.FINANCIAL_OWNER_ID, kind: 'real' as const,
    opening_id: config.FINANCIAL_OPERATIONAL_OPENING_ID ?? config.FINANCIAL_OPENING_ID,
    opening_revision: operational ? 1 : config.FINANCIAL_OPENING_REVISION };
  const journal = new TransactionService(new D1TransactionRepository(config.INSTRUMENTS_DB), journalOpenings, instruments, binding, clock);
  const financial = new FinancialMcpService(journal, { portfolio_id: binding.portfolio_id, owner_subject: binding.owner_subject },
    new D1FinancialApprovalRepository(config.INSTRUMENTS_DB), clock, config.FINANCIAL_ORIGIN);
  const portfolio = new PortfolioService(openings, instruments, clock, undefined, journal, operational);
  const market = createMarketCalendar(MARKET_CALENDAR_ASSIGNMENTS);
  const quotations = new QuotationService(new D1QuotationRepository(config.INSTRUMENTS_DB), instruments, [], clock,
    (_selector, now, instrument) => market(instrument, now));
  const valuation = new ValuationService(portfolio, quotations);
  const service = new InstrumentService(instruments, clock);
  const authenticate = (request: Request) => access.authenticateMcp(request);
  const backend = createFinancialManagementApp({ financial, access, origin: config.FINANCIAL_ORIGIN,
    rest: { instruments: { service, authenticate }, quotations: { service: quotations, authenticate },
      portfolio: { service: portfolio, authenticate }, valuation: { service: valuation, authenticate },
      currentPortfolio: { portfolio, valuation, authenticate } },
    mcp: { service, portfolio, quotations, valuation, currentPortfolio: portfolio, currentValuation: valuation,
      challenge: () => 'Bearer', oauthScopes: [] } });
  const app = new Hono();
  app.use('*', async (context, next) => { await next(); context.header('Cache-Control', 'no-store'); context.header('X-Content-Type-Options', 'nosniff'); });
  if (config.ACCESS_READ_ENABLED !== 'true') return app.all('*', () => unavailable());
  const forward = (request: Request) => backend.fetch(request);
  app.all('/mcp', context => forward(context.req.raw));
  app.all('/financial-confirmation/:id', context => forward(context.req.raw));
  for (const path of ['/api/v1/instruments', '/api/v1/instruments/:id', '/api/v1/quotation-status', '/api/v1/quotations',
    '/api/v1/portfolio/opening-state', '/api/v1/portfolio/opening-state/revisions/:revision', '/api/v1/portfolio/positions',
    '/api/v1/portfolio/valuation', '/api/v1/portfolios/:portfolioId/state', '/api/v1/portfolios/:portfolioId/valuation']) {
    app.get(path, context => forward(context.req.raw));
  }
  return app;
}

const applications = new WeakMap<object, ReturnType<typeof createAccessFinancialWorker>>();
export default {
  async fetch(request: Request, environment: D1LocalEnv & Record<string, unknown>): Promise<Response> {
    try {
      let app = applications.get(environment);
      if (!app) { app = createAccessFinancialWorker(environment); applications.set(environment, app); }
      return await app.fetch(request);
    } catch { return unavailable(); }
  },
} satisfies ExportedHandler<D1LocalEnv & Record<string, unknown>>;
