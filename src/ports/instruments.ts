import type { Instrument, UpdateInstrument } from '../domain/instruments';

export interface RepositoryPage {
  // Validated internal limit is 1..101: REST's maximum 100 plus one lookahead row.
  limit: number;
  // null means no active-state filter; after is an exclusive, binary-ordered ID.
  active: boolean | null;
  after: string | null;
}

export interface CreateReplay {
  // Verified stable subject and operation-scoped key; operation is createInstrument.
  subject: string;
  key: string;
  // Instrument-create canonical form v1: parsed metadata, ordered fields/defaults/nulls.
  // Keep byte-for-byte stable across service releases; no Unicode normalization.
  canonicalInput: string;
}

// Inputs have already passed shared domain/service validation. Returned DTOs must
// not expose mutable storage references; get returns null for an absent ID.
export interface InstrumentRepository {
  get(id: string): Promise<Instrument | null>;
  list(query: RepositoryPage): Promise<Instrument[]>;
  // Valid create record is initial state: version=1, equal created_at/updated_at,
  // and metadata matching canonicalInput. Record + original outcome commit atomically.
  // Existing subject/operation/key returns the immutable original snapshot for the
  // same input or idempotency_conflict/409 for changed input, without a new write.
  create(record: Instrument, replay: CreateReplay): Promise<Instrument>;
  // One atomic CAS increments version even for unchanged values. Failure precedence:
  // missing ->404; mismatched version ->412; matching maximum safe version ->409.
  update(id: string, version: number, patch: UpdateInstrument, updatedAt: string): Promise<Instrument>;
}
