import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

/** Synthetic in-memory SQLite migration-precondition check; never opens a file DB. */
export async function migrationRejectsNonemptyJournal(portfolioId) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of ['0001_instruments.sql', '0002_instrument_create_outcomes.sql', '0003_opening_portfolio.sql', '0004_quotations.sql', '0005_transactions.sql', '0006_financial_approvals.sql']) {
      db.exec(await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
    }
    // The guard must reject even an incomplete journal before touching any schema.
    db.exec('DROP TRIGGER transaction_event_sequence; DROP TRIGGER transaction_event_advance; PRAGMA foreign_keys=OFF;');
    db.prepare('INSERT INTO transaction_events(id,portfolio_id,sequence,event_json,balances_json) VALUES (?,?,?,?,?)')
      .run('synthetic', portfolioId, 1, JSON.stringify({ id: 'synthetic', portfolio_id: portfolioId, sequence: 1 }), JSON.stringify({ portfolio_id: portfolioId, version: 1 }));
    const migration = await readFile(new URL('../../migrations/0007_operational_opening.sql', import.meta.url), 'utf8');
    db.exec('BEGIN'); let rejected = false;
    try { db.exec(migration); } catch { rejected = true; }
    db.exec('ROLLBACK');
    return { rejected, events: db.prepare('SELECT COUNT(*) n FROM transaction_events').get().n,
      new_tables: db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='portfolio_operational_openings'").get().n };
  } finally { db.close(); }
}

/** Optional local owner-data check; nothing is loaded by normal synthetic tests. */
export async function privateOperationalReference() {
  const path = process.env.PEA_PRIVATE_OPERATIONAL_REFERENCE;
  if (!path) return null;
  const { resolve } = await import('node:path');
  const base = resolve('.wrangler') + '/';
  if (!resolve(path).startsWith(base) || !path.endsWith('.private.json')) throw new Error('Private reference must remain in ignored local state');
  return JSON.parse(await readFile(path, 'utf8'));
}
