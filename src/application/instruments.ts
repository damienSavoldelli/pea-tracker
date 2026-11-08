import { z } from 'zod';
import { createInstrumentSchema, instrumentIdSchema, instrumentSchema, updateInstrumentSchema } from '../domain/instruments';
import type { InstrumentRepository } from '../ports/instruments';
import { requirePermission, type Principal } from './authorization';
import { ApplicationError } from './errors';

const listSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  active: z.boolean().optional(),
  cursor: z.string().min(1).max(256).optional(),
}).strict();
const cursorSchema = z.object({ version: z.literal(1), after: instrumentIdSchema, active: z.boolean().nullable() }).strict();
const keySchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

function parse<T>(schema: z.ZodType<T>, input: unknown, status: 400 | 422 = 422): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApplicationError(status, status === 400 ? 'invalid_request' : 'invalid_instrument',
      [...new Set(result.error.issues.map(issue => issue.path.join('.')).filter(Boolean))].slice(0, 20));
  }
  return result.data;
}

function encodeCursor(after: string, active: boolean | null): string {
  return btoa(JSON.stringify({ version: 1, after, active })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(cursor: string, active: boolean | null): string {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('encoding');
    const decoded = cursorSchema.parse(JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))));
    if (decoded.active !== active || encodeCursor(decoded.after, decoded.active) !== cursor) throw new Error('binding');
    return decoded.after;
  } catch {
    throw new ApplicationError(400, 'invalid_cursor');
  }
}

export class InstrumentService {
  constructor(
    private readonly repository: InstrumentRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(principal: Principal | null, input: unknown) {
    requirePermission(principal, 'instruments:read');
    const query = parse(listSchema, input, 400);
    const active = query.active ?? null;
    const after = query.cursor ? decodeCursor(query.cursor, active) : null;
    const records = await this.repository.list({ limit: query.limit + 1, active, after });
    const data = records.slice(0, query.limit);
    const last = data.at(-1);
    return { data, page: { next_cursor: records.length > query.limit && last ? encodeCursor(last.id, active) : null } };
  }

  async get(principal: Principal | null, id: unknown) {
    requirePermission(principal, 'instruments:read');
    const record = await this.repository.get(parse(instrumentIdSchema, id, 400));
    if (!record) throw new ApplicationError(404, 'instrument_not_found');
    return record;
  }

  async create(principal: Principal | null, input: unknown, key: unknown) {
    requirePermission(principal, 'instruments:admin');
    const idempotencyKey = parse(keySchema, key, 400);
    const data = parse(createInstrumentSchema, input);
    const timestamp = this.clock();
    const record = instrumentSchema.parse({ ...data, id: this.generateId(), version: 1, created_at: timestamp, updated_at: timestamp });
    return this.repository.create(record, { subject: principal.subject, key: idempotencyKey, canonicalInput: JSON.stringify(data) });
  }

  async update(principal: Principal | null, id: unknown, input: unknown, version: unknown) {
    requirePermission(principal, 'instruments:admin');
    const instrumentId = parse(instrumentIdSchema, id, 400);
    const expectedVersion = parse(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), version, 400);
    const patch = parse(updateInstrumentSchema, input);
    return this.repository.update(instrumentId, expectedVersion, patch, this.clock());
  }
}
