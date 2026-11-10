import { InstrumentService } from '../../src/application/instruments';
import { PortfolioService } from '../../src/application/portfolio';
import type { Principal } from '../../src/application/authorization';
import { MemoryInstrumentRepository } from '../../src/adapters/memory/instruments';
import { MemoryPortfolioRepository } from '../../src/adapters/memory/portfolio';
import { D1InstrumentRepository } from '../../src/adapters/d1/instruments';
import { D1PortfolioRepository } from '../../src/adapters/d1/portfolio';
import { openLocalD1 } from './d1-local.mjs';

export const portfolioAdmin: Principal = { subject: 'synthetic-owner', permissions: ['instruments:read', 'instruments:admin', 'portfolio:read', 'portfolio:admin'] };
export const portfolioReader: Principal = { subject: 'synthetic-owner', permissions: ['instruments:read', 'portfolio:read'] };
export const provenance = { source: 'Synthetic Bourse Direct fixture', reference: 'synthetic-opening' };
export const firstId = '00000000-0000-4000-8000-000000000001';
export const secondId = '00000000-0000-4000-8000-000000000002';
export function openingInput() {
  return { effective_at: '2026-11-09T00:00:00.000Z', provenance: { ...provenance }, cash: { currency: 'EUR', amount: '12.30' }, correction_reason: null,
    positions: [firstId, secondId].map((instrument_id, index) => ({ instrument_id, quantity: index ? '0.000000000001' : '9007199254740993', declared_pru: '3.1200', currency: 'EUR', provenance: { ...provenance } })) };
}
export async function portfolioFixture(kind: 'memory' | 'd1') {
  const local = kind === 'd1' ? await openLocalD1() : undefined;
  const instruments = local ? new D1InstrumentRepository(local.db) : new MemoryInstrumentRepository();
  const repository = local ? new D1PortfolioRepository(local.db) : new MemoryPortfolioRepository();
  let sequence = 0;
  const instrumentService = new InstrumentService(instruments, () => '2026-11-09T00:00:00.000Z', () => [firstId, secondId][sequence++]!);
  for (const key of ['first', 'second']) await instrumentService.create(portfolioAdmin, { name: `Synthetic position ${key}`, kind: 'etf', quote_currency: 'EUR', price_unit: 'currency_unit' }, key);
  const service = new PortfolioService(repository, instruments, () => '2026-11-10T00:00:00.000Z');
  return { local, instruments, instrumentService, repository, service, dispose: async () => { await local?.cleanup(); } };
}
