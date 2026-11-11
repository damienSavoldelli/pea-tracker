import { ValuationService } from '../../src/application/valuation';
import { quotationFixture, observation, quotationCollector, selector } from './quotations';
import { openingInput, portfolioAdmin, firstId, secondId } from './portfolio';
import type { Principal } from '../../src/application/authorization';
import { PortfolioService } from '../../src/application/portfolio';
import { MemoryPortfolioRepository } from '../../src/adapters/memory/portfolio';
import { D1PortfolioRepository } from '../../src/adapters/d1/portfolio';

export const valuationReader: Principal = { subject: 'synthetic-valuation-reader', permissions: ['instruments:read', 'portfolio:read', 'quotes:read'] };
export const valuationSelection = { provider: selector.provider, price_kind: selector.price_kind, adjustment: selector.adjustment };
export async function valuationFixture(kind: 'memory' | 'd1', initialize = true) {
  const f = await quotationFixture(kind);
  f.grants[0]!.instrument_ids.push(secondId);
  f.clock.now = '2026-11-10T10:02:00.000Z';
  const input = openingInput();
  input.positions = input.positions.map(position => ({ ...position, quantity: '1' }));
  const portfolio = new PortfolioService(f.local ? new D1PortfolioRepository(f.local.db) : new MemoryPortfolioRepository(), f.instruments, () => f.clock.now);
  if (initialize) await portfolio.append(portfolioAdmin, input, 0, 'synthetic-valuation-opening');
  const valuation = new ValuationService(portfolio, f.service);
  const seed = () => f.service.ingest(quotationCollector, { observations: [firstId, secondId].map(instrument_id => observation({ instrument_id, price: '0.005' })) }, 'synthetic-valuation-quotes');
  return { ...f, valuation, portfolio, input, seed };
}
