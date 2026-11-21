import { operationalOpeningSchema, type OperationalOpening } from '../../domain/operational-opening';
import type { OperationalOpeningRepository } from '../../ports/operational-opening';
import { ApplicationError } from '../../application/errors';

export class D1OperationalOpeningRepository implements OperationalOpeningRepository {
  constructor(private readonly db: D1Database, private readonly binding: {
    portfolio_id: string; owner_subject: string; id: string; historical_opening_id: string; historical_opening_revision: number;
  }) {}
  private checked(input: unknown) {
    const row = operationalOpeningSchema.parse(input);
    if (row.portfolio_id !== this.binding.portfolio_id || row.owner_subject !== this.binding.owner_subject ||
        row.opening.id !== this.binding.id || row.historical_opening_id !== this.binding.historical_opening_id ||
        row.historical_opening_revision !== this.binding.historical_opening_revision) throw new ApplicationError(403, 'operational_opening_binding_mismatch');
    return row;
  }
  async get() {
    const row = await this.db.prepare('SELECT reference_json FROM portfolio_operational_openings WHERE portfolio_id=? AND id=? AND owner_subject=?')
      .bind(this.binding.portfolio_id, this.binding.id, this.binding.owner_subject).first<{ reference_json: string }>();
    return row ? this.checked(JSON.parse(row.reference_json)) : null;
  }
  async initialize(input: OperationalOpening) {
    const row = this.checked(input);
    try {
      await this.db.prepare(`INSERT INTO portfolio_operational_openings
        (portfolio_id,id,owner_subject,historical_opening_id,historical_opening_revision,reference_json)
        VALUES (?,?,?,?,?,?)`).bind(row.portfolio_id, row.opening.id, row.owner_subject,
          row.historical_opening_id, row.historical_opening_revision, JSON.stringify(row)).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('operational_journal_not_empty')) throw new ApplicationError(409, 'operational_journal_not_empty');
      if (message.includes('opening_anchor_mismatch')) throw new ApplicationError(409, 'opening_anchor_mismatch');
      if (message.includes('UNIQUE constraint failed')) throw new ApplicationError(409, 'operational_opening_already_exists');
      throw new Error('Operational opening storage failed');
    }
  }
}
