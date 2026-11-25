import { openingStateSchema } from '../../domain/portfolio';
import { independentOpening, registeredPortfolioSchema, type RegisteredPortfolio } from '../../domain/portfolio-registry';
import type { OpeningState } from '../../domain/portfolio';
import type { PortfolioRegistryRepository } from '../../ports/portfolio-registry';
import { ApplicationError } from '../../application/errors';

interface Row {
  id: string; owner_subject: string; name: string; kind: string; status: string; version: number;
  opening_source: string; opening_id: string; opening_revision: number; created_at: string; updated_at: string;
}
function decode(row: Row) {
  const { opening_source, opening_id, opening_revision, ...metadata } = row;
  return registeredPortfolioSchema.parse({ ...metadata, opening: { source: opening_source, id: opening_id, revision: opening_revision } });
}
const columns = 'id,owner_subject,name,kind,status,version,opening_source,opening_id,opening_revision,created_at,updated_at';

export class D1PortfolioRegistryRepository implements PortfolioRegistryRepository {
  constructor(private readonly db: D1Database) {}
  async create(input: RegisteredPortfolio, state: OpeningState) {
    const row = registeredPortfolioSchema.parse(input);
    const opening = independentOpening(row, state);
    if (row.status !== 'active' || row.version !== 1 || row.updated_at !== row.created_at) throw new Error('invalid_registry_initial_state');
    try {
      await this.db.prepare(`INSERT INTO portfolios (${columns},opening_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(row.id, row.owner_subject, row.name, row.kind, row.status, row.version,
          row.opening.source, row.opening.id, row.opening.revision, row.created_at, row.updated_at, JSON.stringify(opening)).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE constraint failed')) throw new ApplicationError(409, 'portfolio_already_exists');
      if (message.includes('unknown_instrument')) throw new ApplicationError(422, 'unknown_instrument');
      if (message.includes('portfolio_anchor_mismatch')) throw new ApplicationError(409, 'opening_anchor_mismatch');
      throw new Error('Portfolio registry storage failed');
    }
    return row;
  }
  async get(owner: string, id: string) {
    const row = await this.db.prepare(`SELECT ${columns} FROM portfolios WHERE id=? AND owner_subject=?`).bind(id, owner).first<Row>();
    return row ? decode(row) : null;
  }
  async list(owner: string, limit: number, after = '') {
    const rows = await this.db.prepare(`SELECT ${columns} FROM portfolios WHERE owner_subject=? AND id>? ORDER BY id LIMIT ?`)
      .bind(owner, after, limit).all<Row>();
    return rows.results.map(decode);
  }
  async opening(owner: string, id: string) {
    const row = await this.get(owner, id);
    if (!row) return null;
    const payload = await this.db.prepare(`SELECT CASE p.opening_source
      WHEN 'independent' THEN p.opening_json
      WHEN 'historical' THEN (SELECT payload_json FROM opening_revisions WHERE id=p.opening_id AND revision=p.opening_revision)
      WHEN 'operational' THEN (SELECT json_extract(reference_json,'$.opening') FROM portfolio_operational_openings
        WHERE portfolio_id=p.id AND id=p.opening_id AND owner_subject=p.owner_subject) END AS payload
      FROM portfolios p WHERE id=? AND owner_subject=?`).bind(id, owner).first<{ payload: string | null }>();
    if (!payload?.payload) return null;
    const opening = openingStateSchema.parse(JSON.parse(payload.payload));
    if (row.opening.source === 'independent') independentOpening(row, opening);
    if (opening.id !== row.opening.id || opening.revision !== row.opening.revision) throw new Error('registry_opening_mismatch');
    return opening;
  }
  async archive(owner: string, id: string, expected: number, at: string) {
    const result = await this.db.prepare(`UPDATE portfolios SET status='archived',version=version+1,updated_at=?
      WHERE id=? AND owner_subject=? AND version=? AND status='active'`).bind(at, id, owner, expected).run();
    if (result.meta.changes !== 1) throw new ApplicationError(412, 'version_mismatch');
    return (await this.get(owner, id))!;
  }
}
