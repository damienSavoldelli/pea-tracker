import type { Principal } from '../../src/application/authorization';
import { QuotationService } from '../../src/application/quotations';
import { D1QuotationRepository } from '../../src/adapters/d1/quotations';
import { MemoryQuotationRepository } from '../../src/adapters/memory/quotations';
import type { ObservationInput, MarketContext } from '../../src/domain/quotations';
import { portfolioFixture, firstId } from './portfolio';

export const quotationReader: Principal = { subject: 'synthetic-owner', permissions: ['instruments:read', 'quotes:read'] };
export const quotationCollector: Principal = { subject: 'synthetic-collector', permissions: ['quotes:ingest'] };
export const selector = { instrument_id: firstId, provider: 'synthetic', price_kind: 'last_trade' as const, adjustment: 'unadjusted' as const };
export function observation(patch: Partial<ObservationInput> = {}): ObservationInput {
  return { ...selector, outcome: 'success', price: '9007199254740993.1200', currency: 'EUR', price_unit: 'currency_unit',
    market_timestamp: '2026-11-09T10:00:00.000Z', fetched_at: '2026-11-09T10:01:00.000Z', session_date: '2026-11-09',
    provider_delay_seconds: 900, error_code: null, provenance: { source: 'Synthetic market-data fixture', reference: 'synthetic-observation' }, ...patch };
}
export function unavailable(patch: Partial<ObservationInput> = {}) {
  return observation({ outcome: 'unavailable', price: null, currency: null, price_unit: null, market_timestamp: null, session_date: null,
    provider_delay_seconds: null, error_code: 'provider_unavailable', fetched_at: '2026-11-09T10:02:00.000Z', ...patch });
}
export async function quotationFixture(kind: 'memory' | 'd1') {
  const f = await portfolioFixture(kind);
  const repository = f.local ? new D1QuotationRepository(f.local.db) : new MemoryQuotationRepository();
  const clock = { now: '2026-11-09T10:02:00.000Z' };
  const context: MarketContext = { phase: 'open', expected_session_date: '2026-11-09' };
  const grants = [{ subject: quotationCollector.subject, provider: selector.provider, instrument_ids: [selector.instrument_id] }];
  const service = new QuotationService(repository, f.instruments, grants, () => clock.now, () => context);
  return { ...f, repository, service, clock, context, grants };
}
