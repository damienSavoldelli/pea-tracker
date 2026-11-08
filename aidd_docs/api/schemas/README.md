# OpenAPI validation schema snapshot

`openapi-3.1-2025-09-15.json` is an unmodified official OpenAPI Initiative snapshot,
downloaded on 2026-11-08 from
[the OAS 3.1 schema](https://spec.openapis.org/oas/3.1/schema/2025-09-15).
The accompanying `LICENSE` is the upstream
[Apache 2.0 license](https://github.com/OAI/OpenAPI-Specification/blob/main/LICENSE).
The snapshot keeps contract validation offline and reproducible; tests do not fetch schemas.

Tests use the already installed lockfile versions of Ajv 8.20.0 and ajv-formats 3.0.1
(currently transitive development tooling). No dependency was installed or changed.
If the dependency graph changes, retain or explicitly approve replacement validation
tooling rather than silently downloading packages.

The official schema checks OpenAPI 3.1 document structure, and deliberately does not
validate Schema Object contents. The helper additionally validates and compiles every
embedded data schema with Ajv's JSON Schema 2020-12 implementation and checks local
references, unique operation identifiers and declared security-scheme references.
Standard formats such as date-time, UUID and URI-reference are checked through
ajv-formats. The OAS-specific `media-range` format is treated as an annotation;
actual response media types are matched against the declared content keys.

Ajv 8.20's non-root dynamic-anchor fallback resolves this snapshot's `#meta`
references to an enclosing validator instead of the fixed Schema Object anchor.
For document validation only, the helper adapts its four `$dynamicRef: "#meta"`
sites to the statically equivalent `$ref: "#/$defs/schema"`. That fixed anchor
accepts objects/booleans and is not overridden in this validation setup. The vendored
upstream file remains unmodified; every actual Schema Object still receives the
separate JSON Schema validation/compilation described above.

Response assertions use Ajv against the actual component schema, check declared
response headers required by this slice, and compare problem status with HTTP status.
Ajv does not coerce input, insert defaults or strip unexpected fields. Semantic rules
such as ISIN checksum, authorization, idempotency and monetary correctness still need
application tests; the document/schema validation does not prove those behaviors or
actual OAuth interoperability. External references are rejected, not fetched.
