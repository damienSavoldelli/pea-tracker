CREATE TABLE instrument_create_outcomes (
  subject TEXT NOT NULL COLLATE BINARY
    CHECK (typeof(subject) = 'text' AND length(subject) BETWEEN 1 AND 128 AND instr(subject, char(0)) = 0),
  operation TEXT NOT NULL COLLATE BINARY CHECK (operation = 'createInstrument'),
  idempotency_key TEXT NOT NULL COLLATE BINARY
    CHECK (typeof(idempotency_key) = 'text' AND length(idempotency_key) BETWEEN 1 AND 128
      AND idempotency_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  canonical_version INTEGER NOT NULL CHECK (typeof(canonical_version) = 'integer' AND canonical_version = 1),
  canonical_input TEXT NOT NULL
    CHECK (typeof(canonical_input) = 'text' AND length(canonical_input) BETWEEN 2 AND 16384
      AND CASE WHEN json_valid(canonical_input) THEN json_type(canonical_input) = 'object' ELSE 0 END),
  instrument_id TEXT NOT NULL REFERENCES instruments(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  original_instrument_json TEXT NOT NULL
    CHECK (typeof(original_instrument_json) = 'text' AND length(original_instrument_json) BETWEEN 2 AND 16384
      AND CASE WHEN json_valid(original_instrument_json) THEN
        json_type(original_instrument_json) = 'object'
        AND json_extract(original_instrument_json, '$.id') IS instrument_id
        AND json_type(original_instrument_json, '$.version') IS 'integer'
        AND json_extract(original_instrument_json, '$.version') = 1
        AND json_extract(original_instrument_json, '$.created_at') IS recorded_at
        AND json_extract(original_instrument_json, '$.updated_at') IS recorded_at
      ELSE 0 END),
  recorded_at TEXT NOT NULL
    CHECK (typeof(recorded_at) = 'text' AND length(recorded_at) >= 20
      AND substr(recorded_at, -1) = 'Z' AND instr(recorded_at, char(0)) = 0),
  PRIMARY KEY (subject, operation, idempotency_key)
);

CREATE INDEX instrument_create_outcomes_instrument_id ON instrument_create_outcomes (instrument_id);

CREATE TRIGGER instrument_create_outcomes_no_update
BEFORE UPDATE ON instrument_create_outcomes
BEGIN
  SELECT RAISE(ABORT, 'instrument_outcome_immutable');
END;

CREATE TRIGGER instrument_create_outcomes_no_delete
BEFORE DELETE ON instrument_create_outcomes
BEGIN
  SELECT RAISE(ABORT, 'instrument_outcome_immutable');
END;
