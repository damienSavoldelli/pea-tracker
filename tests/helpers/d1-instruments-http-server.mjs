import { D1InstrumentRepository } from '../../src/adapters/d1/instruments.ts';
import { startLocalInstrumentServer } from './instruments-http-server.mjs';

export async function startD1InstrumentServer(db, options) {
  // Fail at startup if migrations have not been explicitly applied. Never run DDL
  // during server startup or a request, and never expose raw database operations.
  const versions = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
  if (JSON.stringify(versions.results.map(row => row.name)) !== JSON.stringify(['0001_instruments.sql', '0002_instrument_create_outcomes.sql'])) {
    throw new Error('Apply the two local instrument migrations before starting');
  }
  return startLocalInstrumentServer({ ...options, repository: new D1InstrumentRepository(db) });
}
