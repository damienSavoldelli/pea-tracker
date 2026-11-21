import type { RegisteredPortfolio } from '../domain/portfolio-registry';
import type { OpeningState } from '../domain/portfolio';

/** Internal administration only; owner must come from a trusted principal. */
export interface PortfolioRegistryRepository {
  create(portfolio: RegisteredPortfolio, opening: OpeningState): Promise<RegisteredPortfolio>;
  get(owner: string, id: string): Promise<RegisteredPortfolio | null>;
  list(owner: string, limit: number, after?: string): Promise<RegisteredPortfolio[]>;
  opening(owner: string, id: string): Promise<OpeningState | null>;
  archive(owner: string, id: string, expected: number, at: string): Promise<RegisteredPortfolio>;
}
