import type { OperationalOpening } from '../domain/operational-opening';

/** Explicit portfolio/owner/ID binding; initialization is offline administration, never MCP. */
export interface OperationalOpeningRepository {
  get(): Promise<OperationalOpening | null>;
  initialize(reference: OperationalOpening): Promise<void>;
}
