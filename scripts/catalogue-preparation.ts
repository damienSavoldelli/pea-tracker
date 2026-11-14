import { z } from 'zod';
import { InstrumentService } from '../src/application/instruments';
import { D1InstrumentRepository } from '../src/adapters/d1/instruments';
import { createInstrumentSchema, instrumentIdSchema } from '../src/domain/instruments';

/** Explicit provider metadata, also validated by the existing Python mapping parser. */
const mappingSchema = z.object({
  instrument_id: instrumentIdSchema, symbol: z.string().min(1), currency: z.string(), price_unit: z.string(),
  reported_currency: z.string(), exchange: z.string().min(1), timezone: z.string().min(1),
  quote_type: z.enum(['EQUITY', 'ETF']),
}).strict();
export const cataloguePreparationSchema = z.object({
  instrument_id: instrumentIdSchema,
  instrument: createInstrumentSchema,
  mapping: mappingSchema,
  created_at: z.string().datetime(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
}).strict().superRefine((input, context) => {
  const metadata = input.instrument;
  if (input.instrument_id !== input.mapping.instrument_id || metadata.provider_symbol !== input.mapping.symbol ||
      metadata.quote_currency !== input.mapping.currency || metadata.price_unit !== input.mapping.price_unit ||
      input.mapping.quote_type !== (metadata.kind === 'stock' ? 'EQUITY' : 'ETF') || metadata.exchange_mic === null || metadata.isin === null) {
    context.addIssue({ code: 'custom', message: 'Catalogue and provider mapping must describe the same explicit instrument' });
  }
});

export interface CatalogueStatement { sql: string; values: (string | number | null)[] }

/** Captures the existing repository's native batch without accessing any database.
 * @param input - Reviewed instrument metadata, fixed UUID, source mapping and stable creation key.
 * @returns A supervised SQL import and its parameterized native-batch equivalent.
 * @remarks The capture deliberately fails at batch submission; it never simulates successful persistence.
 * Provider rights, live metadata qualification and remote execution require separate approval.
 */
export async function prepareCatalogue(input: unknown) {
  const value = cataloguePreparationSchema.parse(input);
  const statements: CatalogueStatement[] = [];
  let captured = false;
  const pending = new WeakMap<D1PreparedStatement, CatalogueStatement>();
  const unsupported = (): never => { throw new Error('Unsupported preparation operation'); };
  function statement(sql: string, values: (string | number | null)[]): D1PreparedStatement {
    const prepared: D1PreparedStatement = {
      bind(...bindings: unknown[]) {
        const checked = bindings.map(binding => {
          if (binding === null || typeof binding === 'string' || typeof binding === 'number' && Number.isFinite(binding)) return binding;
          return unsupported();
        });
        return statement(sql, checked);
      },
      first: unsupported, run: unsupported, all: unsupported, raw: unsupported,
    };
    pending.set(prepared, { sql, values });
    return prepared;
  }
  const db: D1Database = {
    prepare: sql => statement(sql, []),
    async batch(batch) {
      statements.push(...batch.map(prepared => pending.get(prepared) ?? unsupported()));
      captured = true;
      throw new Error('Preparation only: no database is connected');
    },
    exec: unsupported, withSession: unsupported, dump: unsupported,
  };
  const service = new InstrumentService(new D1InstrumentRepository(db), () => value.created_at, () => value.instrument_id);
  try {
    await service.create({ subject: 'operator:catalogue-bootstrap', permissions: ['instruments:admin'] }, value.instrument, value.idempotency_key);
    throw new Error('Unexpected successful preparation');
  } catch (error) {
    if (!captured || !(error instanceof Error) || error.message !== 'Instrument storage operation failed') throw error;
  }
  if (statements.length !== 3 || !statements[0]?.sql.startsWith('INSERT INTO instruments ') ||
      !statements[1]?.sql.startsWith('INSERT INTO instrument_create_outcomes ') || !statements[2]?.sql.startsWith('SELECT ')) {
    throw new Error('Unsupported instrument repository batch');
  }
  const literal = (item: string | number | null) => item === null ? 'NULL' : typeof item === 'number' ? String(item) : `'${item.replace(/'/g, "''")}'`;
  const sql = statements.map(statement => {
    let index = 0;
    const expanded = statement.sql.replace(/\?/g, () => {
      if (index >= statement.values.length) throw new Error('Missing SQL binding');
      return literal(statement.values[index++]!);
    });
    if (index !== statement.values.length) throw new Error('Unexpected SQL bindings');
    return expanded + ';';
  }).join('\n');
  return {
    statements, sql,
    mapping: [value.mapping],
    grants: [{ provider: 'yahoo', instrument_ids: [value.instrument_id] }],
    instrument_id: value.instrument_id,
  };
}
