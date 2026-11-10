import { z } from 'zod';
import { openingInputSchema, openingStateSchema } from '../domain/portfolio';
import type { PortfolioRepository } from '../ports/portfolio';
import type { InstrumentRepository } from '../ports/instruments';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';

function parse<T>(schema: z.ZodType<T>, input: unknown, status: 400 | 422 = 422): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApplicationError(status, status === 400 ? 'invalid_request' : 'invalid_opening_state',
    [...new Set(result.error.issues.map(issue => issue.path.join('.')).filter(Boolean))].slice(0, 20));
  return result.data;
}
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const list = z.object({ limit: z.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(256).optional() }).strict();
const cursor = z.object({ version: z.literal(1), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), offset: z.number().int().min(1).max(99) }).strict();
const encode = (revision: number, offset: number) => btoa(JSON.stringify({ version: 1, revision, offset })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export class PortfolioService {
  constructor(private readonly repository: PortfolioRepository, private readonly instruments: InstrumentRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly id: () => string = () => crypto.randomUUID()) {}

  async get(principal: Principal | null, revision?: unknown) {
    requirePermission(principal, 'portfolio:read');
    const selected = revision === undefined ? undefined : parse(z.number().int().positive().max(Number.MAX_SAFE_INTEGER), revision, 400);
    const state = await this.repository.get(selected);
    if (!state) throw new ApplicationError(404, 'opening_state_not_found');
    return state;
  }

  async append(principal: Principal | null, input: unknown, expected: unknown, key: unknown) {
    requirePermission(principal, 'portfolio:admin');
    const expectedRevision = parse(version, expected, 400);
    const idempotencyKey = parse(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), key, 400);
    const data = parse(openingInputSchema, input);
    // Every line inherits this declared reference timestamp. No trade/settlement
    // inference, cost reconstruction or prior transaction is introduced.
    data.effective_at = new Date(data.effective_at).toISOString();
    data.positions.sort((a, b) => a.instrument_id < b.instrument_id ? -1 : a.instrument_id > b.instrument_id ? 1 : 0);
    if ((expectedRevision === 0) !== (data.correction_reason === null)) throw new ApplicationError(422, 'invalid_correction_reason');
    for (const position of data.positions) {
      if (!await this.instruments.get(position.instrument_id)) throw new ApplicationError(422, 'unknown_instrument');
    }
    const recordedAt = this.clock();
    if (data.effective_at > recordedAt) throw new ApplicationError(422, 'future_opening_state');
    const state = openingStateSchema.parse({ ...data, id: this.id(), revision: expectedRevision + 1, recorded_at: recordedAt });
    return this.repository.append(state, expectedRevision, { subject: principal.subject, key: idempotencyKey, canonicalInput: JSON.stringify({ expected: expectedRevision, input: data }) });
  }

  async positions(principal: Principal | null, input: unknown) {
    requirePermission(principal, 'portfolio:read');
    const query = parse(list, input, 400);
    let selected: z.output<typeof cursor> | undefined;
    if (query.cursor) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
        selected = cursor.parse(JSON.parse(atob(query.cursor.replace(/-/g, '+').replace(/_/g, '/'))));
        if (encode(selected.revision, selected.offset) !== query.cursor) throw new Error();
      } catch { throw new ApplicationError(400, 'invalid_cursor'); }
    }
    const state = await this.get(principal, selected?.revision);
    const offset = selected?.offset ?? 0;
    if (offset > 0 && offset >= state.positions.length) throw new ApplicationError(400, 'invalid_cursor');
    const data = state.positions.slice(offset, offset + query.limit);
    return { revision: state.revision, effective_at: state.effective_at, data,
      page: { next_cursor: offset + data.length < state.positions.length ? encode(state.revision, offset + data.length) : null },
      history: { performance_available: false as const, reason: 'opening_state_only' as const } };
  }
}
