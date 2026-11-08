import { describe, expect, it } from 'vitest';
import api from '../aidd_docs/api/openapi.json';
import { assertContractResponse, validateOpenApi } from './helpers/openapi';

const syntheticInstrument = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Synthetic ETF A',
  kind: 'etf',
  isin: null,
  quote_currency: 'EUR',
  price_unit: 'currency_unit',
  exchange_mic: null,
  provider_symbol: 'SYNTH-A',
  active: true,
  version: 1,
  created_at: '2026-11-08T00:00:00.000Z',
  updated_at: '2026-11-08T00:00:00.000Z',
};

function instrumentResponse(body: unknown = syntheticInstrument) {
  return Response.json(body, { headers: { ETag: '"1"', 'Cache-Control': 'no-store' } });
}

describe('OpenAPI document validation', () => {
  it('validates the document against the official OAS schema and compiles every embedded data schema', () => {
    expect(() => validateOpenApi()).not.toThrow();
  });

  it('rejects invalid OpenAPI structure', () => {
    expect(() => validateOpenApi({ ...api, openapi: '2.0' })).toThrow('OpenAPI document');
    expect(() => validateOpenApi({ ...api, info: {} })).toThrow('OpenAPI document');
  });

  it('rejects invalid embedded JSON Schema rather than only checking OAS structure', () => {
    const invalid = structuredClone(api);
    invalid.components.schemas.Instrument.properties.version.type = 'invalid-type';
    expect(() => validateOpenApi(invalid)).toThrow();
  });

  it('rejects unresolved local and unapproved remote references', () => {
    const invalid = structuredClone(api);
    invalid.components.schemas.InstrumentPage.properties.data.items.$ref = '#/components/schemas/Missing';
    expect(() => validateOpenApi(invalid)).toThrow('Unresolved contract reference');
    invalid.components.schemas.InstrumentPage.properties.data.items.$ref = 'https://untrusted.invalid/schema';
    expect(() => validateOpenApi(invalid)).toThrow('Only local contract references');
  });

  it('rejects duplicate operation identifiers and unknown security schemes', () => {
    const duplicate = structuredClone(api);
    duplicate.paths['/instruments'].get.operationId = duplicate.paths['/instruments'].post.operationId;
    expect(() => validateOpenApi(duplicate)).toThrow('duplicate operationId');
    const invalid = structuredClone(api);
    Object.assign(invalid.paths['/instruments'].get, { security: [{ Unknown: [] }] });
    expect(() => validateOpenApi(invalid)).toThrow('Unknown security scheme');
  });

  it('keeps health public and instrument operations explicitly protected', () => {
    expect(api.paths['/health'].get.security).toEqual([]);
    for (const operation of [api.paths['/instruments'].get, api.paths['/instruments'].post,
      api.paths['/instruments/{id}'].get, api.paths['/instruments/{id}'].patch]) {
      expect(operation.security).toEqual([{ BearerAuth: [] }]);
      expect(operation['x-required-capability']).toMatch(/^instruments:(read|admin)$/);
    }
  });
});

describe('OpenAPI response assertions', () => {
  it('accepts representative health, instrument, create, list and PATCH responses', async () => {
    await assertContractResponse('GET', '/api/v1/health', Response.json({ status: 'ok', service: 'pea-tracker', version: '0.1.0' }));
    await assertContractResponse('GET', `/api/v1/instruments/${syntheticInstrument.id}`, instrumentResponse());
    await assertContractResponse('PATCH', `/api/v1/instruments/${syntheticInstrument.id}`, instrumentResponse());
    await assertContractResponse('POST', '/api/v1/instruments', Response.json(syntheticInstrument, {
      status: 201,
      headers: { ETag: '"1"', 'Cache-Control': 'no-store', Location: `/api/v1/instruments/${syntheticInstrument.id}` },
    }));
    await assertContractResponse('GET', '/api/v1/instruments?limit=1', Response.json({ data: [syntheticInstrument], page: { next_cursor: null } }, {
      headers: { 'Cache-Control': 'no-store' },
    }));
  });

  it('checks code-point bounds and registered date/UUID formats', async () => {
    await assertContractResponse('GET', `/instruments/${syntheticInstrument.id}`, instrumentResponse({ ...syntheticInstrument, name: '😀'.repeat(160) }));
    for (const fields of [{ name: '😀'.repeat(161) }, { created_at: 'not-a-time' }, { id: 'not-a-uuid' }, { quote_currency: 'eur' }]) {
      await expect(assertContractResponse('GET', `/instruments/${syntheticInstrument.id}`, instrumentResponse({ ...syntheticInstrument, ...fields }))).rejects.toThrow('Response GET');
    }
  });

  it('rejects missing fields, unexpected values and numeric coercion', async () => {
    await expect(assertContractResponse('GET', `/instruments/${syntheticInstrument.id}`, instrumentResponse({ name: 'Synthetic ETF A' }))).rejects.toThrow();
    await expect(assertContractResponse('GET', `/instruments/${syntheticInstrument.id}`, instrumentResponse({ ...syntheticInstrument, version: '1' }))).rejects.toThrow();
    await expect(assertContractResponse('GET', `/instruments/${syntheticInstrument.id}`, instrumentResponse({ ...syntheticInstrument, holdings: 'private-value-must-not-be-accepted' }))).rejects.toThrow();
  });

  it('rejects missing/malformed contract headers and wrong media types', async () => {
    await expect(assertContractResponse('GET', `/instruments/${syntheticInstrument.id}`, Response.json(syntheticInstrument))).rejects.toThrow('Missing contract header');
    await expect(assertContractResponse('GET', `/instruments/${syntheticInstrument.id}`, Response.json(syntheticInstrument, {
      headers: { ETag: 'W/"1"', 'Cache-Control': 'no-store' },
    }))).rejects.toThrow('Header ETag');
    await expect(assertContractResponse('GET', '/health', new Response('{}', { headers: { 'Content-Type': 'text/plain' } }))).rejects.toThrow('media type');
  });

  it('checks documented problem bodies and matching HTTP status', async () => {
    const problem = { type: 'about:blank', title: 'Invalid input', status: 422, code: 'validation_failed', request_id: 'synthetic-request' };
    const response = Response.json(problem, { status: 422, headers: { 'Content-Type': 'application/problem+json' } });
    await assertContractResponse('POST', '/instruments', response);
    await expect(assertContractResponse('POST', '/instruments', Response.json({ ...problem, status: 400 }, {
      status: 422, headers: { 'Content-Type': 'application/problem+json' },
    }))).rejects.toThrow('Problem status');
  });

  it('rejects undeclared routes and statuses', async () => {
    await expect(assertContractResponse('GET', '/missing', Response.json({}))).rejects.toThrow('No declared route');
    await expect(assertContractResponse('GET', '/health', Response.json({}, { status: 202 }))).rejects.toThrow('Undeclared response status');
  });
});
