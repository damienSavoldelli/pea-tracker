import type { Instrument, UpdateInstrument } from '../domain/instruments';

export interface RepositoryPage {
  limit: number;
  active: boolean | null;
  after: string | null;
}

export interface CreateReplay {
  subject: string;
  key: string;
  canonicalInput: string;
}

export interface InstrumentRepository {
  get(id: string): Promise<Instrument | null>;
  list(query: RepositoryPage): Promise<Instrument[]>;
  // Record and original replay outcome must be committed atomically.
  create(record: Instrument, replay: CreateReplay): Promise<Instrument>;
  update(id: string, version: number, patch: UpdateInstrument, updatedAt: string): Promise<Instrument>;
}
