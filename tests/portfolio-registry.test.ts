import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PortfolioRegistryService } from '../src/application/portfolio-registry';
import { D1PortfolioRegistryRepository } from '../src/adapters/d1/portfolio-registry';
import { initialJournalBalances } from '../src/domain/transactions';
import { openingInputSchema } from '../src/domain/portfolio';
import { portfolioFixture, portfolioAdmin, portfolioReader, openingInput, firstId, provenance } from './helpers/portfolio';

const at = '2026-11-21T12:00:00.000Z';
const empty = () => ({ effective_at: '2026-11-20T12:00:00.000Z', positions: [],
  cash: { currency: 'EUR', amount: '0' }, provenance, correction_reason: null });
const input = (kind: 'real' | 'simulated' = 'real') => ({ name: 'Synthetic portfolio', kind, opening: empty() });

describe('internal portfolio registry with independent immutable openings', () => {
  let f: Awaited<ReturnType<typeof portfolioFixture>>;
  let repository: D1PortfolioRegistryRepository;
  let service: PortfolioRegistryService;
  beforeAll(async () => {
    f = await portfolioFixture('d1');
    repository = new D1PortfolioRegistryRepository(f.local!.db);
    service = new PortfolioRegistryService(repository, f.instruments, () => at);
  }, 30000);
  afterAll(async () => { await f?.dispose(); });

  it('creates N real and simulated portfolios before any journal event, with separate zero-cash openings', async () => {
    const created = [];
    for (const kind of ['real', 'real', 'real', 'simulated', 'simulated', 'simulated'] as const)
      created.push(await service.create(portfolioAdmin, input(kind)));
    expect(new Set(created.map(row => row.id)).size).toBe(6);
    expect(new Set(created.map(row => row.opening.id)).size).toBe(6);
    for (const row of created) {
      expect(await service.get(portfolioReader, row.id)).toEqual(row);
      expect(row.owner_subject).toBe(portfolioAdmin.subject);
      const opening = await service.opening(portfolioReader, row.id);
      const balances = initialJournalBalances({ portfolio_id: row.id, owner_subject: row.owner_subject,
        kind: row.kind, opening_id: row.opening.id, opening_revision: 1 }, opening);
      expect(balances).toMatchObject({ portfolio_id: row.id, kind: row.kind, version: 0, cash: { amount: '0' }, positions: [] });
      expect(opening.provenance).toEqual(provenance);
    }
    const first = await service.list(portfolioReader, { limit: 2 });
    const second = await service.list(portfolioReader, { limit: 100, after: first[1]!.id });
    expect([...first, ...second].map(row => row.id)).toEqual(created.map(row => row.id).sort());
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_events').first('n')).toBe(0);
    expect(await f.local!.db.prepare('SELECT count(*) n FROM transaction_journals').first('n')).toBe(0);
    expect(await f.repository.get()).toBeNull();
  });
  it('keeps exact declared holdings/costs separate from an empty opening and from V1', async () => {
    const data = { ...input(), opening: { ...openingInput(), effective_at: empty().effective_at } };
    const row = await service.create(portfolioAdmin, data);
    expect((await service.opening(portfolioReader, row.id)).positions).toEqual(openingInputSchema.parse(data.opening).positions);
    await expect(f.local!.db.prepare('DELETE FROM instruments WHERE id=?').bind(firstId).run()).rejects.toThrow();
    expect(await f.repository.get()).toBeNull();
    const other = await service.create(portfolioAdmin, input('simulated'));
    expect((await service.opening(portfolioReader, other.id)).positions).toEqual([]);
  });
  it('scopes reads, lists and archive to the authenticated owner, without a global owner', async () => {
    const owner = { ...portfolioAdmin, subject: 'synthetic-second-owner' };
    const row = await service.create(owner, input());
    expect(await service.list(owner)).toEqual([row]);
    await expect(service.get(portfolioReader, row.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.opening(portfolioReader, row.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.archive(portfolioAdmin, row.id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(service.create(portfolioReader, input())).rejects.toMatchObject({ status: 403 });
    await expect(service.create(null, input())).rejects.toMatchObject({ status: 401 });
    await expect(service.create(owner, { ...input(), owner_subject: portfolioAdmin.subject })).rejects.toMatchObject({ status: 422 });
  });
  it.each([
    { cash: null }, { cash: { currency: 'EUR', amount: '-1' } }, { cash: { currency: 'USD', amount: '1' } },
    { correction_reason: 'Not a new opening' }, { effective_at: '2026-11-22T00:00:00.000Z' },
    { positions: [{ ...openingInput().positions[0]!, currency: 'USD' }] },
  ])('rejects incompatible new opening input %s', async changes => {
    await expect(service.create(portfolioAdmin, { ...input(), opening: { ...empty(), ...changes } })).rejects.toMatchObject({ status: 422 });
  });
  it('rejects mismatched opening references, unknown instruments, duplicate UUIDs and lifecycle mutation', async () => {
    const row = await service.create(portfolioAdmin, input());
    const opening = await service.opening(portfolioReader, row.id);
    await expect(repository.create(row, { ...opening, id: crypto.randomUUID() })).rejects.toThrow('independent_opening_mismatch');
    await expect(repository.create(row, opening)).rejects.toMatchObject({ status: 409 });
    await expect(repository.create({ ...row, id: crypto.randomUUID(), owner_subject: 'other-owner' }, opening)).rejects.toMatchObject({ status: 409 });
    await expect(repository.create({ ...row, id: crypto.randomUUID(), kind: 'simulated' }, opening)).rejects.toMatchObject({ status: 409 });
    await expect(service.create(portfolioAdmin, { ...input(), opening: { ...empty(), positions: [
      { instrument_id: crypto.randomUUID(), quantity: '1', declared_pru: '1', currency: 'EUR', provenance },
    ] } })).rejects.toMatchObject({ code: 'unknown_instrument' });
    for (const [field, value] of [['owner_subject', 'other-owner'], ['kind', 'simulated'], ['opening_id', crypto.randomUUID()],
      ['opening_revision', 2], ['opening_json', '{}'], ['id', crypto.randomUUID()]] as const) {
      await expect(f.local!.db.prepare(`UPDATE portfolios SET ${field}=? WHERE id=?`).bind(value, row.id).run()).rejects.toThrow();
    }
    const archived = await service.archive(portfolioAdmin, row.id, 1);
    expect(archived).toEqual({ ...row, status: 'archived', version: 2 });
    expect(await service.opening(portfolioReader, row.id)).toEqual(opening);
    await expect(service.archive(portfolioAdmin, row.id, 1)).rejects.toMatchObject({ status: 412 });
    await expect(f.local!.db.prepare('DELETE FROM portfolios WHERE id=?').bind(row.id).run()).rejects.toThrow();
  });
  it('does not accept a synthetic portfolio UUID as an existing instrument', async () => {
    const row = await service.create(portfolioAdmin, input());
    expect(await f.instruments.get(row.id)).toBeNull();
    expect(await f.instruments.get(firstId)).not.toBeNull();
    expect((await f.local!.db.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });
});
