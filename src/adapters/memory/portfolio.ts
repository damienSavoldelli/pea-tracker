import type { OpeningState } from '../../domain/portfolio';
import type { PortfolioRepository, OpeningReplay } from '../../ports/portfolio';
import { ApplicationError } from '../../application/errors';

export class MemoryPortfolioRepository implements PortfolioRepository {
  private readonly revisions: OpeningState[] = [];
  private readonly outcomes = new Map<string, { canonical: string; state: OpeningState }>();
  async get(revision?: number) {
    const state = revision === undefined ? this.revisions.at(-1) : this.revisions[revision - 1];
    return state ? structuredClone(state) : null;
  }
  async append(state: OpeningState, expected: number, replay: OpeningReplay) {
    const key = JSON.stringify([replay.subject, 'appendOpeningState', replay.key]);
    const prior = this.outcomes.get(key);
    if (prior) {
      if (prior.canonical !== replay.canonicalInput) throw new ApplicationError(409, 'idempotency_conflict');
      return structuredClone(prior.state);
    }
    if (expected !== this.revisions.length || state.revision !== expected + 1) throw new ApplicationError(412, 'version_mismatch');
    if (this.revisions[0] && this.revisions[0].effective_at !== state.effective_at) throw new ApplicationError(409, 'opening_date_immutable');
    const stored = structuredClone(state);
    this.revisions.push(stored);
    this.outcomes.set(key, { canonical: replay.canonicalInput, state: stored });
    return structuredClone(stored);
  }
}
