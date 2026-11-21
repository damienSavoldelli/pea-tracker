import type { FinancialApproval, FinancialApprovalRepository } from '../../ports/financial-approval';

/** Synthetic/local adapter only; a deployed composition must use durable storage. */
export class MemoryFinancialApprovalRepository implements FinancialApprovalRepository {
  private readonly rows = new Map<string, FinancialApproval>();
  async create(record: FinancialApproval) {
    if (this.rows.has(record.proposal.idempotency_key)) throw new Error('Duplicate financial proposal');
    this.rows.set(record.proposal.idempotency_key, structuredClone(record));
  }
  async get(id: string) { return structuredClone(this.rows.get(id) ?? null); }
  private eligible(id: string, subject: string, now: string) {
    const row = this.rows.get(id);
    return row && row.subject === subject && row.proposal.prepared_at <= now && row.proposal.expires_at > now ? row : null;
  }
  async setCsrf(id: string, subject: string, csrf: string, now: string) {
    const row = this.eligible(id, subject, now);
    if (!row || row.status !== 'prepared') return false;
    row.csrf = csrf; return true;
  }
  async approve(id: string, subject: string, csrf: string, now: string) {
    const row = this.eligible(id, subject, now);
    if (!row || row.status !== 'prepared' || row.csrf !== csrf) return false;
    row.status = 'approved'; row.approved_at = now; row.csrf = null; return true;
  }
  async consume(id: string, subject: string, digest: string, now: string) {
    const row = this.eligible(id, subject, now);
    if (!row || row.status !== 'approved' || row.proposal.digest !== digest) return false;
    row.status = 'consumed'; row.consumed_at = now; return true;
  }
}
