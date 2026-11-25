import type { FinancialProposal } from '../domain/financial-proposal';

export interface FinancialApproval {
  subject: string; proposal: FinancialProposal; summary: Record<string, unknown>;
  status: 'prepared' | 'approved' | 'consumed';
  csrf: string | null; approved_at: string | null; consumed_at: string | null;
}
/** Immutable intent; transitions and single consumption must use atomic compare-and-set. */
export interface FinancialApprovalRepository {
  create(record: FinancialApproval): Promise<void>;
  get(id: string): Promise<FinancialApproval | null>;
  setCsrf(id: string, subject: string, csrf: string, now: string): Promise<boolean>;
  approve(id: string, subject: string, csrf: string, now: string): Promise<boolean>;
  consume(id: string, subject: string, digest: string, now: string): Promise<boolean>;
  confirmSimulated(id: string, subject: string, digest: string, now: string): Promise<boolean>;
}
