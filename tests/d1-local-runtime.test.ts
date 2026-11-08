import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openLocalD1, readPersistenceProbe, type LocalD1 } from './helpers/d1-local.mjs';

describe('native Wrangler local D1 gates', () => {
  let local: LocalD1;
  beforeAll(async () => { local = await openLocalD1({ migrate: false }); }, 30000);
  afterAll(async () => { await local?.cleanup(); });

  it('initializes an ID-free local binding and persists through runtime disposal', async () => {
    await local.db.prepare('CREATE TABLE gate_persistence (id INTEGER PRIMARY KEY, value TEXT NOT NULL)').run();
    await local.db.prepare('INSERT INTO gate_persistence VALUES (1, ?)').bind('synthetic-only').run();
    const directory = local.directory;
    await local.dispose();
    expect(await readPersistenceProbe(directory)).toMatchObject([{ results: [{ value: 'synthetic-only' }] }]);
    local = await openLocalD1({ directory, migrate: false });
    expect(await local.db.prepare('SELECT value FROM gate_persistence WHERE id = 1').first('value')).toBe('synthetic-only');
  }, 30000);

  it('rolls back earlier writes when a later SQL statement fails', async () => {
    await local.db.prepare('CREATE TABLE gate_rollback (id INTEGER PRIMARY KEY, value INTEGER CHECK(value > 0))').run();
    await expect(local.db.batch([
      local.db.prepare('INSERT INTO gate_rollback VALUES (1, 1)'),
      local.db.prepare('INSERT INTO gate_rollback VALUES (2, -1)'),
    ])).rejects.toThrow();
    expect(await local.db.prepare('SELECT count(*) AS count FROM gate_rollback').first('count')).toBe(0);
  });

  it('proves zero-row UPDATE is successful SQL and does not roll back a later independent write', async () => {
    const results = await local.db.batch([
      local.db.prepare('UPDATE gate_persistence SET value = ? WHERE id = 999').bind('unchanged'),
      local.db.prepare('INSERT INTO gate_persistence VALUES (2, ?)').bind('independent-write'),
    ]);
    expect(results[0]?.success).toBe(true);
    expect(results[0]?.meta.changes).toBe(0);
    expect(results[1]?.meta.changes).toBe(1);
    expect(await local.db.prepare('SELECT value FROM gate_persistence WHERE id = 2').first('value')).toBe('independent-write');
  });

  it('enforces foreign keys and reports changed rows in a successful batch', async () => {
    await local.db.prepare('CREATE TABLE gate_child (id INTEGER REFERENCES gate_persistence(id))').run();
    await expect(local.db.prepare('INSERT INTO gate_child VALUES (999)').run()).rejects.toThrow();
    const results = await local.db.batch([
      local.db.prepare('UPDATE gate_persistence SET value = ? WHERE id = 1').bind('updated-synthetic'),
      local.db.prepare('SELECT value FROM gate_persistence WHERE id = 1'),
    ]);
    expect(results[0]?.meta.changes).toBe(1);
    expect(results[1]?.results).toEqual([{ value: 'updated-synthetic' }]);
  });

  it('isolates different persistence directories', async () => {
    const other = await openLocalD1({ migrate: false });
    try {
      expect(await other.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'gate_persistence'").first('count')).toBe(0);
    } finally { await other.cleanup(); }
  }, 30000);
});
