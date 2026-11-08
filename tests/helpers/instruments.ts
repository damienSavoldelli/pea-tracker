import { MemoryInstrumentRepository } from '../../src/adapters/memory/instruments';
import { InstrumentService } from '../../src/application/instruments';
import type { Principal } from '../../src/application/authorization';

export const admin: Principal = { subject: 'synthetic-owner', permissions: ['instruments:read', 'instruments:admin'] };
export const reader: Principal = { subject: 'synthetic-reader', permissions: ['instruments:read'] };
export const collector: Principal = { subject: 'synthetic-collector', permissions: [] };
export const syntheticInput = { name: 'Synthetic ETF A', kind: 'etf', quote_currency: 'EUR', price_unit: 'currency_unit' };
export const syntheticIsin = 'ZZ0000000008'; // Checksum-valid fixture, not an allocated security.
export const missingId = '00000000-0000-4000-8000-000000000000';

export function fixture() {
  let sequence = 0;
  const repository = new MemoryInstrumentRepository();
  const service = new InstrumentService(repository, () => '2026-11-08T10:00:00.000Z',
    () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
  return { repository, service };
}
