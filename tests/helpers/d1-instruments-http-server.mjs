import { D1InstrumentRepository } from '../../src/adapters/d1/instruments.ts';
import { startLocalInstrumentServer } from './instruments-http-server.mjs';
import { createApp } from '../../src/app.ts';
import { InstrumentService } from '../../src/application/instruments.ts';
import { PortfolioService } from '../../src/application/portfolio.ts';
import { D1PortfolioRepository } from '../../src/adapters/d1/portfolio.ts';
import { ApplicationError } from '../../src/application/errors.ts';
import { QuotationService } from '../../src/application/quotations.ts';
import { D1QuotationRepository } from '../../src/adapters/d1/quotations.ts';

export async function startD1InstrumentServer(db, options) {
  // Fail at startup if migrations have not been explicitly applied. Never run DDL
  // during server startup or a request, and never expose raw database operations.
  const versions = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
  if (JSON.stringify(versions.results.map(row => row.name)) !== JSON.stringify(['0001_instruments.sql', '0002_instrument_create_outcomes.sql', '0003_opening_portfolio.sql', '0004_quotations.sql'])) {
    throw new Error('Apply the four local application migrations before starting');
  }
  const repository = new D1InstrumentRepository(db);
  if (!options.portfolio && !options.quotations) return startLocalInstrumentServer({ ...options, repository });
  const role = options.principal ?? 'reader';
  if (!['reader', 'admin', 'collector', 'anonymous'].includes(role)) throw new Error('Invalid synthetic role');
  const reads = ['instruments:read', ...(options.portfolio ? ['portfolio:read'] : []), ...(options.quotations ? ['quotes:read'] : [])];
  const principal = role === 'anonymous' ? null : { subject: `synthetic-local-${role}`,
    permissions: role === 'admin' ? [...reads, 'instruments:admin', ...(options.portfolio ? ['portfolio:admin'] : [])]
      : role === 'reader' ? reads : options.quotations ? ['quotes:ingest'] : [] };
  const service = new InstrumentService(repository);
  const portfolio = new PortfolioService(new D1PortfolioRepository(db), repository);
  const catalog = options.quotations ? await repository.list({ limit: 100, active: null, after: null }) : [];
  const quotations = new QuotationService(new D1QuotationRepository(db), repository,
    [{ subject: 'synthetic-local-collector', provider: 'synthetic', instrument_ids: catalog.map(record => record.id) }]);
  return startLocalInstrumentServer({ ...options, app: createApp({
    instruments: { service, authenticate: () => principal },
    ...(options.portfolio ? { portfolio: { service: portfolio, authenticate: () => principal } } : {}),
    ...(options.quotations ? { quotations: { service: quotations, authenticate: () => principal } } : {}),
    mcp: { service, ...(options.portfolio ? { portfolio } : {}), ...(options.quotations ? { quotations } : {}), authenticate: async () => {
      if (!principal) throw new ApplicationError(401, 'unauthenticated');
      return principal;
    }, challenge: () => 'Bearer', oauthScopes: [] },
  }) });
}
