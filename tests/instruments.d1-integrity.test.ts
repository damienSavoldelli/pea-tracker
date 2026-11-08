import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { D1InstrumentRepository } from '../src/adapters/d1/instruments';
import { createInstrumentSchema, type Instrument } from '../src/domain/instruments';
import { openLocalD1, type LocalD1 } from './helpers/d1-local.mjs';
import { syntheticInput, syntheticIsin } from './helpers/instruments';
import { startLocalInstrumentServer } from './helpers/instruments-http-server.mjs';
import { assertContractResponse } from './helpers/openapi';

const time = '2026-11-08T10:00:00.000Z';
let sequence = 10000;
function record(fields: Partial<Instrument> = {}): Instrument {
  return {
    id: `20000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    ...createInstrumentSchema.parse(syntheticInput), version: 1, created_at: time, updated_at: time, ...fields,
  };
}

function input(value: Instrument) {
  return JSON.stringify({ name: value.name, kind: value.kind, isin: value.isin, quote_currency: value.quote_currency,
    price_unit: value.price_unit, exchange_mic: value.exchange_mic, provider_symbol: value.provider_symbol, active: value.active });
}

function insert(db: D1Database, value: Instrument, changes: Record<string, string | number | null> = {}) {
  const values = { ...value, active: value.active ? 1 : 0, ...changes };
  return db.prepare(`INSERT INTO instruments
    (id,name,kind,isin,quote_currency,price_unit,exchange_mic,provider_symbol,active,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(values.id, values.name, values.kind, values.isin, values.quote_currency,
    values.price_unit, values.exchange_mic, values.provider_symbol, values.active, values.version, values.created_at, values.updated_at).run();
}

function outcome(db: D1Database, value: Instrument, key: string, changes: { instrumentId?: string; snapshot?: string; canonical?: string } = {}) {
  return db.prepare(`INSERT INTO instrument_create_outcomes
    (subject,operation,idempotency_key,canonical_version,canonical_input,instrument_id,original_instrument_json,recorded_at)
    VALUES (?,'createInstrument',?,1,?,?,?,?)`)
    .bind('synthetic-integrity', key, changes.canonical ?? input(value), changes.instrumentId ?? value.id,
      changes.snapshot ?? JSON.stringify(value), value.created_at).run();
}

describe('local D1 schema integrity and repository rollback', () => {
  let local: LocalD1;
  beforeAll(async () => { local = await openLocalD1(); }, 30000);
  afterAll(async () => { await local?.cleanup(); });

  it.each([
    { id: 'not-a-uuid' }, { name: '' }, { name: ' Synthetic edge' }, { name: 'Synthetic\u0000invalid' },
    { name: '😀'.repeat(161) }, { kind: 'bond' }, { quote_currency: 'eur' }, { quote_currency: 'EURO' },
    { price_unit: 'unknown' }, { exchange_mic: 'xpar' }, { provider_symbol: 'bad symbol' },
    { active: 2 }, { active: 0.5 }, { version: 0 }, { version: Number.MAX_SAFE_INTEGER + 1 }, { version: 1.5 },
    { created_at: 'not-a-time' }, { updated_at: null }, { isin: 'bad' },
  ])('rejects malformed persisted scalar %j', async changes => {
    const before = await local.db.prepare('SELECT count(*) AS count FROM instruments').first('count');
    await expect(insert(local.db, record(), changes)).rejects.toThrow();
    expect(await local.db.prepare('SELECT count(*) AS count FROM instruments').first('count')).toBe(before);
  });

  it('permits multiple NULL ISINs and code-point-boundary Unicode names', async () => {
    const first = record({ name: '😀'.repeat(160) });
    const second = record();
    await insert(local.db, first);
    await insert(local.db, second);
    expect(await local.db.prepare('SELECT name FROM instruments WHERE id = ?').bind(first.id).first('name')).toBe(first.name);
    expect(await local.db.prepare('SELECT isin FROM instruments WHERE id = ?').bind(second.id).first()).toEqual({ isin: null });
  });

  it('enforces unique ISIN even when the existing instrument is inactive', async () => {
    await insert(local.db, record({ isin: syntheticIsin, active: false }));
    await expect(insert(local.db, record({ isin: syntheticIsin }))).rejects.toThrow();
  });

  it('protects immutable identity and requires one version step per update', async () => {
    const value = record({ exchange_mic: 'XXXX', provider_symbol: 'SYNTH-A' });
    await insert(local.db, value);
    for (const [column, changed] of Object.entries({ kind: 'stock', isin: syntheticIsin, quote_currency: 'GBP',
      price_unit: 'hundredth_currency_unit', exchange_mic: 'YYYY', provider_symbol: 'SYNTH-B', created_at: '2026-11-08T11:00:00.000Z' })) {
      await expect(local.db.prepare(`UPDATE instruments SET ${column} = ?, version = version + 1 WHERE id = ?`).bind(changed, value.id).run()).rejects.toThrow();
    }
    await expect(local.db.prepare('UPDATE instruments SET active = 0 WHERE id = ?').bind(value.id).run()).rejects.toThrow();
    expect(await local.db.prepare('SELECT version,active FROM instruments WHERE id = ?').bind(value.id).first()).toEqual({ version: 1, active: 1 });
  });

  it('enforces outcome identity, snapshot constraints, foreign keys and immutability', async () => {
    const value = record();
    await insert(local.db, value);
    const missing = record();
    await expect(outcome(local.db, missing, 'orphan')).rejects.toThrow();
    await expect(outcome(local.db, value, 'bad-json', { snapshot: '{' })).rejects.toThrow();
    await expect(outcome(local.db, value, 'wrong-id', { snapshot: JSON.stringify({ ...value, id: missing.id }) })).rejects.toThrow();
    await expect(outcome(local.db, value, 'wrong-version', { snapshot: JSON.stringify({ ...value, version: 2 }) })).rejects.toThrow();
    const { version: omittedVersion, ...withoutVersion } = value;
    expect(omittedVersion).toBe(1);
    await expect(outcome(local.db, value, 'missing-version', { snapshot: JSON.stringify(withoutVersion) })).rejects.toThrow();
    await expect(outcome(local.db, value, 'wrong-time', { snapshot: JSON.stringify({ ...value, updated_at: '2026-11-08T11:00:00.000Z' }) })).rejects.toThrow();
    await expect(outcome(local.db, value, 'bad-canonical', { canonical: 'not-json' })).rejects.toThrow();
    await outcome(local.db, value, 'immutable');
    await expect(outcome(local.db, value, 'immutable')).rejects.toThrow();
    await expect(local.db.prepare('UPDATE instrument_create_outcomes SET canonical_input = ? WHERE idempotency_key = ?').bind('{}', 'immutable').run()).rejects.toThrow();
    await expect(local.db.prepare('DELETE FROM instrument_create_outcomes WHERE idempotency_key = ?').bind('immutable').run()).rejects.toThrow();
    await expect(local.db.prepare('DELETE FROM instruments WHERE id = ?').bind(value.id).run()).rejects.toThrow();
    expect(await local.db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({ results: [] });
  });

  it('uses the primary and active/id indexes for bounded continuation queries', async () => {
    const unfiltered = await local.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM instruments WHERE id > ? ORDER BY id LIMIT ?')
      .bind('20000000-0000-4000-8000-000000000000', 101).all<{ detail: string }>();
    const filtered = await local.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM instruments WHERE active = ? AND id > ? ORDER BY id LIMIT ?')
      .bind(1, '20000000-0000-4000-8000-000000000000', 101).all<{ detail: string }>();
    expect(unfiltered.results.map(row => row.detail).join(' ')).toMatch(/SEARCH.*INDEX.*id/i);
    expect(filtered.results.map(row => row.detail).join(' ')).toContain('instruments_active_id');
  });

  it('rolls back an actual repository create if the outcome INSERT fails', async () => {
    const repository = new D1InstrumentRepository(local.db);
    const value = record();
    const beforeRows = await local.db.prepare('SELECT count(*) AS count FROM instruments').first('count');
    const beforeOutcomes = await local.db.prepare('SELECT count(*) AS count FROM instrument_create_outcomes').first('count');
    await local.db.prepare("CREATE TRIGGER test_reject_outcome BEFORE INSERT ON instrument_create_outcomes BEGIN SELECT RAISE(ABORT, 'synthetic_forced_failure'); END").run();
    const replay = { subject: 'synthetic-rollback', key: 'retry-after-failure', canonicalInput: input(value) };
    try {
      await expect(repository.create(value, replay)).rejects.toThrow();
    } finally { await local.db.prepare('DROP TRIGGER test_reject_outcome').run(); }
    expect(await local.db.prepare('SELECT count(*) AS count FROM instruments').first('count')).toBe(beforeRows);
    expect(await local.db.prepare('SELECT count(*) AS count FROM instrument_create_outcomes').first('count')).toBe(beforeOutcomes);
    expect(await repository.get(value.id)).toBeNull();
    expect(await repository.create(value, replay)).toEqual(value);
  });

  it('fails closed on stored domain-invalid rows and malformed original snapshots', async () => {
    const repository = new D1InstrumentRepository(local.db);
    const invalid = record({ name: '\u2003Synthetic padded' });
    await insert(local.db, invalid);
    await expect(repository.get(invalid.id)).rejects.toThrow();
    const value = record();
    await insert(local.db, value);
    const partial = { id: value.id, version: 1, created_at: time, updated_at: time };
    await outcome(local.db, value, 'partial-snapshot', { snapshot: JSON.stringify(partial) });
    await expect(repository.create(record(), { subject: 'synthetic-integrity', key: 'partial-snapshot', canonicalInput: input(value) })).rejects.toThrow();
  });

  it('sanitizes primary-key collisions and unrelated CHECK failures without reserving keys', async () => {
    const repository = new D1InstrumentRepository(local.db);
    const value = record();
    await insert(local.db, value);
    const replay = { subject: 'synthetic-private-errors', key: 'pk-collision', canonicalInput: input(value) };
    await expect(repository.create(value, replay)).rejects.toEqual(new Error('Instrument storage operation failed'));
    const invalid = record({ name: '' });
    await expect(repository.create(invalid, { ...replay, key: 'check-failure', canonicalInput: input(invalid) }))
      .rejects.toEqual(new Error('Instrument storage operation failed'));
    expect(await local.db.prepare('SELECT count(*) AS count FROM instrument_create_outcomes WHERE subject = ?')
      .bind(replay.subject).first('count')).toBe(0);
    expect(await repository.get(invalid.id)).toBeNull();
    const retry = record();
    expect(await repository.create(retry, { ...replay, canonicalInput: input(retry) })).toEqual(retry);
  });

  it('keeps unknown native read, list and update errors private at the repository boundary', async () => {
    const repository = new D1InstrumentRepository(local.db);
    await local.db.prepare('ALTER TABLE instruments RENAME TO synthetic_unavailable_instruments').run();
    try {
      await expect(repository.get(record().id)).rejects.toEqual(new Error('Instrument storage operation failed'));
      await expect(repository.list({ limit: 101, active: null, after: null })).rejects.toEqual(new Error('Instrument storage operation failed'));
      await expect(repository.update(record().id, 1, { active: false }, time)).rejects.toEqual(new Error('Instrument storage operation failed'));
    } finally {
      await local.db.prepare('ALTER TABLE synthetic_unavailable_instruments RENAME TO instruments').run();
    }
  });

  it('returns contract-valid HTTP 500 without exposing native SQL, bindings or private storage names', async () => {
    const repository = new D1InstrumentRepository(local.db);
    const server = await startLocalInstrumentServer({ principal: 'admin', repository });
    await local.db.prepare('ALTER TABLE instruments RENAME TO synthetic_private_storage_name').run();
    try {
      const id = record().id;
      for (const [method, path, body, headers] of [
        ['GET', '/api/v1/instruments', undefined, {}],
        ['GET', `/api/v1/instruments/${id}`, undefined, {}],
        ['POST', '/api/v1/instruments', syntheticInput, { 'Idempotency-Key': 'synthetic_private_binding' }],
        ['PATCH', `/api/v1/instruments/${id}`, { active: false }, { 'If-Match': '"1"' }],
      ] as const) {
        const response = await fetch(`${server.url}${path}`, { method, headers: { ...headers,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        await assertContractResponse(method, path, response.clone());
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(JSON.parse(text)).toMatchObject({ status: 500, code: 'internal_error', title: 'Internal Server Error' });
        expect(text).not.toMatch(/SELECT|UPDATE|INSERT|D1_ERROR|SQLITE|synthetic_private|no such table|constraint failed/);
      }
    } finally {
      await server.close();
      await local.db.prepare('ALTER TABLE synthetic_private_storage_name RENAME TO instruments').run();
    }
  });
});
