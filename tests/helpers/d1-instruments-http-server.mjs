import { D1InstrumentRepository } from '../../src/adapters/d1/instruments.ts';
import { startLocalInstrumentServer } from './instruments-http-server.mjs';
import { createApp } from '../../src/app.ts';
import { InstrumentService } from '../../src/application/instruments.ts';
import { PortfolioService } from '../../src/application/portfolio.ts';
import { D1PortfolioRepository } from '../../src/adapters/d1/portfolio.ts';
import { ApplicationError } from '../../src/application/errors.ts';

export async function startD1InstrumentServer(db, options) {
  // Fail at startup if migrations have not been explicitly applied. Never run DDL
  // during server startup or a request, and never expose raw database operations.
  const versions = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
  if (JSON.stringify(versions.results.map(row => row.name)) !== JSON.stringify(['0001_instruments.sql', '0002_instrument_create_outcomes.sql', '0003_opening_portfolio.sql'])) {
    throw new Error('Apply the three local application migrations before starting');
  }
  const repository = new D1InstrumentRepository(db);
  if (!options.portfolio) return startLocalInstrumentServer({ ...options, repository });
  const role = options.principal ?? 'reader';
  if (!['reader', 'admin', 'collector', 'anonymous'].includes(role)) throw new Error('Invalid synthetic role');
  const principal = role === 'anonymous' ? null : { subject: `synthetic-local-${role}`,
    permissions: role === 'admin' ? ['instruments:read', 'instruments:admin', 'portfolio:read', 'portfolio:admin']
      : role === 'reader' ? ['instruments:read', 'portfolio:read'] : [] };
  const service = new InstrumentService(repository);
  const portfolio = new PortfolioService(new D1PortfolioRepository(db), repository);
  return startLocalInstrumentServer({ ...options, app: createApp({
    instruments: { service, authenticate: () => principal },
    portfolio: { service: portfolio, authenticate: () => principal },
    mcp: { service, portfolio, authenticate: async () => {
      if (!principal) throw new ApplicationError(401, 'unauthenticated');
      return principal;
    }, challenge: () => 'Bearer', oauthScopes: [] },
  }) });
}
