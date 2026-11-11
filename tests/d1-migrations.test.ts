import { afterEach, describe, expect, it } from 'vitest';
import { openLocalD1, runLocalMigrations, type LocalD1 } from './helpers/d1-local.mjs';
import { migrationFixture } from './helpers/d1-migration-fixtures.mjs';
import { D1PortfolioRepository } from '../src/adapters/d1/portfolio';
import { openingStateSchema } from '../src/domain/portfolio';

const originalId = '10000000-0000-4000-8000-000000000001';
const time = '2026-11-08T10:00:00.000Z';
const migrationNames = ['0001_instruments.sql', '0002_instrument_create_outcomes.sql', '0003_opening_portfolio.sql', '0004_quotations.sql'];

async function seedOriginal(db: D1Database) {
  await db.prepare(`INSERT INTO instruments
    (id,name,kind,isin,quote_currency,price_unit,exchange_mic,provider_symbol,active,version,created_at,updated_at)
    VALUES (?,?,?,NULL,?,?,NULL,NULL,1,1,?,?)`)
    .bind(originalId, 'Synthetic migration fixture', 'etf', 'EUR', 'currency_unit', time, time).run();
}

async function applied(db: D1Database) {
  const result = await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>();
  return result.results.map(row => row.name);
}

describe('Wrangler local versioned migrations', () => {
  let local: LocalD1 | undefined;
  afterEach(async () => { await local?.cleanup(); local = undefined; });

  it('applies all source versions and does not reapply them', async () => {
    local = await openLocalD1();
    expect(await applied(local.db)).toEqual(migrationNames);
    await seedOriginal(local.db);
    const directory = local.directory;
    await local.dispose();
    await runLocalMigrations(directory);
    local = await openLocalD1({ directory, migrate: false });
    expect(await applied(local.db)).toEqual(migrationNames);
    expect(await local.db.prepare('SELECT name FROM instruments WHERE id = ?').bind(originalId).first('name')).toBe('Synthetic migration fixture');
    expect(await local.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] });
  }, 60000);

  it('upgrades populated v1 state to v2 without replacing catalog records', async () => {
    local = await openLocalD1({ migrate: false });
    const directory = local.directory;
    await local.dispose();
    const v1 = await migrationFixture(directory, 'v1');
    await runLocalMigrations(directory, { migrationsDirectory: v1 });
    local = await openLocalD1({ directory, migrate: false });
    expect(await applied(local.db)).toEqual(migrationNames.slice(0, 1));
    await seedOriginal(local.db);
    await local.dispose();
    await runLocalMigrations(directory);
    local = await openLocalD1({ directory, migrate: false });
    expect(await applied(local.db)).toEqual(migrationNames);
    expect(await local.db.prepare('SELECT id,name,version,created_at FROM instruments WHERE id = ?').bind(originalId).first())
      .toEqual({ id: originalId, name: 'Synthetic migration fixture', version: 1, created_at: time });
    expect(await local.db.prepare('SELECT count(*) AS count FROM instrument_create_outcomes').first('count')).toBe(0);
  }, 60000);

  it('rolls back a failing migration while retaining successful versions and earlier data', async () => {
    local = await openLocalD1();
    await seedOriginal(local.db);
    const directory = local.directory;
    await local.dispose();
    const failing = await migrationFixture(directory, 'failing');
    await expect(runLocalMigrations(directory, { migrationsDirectory: failing })).rejects.toThrow();
    local = await openLocalD1({ directory, migrate: false });
    expect(await applied(local.db)).toEqual(migrationNames);
    expect(await local.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'migration_must_rollback'").first('count')).toBe(0);
    expect(await local.db.prepare('SELECT name FROM instruments WHERE id = ?').bind(originalId).first('name')).toBe('Synthetic migration fixture');
  }, 60000);

  it('upgrades populated v2 catalog/outcomes to current schema without inventing an opening state', async () => {
    local = await openLocalD1({ migrate: false });
    const directory = local.directory;
    await local.dispose();
    const v2 = await migrationFixture(directory, 'v2');
    await runLocalMigrations(directory, { migrationsDirectory: v2 });
    local = await openLocalD1({ directory, migrate: false });
    await seedOriginal(local.db);
    await local.dispose();
    await runLocalMigrations(directory);
    local = await openLocalD1({ directory, migrate: false });
    expect(await applied(local.db)).toEqual(migrationNames);
    expect(await local.db.prepare('SELECT name FROM instruments WHERE id = ?').bind(originalId).first('name')).toBe('Synthetic migration fixture');
    expect(await local.db.prepare('SELECT count(*) n FROM opening_revisions').first('n')).toBe(0);
    expect((await local.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  }, 60000);
  it('upgrades populated v3 opening state to v4 without altering declarations or inventing prices', async () => {
    local = await openLocalD1({ migrate: false });
    const directory = local.directory;
    await local.dispose();
    const v3 = await migrationFixture(directory, 'v3');
    await runLocalMigrations(directory, { migrationsDirectory: v3 });
    local = await openLocalD1({ directory, migrate: false });
    await seedOriginal(local.db);
    const state = openingStateSchema.parse({ id: '00000000-0000-4000-8000-000000000001', revision: 1,
      effective_at: time, recorded_at: time, correction_reason: null, cash: null,
      provenance: { source: 'Synthetic v3 migration', reference: null },
      positions: [{ instrument_id: originalId, quantity: '2', declared_pru: '3.12', currency: 'EUR', provenance: { source: 'Synthetic v3 migration', reference: null } }] });
    await new D1PortfolioRepository(local.db).append(state, 0, { subject: 'synthetic-migration-owner', key: 'opening', canonicalInput: 'synthetic-v3-canonical' });
    await local.dispose();
    await runLocalMigrations(directory);
    local = await openLocalD1({ directory, migrate: false });
    expect(await applied(local.db)).toEqual(migrationNames);
    expect(await new D1PortfolioRepository(local.db).get()).toEqual(state);
    expect(await local.db.prepare('SELECT count(*) n FROM quotation_observations').first('n')).toBe(0);
    expect((await local.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  }, 60000);
});
