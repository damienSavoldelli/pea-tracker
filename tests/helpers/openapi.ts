import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import api from '../../aidd_docs/api/openapi.json';
import officialSchema from '../../aidd_docs/api/schemas/openapi-3.1-2025-09-15.json';

type ObjectValue = Record<string, unknown>;
const contractId = 'urn:pea-tracker:test-contract';
const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function object(value: unknown, label: string): ObjectValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as ObjectValue;
}

function pointerPart(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function resolve(document: ObjectValue, reference: string): unknown {
  if (!reference.startsWith('#/')) throw new Error(`Only local contract references are allowed: ${reference}`);
  let value: unknown = document;
  for (const part of reference.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    value = Array.isArray(value) && /^(0|[1-9][0-9]*)$/.test(key)
      ? value[Number(key)] : object(value, reference)[key];
    if (value === undefined) throw new Error(`Unresolved contract reference: ${reference}`);
  }
  return value;
}

function dereference(document: ObjectValue, value: unknown): ObjectValue {
  const seen = new Set<string>();
  let result = object(value, 'Contract object');
  while (typeof result.$ref === 'string') {
    if (seen.has(result.$ref)) throw new Error(`Circular non-schema reference: ${result.$ref}`);
    seen.add(result.$ref);
    result = object(resolve(document, result.$ref), result.$ref);
  }
  return result;
}

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  // OAS defines media-range outside JSON Schema's standard format vocabulary.
  // Treat that extension as an annotation; response media types are matched below.
  ajv.addFormat('media-range', true);
  return ajv;
}

// Ajv 8.20 incorrectly falls back to the enclosing validator for this non-root
// dynamic anchor. With the fixed, non-overridden official anchor, these references
// are statically equivalent. Keep the upstream snapshot unchanged; data schemas
// receive full JSON Schema validation separately below.
const staticDocumentSchema: unknown = JSON.parse(JSON.stringify(officialSchema)
  .replaceAll('"$dynamicRef":"#meta"', '"$ref":"#/$defs/schema"'));
const documentValidator = validator().compile(object(staticDocumentSchema, 'official document schema'));

function assertValid(validate: ValidateFunction, value: unknown, label: string): void {
  if (!validate(value)) {
    const paths = validate.errors?.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new Error(`${label}: ${paths ?? 'validation failed'}`);
  }
}

/** Validate OAS structure, JSON Schema 2020-12 schemas, references and operation IDs offline. */
export function validateOpenApi(document: unknown = api): void {
  assertValid(documentValidator, document, 'OpenAPI document');
  const root = object(document, 'OpenAPI document');
  const ajv = validator();
  ajv.addSchema({ ...root, $id: contractId }, contractId);
  const schemaPointers = new Set<string>();

  function visit(value: unknown, pointer: string): void {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${pointer}/${index}`));
    } else if (value !== null && typeof value === 'object') {
      const node = object(value, pointer);
      if (typeof node.$ref === 'string') resolve(root, node.$ref);
      for (const [key, child] of Object.entries(node)) {
        const childPointer = `${pointer}/${pointerPart(key)}`;
        if (key === 'schema') schemaPointers.add(childPointer);
        visit(child, childPointer);
      }
    }
  }
  visit(root, '#');
  const components = object(root.components, 'components');
  for (const name of Object.keys(object(components.schemas, 'components.schemas'))) {
    schemaPointers.add(`#/components/schemas/${pointerPart(name)}`);
  }
  for (const pointer of schemaPointers) {
    const schema = resolve(root, pointer);
    if (typeof schema !== 'boolean' && (schema === null || typeof schema !== 'object' || Array.isArray(schema))) {
      throw new Error(`Invalid schema at ${pointer}`);
    }
    if (!ajv.validateSchema(schema)) throw new Error(`Invalid JSON Schema at ${pointer}: ${ajv.errorsText()}`);
    if (!ajv.getSchema(`${contractId}${pointer}`)) throw new Error(`Uncompilable schema: ${pointer}`);
  }

  const operationIds = new Set<string>();
  const securitySchemes = object(components.securitySchemes, 'components.securitySchemes');
  for (const pathItem of Object.values(object(root.paths, 'paths'))) {
    for (const [method, value] of Object.entries(object(pathItem, 'path item'))) {
      if (!methods.has(method)) continue;
      const operation = object(value, method);
      if (typeof operation.operationId !== 'string' || operationIds.has(operation.operationId)) {
        throw new Error('Missing or duplicate operationId');
      }
      operationIds.add(operation.operationId);
      if (Array.isArray(operation.security)) {
        for (const requirement of operation.security) {
          for (const scheme of Object.keys(object(requirement, 'security requirement'))) {
            if (!(scheme in securitySchemes)) throw new Error(`Unknown security scheme: ${scheme}`);
          }
        }
      }
    }
  }
}

const bodyValidator = validator();
bodyValidator.addSchema({ ...api, $id: contractId }, contractId);
const schemaCache = new Map<string, ValidateFunction>();

function schemaValidator(schema: unknown): ValidateFunction {
  const key = JSON.stringify(schema);
  let validate = schemaCache.get(key);
  if (!validate) {
    // Registering the document as a schema resource lets Ajv resolve all local
    // component references; no custom schema interpreter or remote fetch is used.
    validate = bodyValidator.compile({ $id: `${contractId}:response:${schemaCache.size}`, ...object(schema, 'response schema'), components: api.components });
    schemaCache.set(key, validate);
  }
  return validate;
}

/** Assert a declared response body/media type and the slice's declared mandatory headers. */
export async function assertContractResponse(method: string, path: string, response: Response): Promise<void> {
  const root = object(api, 'contract');
  const paths = object(root.paths, 'paths');
  const pathname = new URL(path, 'http://127.0.0.1').pathname.replace(/^\/api\/v1(?=\/)/, '');
  const route = Object.keys(paths).find(template => {
    const pattern = template.split('/').map(part => part.startsWith('{') ? '[^/]+' : part).join('/');
    return new RegExp(`^${pattern}$`).test(pathname);
  });
  if (!route) throw new Error(`No declared route for ${pathname}`);
  const operation = object(object(paths[route], route)[method.toLowerCase()], `${method} ${route}`);
  const responses = object(operation.responses, 'responses');
  const declaration = responses[String(response.status)];
  if (!declaration) throw new Error(`Undeclared response status ${response.status} for ${method} ${route}`);
  const result = dereference(root, declaration);
  const headers = result.headers === undefined ? {} : object(result.headers, 'response headers');
  for (const [name, value] of Object.entries(headers)) {
    const header = dereference(root, value);
    const actual = response.headers.get(name);
    if (actual === null) throw new Error(`Missing contract header ${name}`);
    if (header.schema !== undefined) assertValid(schemaValidator(header.schema), actual, `Header ${name}`);
  }
  const content = object(result.content, 'response content');
  const mediaType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (!mediaType || !(mediaType in content)) throw new Error(`Undeclared response media type: ${mediaType ?? 'missing'}`);
  const media = object(content[mediaType], mediaType);
  const body: unknown = await response.clone().json();
  assertValid(schemaValidator(media.schema), body, `Response ${method} ${route} ${response.status}`);
  if (mediaType === 'application/problem+json' && object(body, 'problem').status !== response.status) {
    throw new Error('Problem status does not match HTTP status');
  }
}
