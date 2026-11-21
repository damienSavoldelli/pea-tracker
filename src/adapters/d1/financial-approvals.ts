import { financialProposalSchema } from '../../domain/financial-proposal';
import type { FinancialApproval, FinancialApprovalRepository } from '../../ports/financial-approval';

interface Row {
  subject: string; proposal_json: string; summary_json: string; status: FinancialApproval['status'];
  csrf: string | null; approved_at: string | null; consumed_at: string | null;
}
export class D1FinancialApprovalRepository implements FinancialApprovalRepository {
  constructor(private readonly db: D1Database) {}
  async create(row: FinancialApproval) {
    if (row.status !== 'prepared' || row.csrf !== null || row.approved_at !== null || row.consumed_at !== null) throw new Error('Invalid initial approval');
    const p = financialProposalSchema.parse(row.proposal);
    await this.db.prepare(`INSERT INTO financial_approvals
      (id,subject,digest,prepared_at,expires_at,proposal_json,summary_json) VALUES (?,?,?,?,?,?,?)`)
      .bind(p.idempotency_key, row.subject, p.digest, p.prepared_at, p.expires_at, JSON.stringify(p), JSON.stringify(row.summary)).run();
  }
  async get(id: string): Promise<FinancialApproval | null> {
    const row = await this.db.prepare('SELECT * FROM financial_approvals WHERE id=?').bind(id).first<Row>();
    return row ? { subject: row.subject, proposal: financialProposalSchema.parse(JSON.parse(row.proposal_json)),
      summary: JSON.parse(row.summary_json), status: row.status, csrf: row.csrf,
      approved_at: row.approved_at, consumed_at: row.consumed_at } : null;
  }
  private async update(sql: string, values: string[]) {
    return (await this.db.prepare(sql).bind(...values).run()).meta.changes === 1;
  }
  async setCsrf(id: string, subject: string, csrf: string, now: string) {
    return this.update(`UPDATE financial_approvals SET csrf=? WHERE id=? AND subject=? AND status='prepared'
      AND prepared_at<=? AND expires_at>?`, [csrf, id, subject, now, now]);
  }
  async approve(id: string, subject: string, csrf: string, now: string) {
    return this.update(`UPDATE financial_approvals SET status='approved',approved_at=?,csrf=NULL
      WHERE id=? AND subject=? AND csrf=? AND status='prepared' AND prepared_at<=? AND expires_at>?`, [now, id, subject, csrf, now, now]);
  }
  async consume(id: string, subject: string, digest: string, now: string) {
    return this.update(`UPDATE financial_approvals SET status='consumed',consumed_at=?
      WHERE id=? AND subject=? AND digest=? AND status='approved' AND prepared_at<=? AND expires_at>?`, [now, id, subject, digest, now, now]);
  }
}
