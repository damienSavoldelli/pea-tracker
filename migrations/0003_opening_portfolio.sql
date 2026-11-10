-- Synthetic/local-only until separately approved remote binding and release gates.
-- Full immutable revisions. No reconstructed total cost, ledger trade or fees.
CREATE TABLE opening_revisions (
  revision INTEGER PRIMARY KEY CHECK (revision BETWEEN 1 AND 9007199254740991),
  id TEXT NOT NULL UNIQUE,
  effective_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  correction_reason TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  CHECK (json_extract(payload_json,'$.id') = id),
  CHECK (json_extract(payload_json,'$.revision') = revision),
  CHECK (json_extract(payload_json,'$.effective_at') = effective_at),
  CHECK (json_array_length(payload_json,'$.positions') BETWEEN 0 AND 100),
  CHECK ((revision = 1 AND correction_reason IS NULL) OR (revision > 1 AND length(correction_reason) BETWEEN 1 AND 512))
);

CREATE TRIGGER opening_append_guard BEFORE INSERT ON opening_revisions BEGIN
  SELECT CASE WHEN NEW.revision != COALESCE((SELECT MAX(revision) FROM opening_revisions),0) + 1
    THEN RAISE(ABORT,'opening_revision_conflict') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM opening_revisions WHERE revision = 1 AND effective_at != NEW.effective_at)
    THEN RAISE(ABORT,'opening_date_immutable') END;
END;
CREATE TRIGGER opening_revision_no_update BEFORE UPDATE ON opening_revisions BEGIN SELECT RAISE(ABORT,'immutable_opening_revision'); END;
CREATE TRIGGER opening_revision_no_delete BEFORE DELETE ON opening_revisions BEGIN SELECT RAISE(ABORT,'immutable_opening_revision'); END;

CREATE TABLE opening_positions (
  revision INTEGER NOT NULL REFERENCES opening_revisions(revision) ON DELETE RESTRICT,
  instrument_id TEXT NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  quantity TEXT NOT NULL CHECK (
    typeof(quantity) = 'text' AND length(quantity) BETWEEN 1 AND 44 AND quantity != '0'
    AND quantity NOT GLOB '*[^0-9.]*' AND quantity NOT LIKE '.%' AND quantity NOT LIKE '%.'
    AND length(quantity)-length(replace(quantity,'.','')) <= 1
    AND (instr(quantity,'.') = 0 OR length(quantity)-instr(quantity,'.') <= 12)
    AND length(ltrim(replace(quantity,'.',''),'0')) <= 30
  ),
  declared_pru TEXT NOT NULL CHECK (
    typeof(declared_pru) = 'text' AND length(declared_pru) BETWEEN 1 AND 44
    AND declared_pru NOT GLOB '*[^0-9.]*' AND declared_pru NOT LIKE '.%' AND declared_pru NOT LIKE '%.'
    AND length(declared_pru)-length(replace(declared_pru,'.','')) <= 1
    AND (instr(declared_pru,'.') = 0 OR length(declared_pru)-instr(declared_pru,'.') <= 12)
    AND length(ltrim(replace(declared_pru,'.',''),'0')) <= 30
  ),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*'),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json)),
  PRIMARY KEY (revision,instrument_id)
);
CREATE INDEX opening_positions_instrument ON opening_positions(instrument_id,revision);
CREATE TRIGGER opening_position_guard BEFORE INSERT ON opening_positions BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM opening_revisions r, json_each(r.payload_json,'$.positions') p
    WHERE r.revision = NEW.revision AND json_extract(p.value,'$.instrument_id') = NEW.instrument_id
      AND json_extract(p.value,'$.quantity') = NEW.quantity
      AND json_extract(p.value,'$.declared_pru') = NEW.declared_pru
      AND json_extract(p.value,'$.currency') = NEW.currency
      AND json_extract(p.value,'$.provenance') = NEW.provenance_json
  ) THEN RAISE(ABORT,'opening_position_mismatch') END;
END;
CREATE TRIGGER opening_position_no_update BEFORE UPDATE ON opening_positions BEGIN SELECT RAISE(ABORT,'immutable_opening_position'); END;
CREATE TRIGGER opening_position_no_delete BEFORE DELETE ON opening_positions BEGIN SELECT RAISE(ABORT,'immutable_opening_position'); END;

CREATE TABLE opening_outcomes (
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 128),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  canonical_input TEXT NOT NULL,
  revision INTEGER NOT NULL REFERENCES opening_revisions(revision) ON DELETE RESTRICT,
  PRIMARY KEY (subject,idempotency_key)
);
CREATE TRIGGER opening_outcome_no_update BEFORE UPDATE ON opening_outcomes BEGIN SELECT RAISE(ABORT,'immutable_opening_outcome'); END;
CREATE TRIGGER opening_outcome_no_delete BEFORE DELETE ON opening_outcomes BEGIN SELECT RAISE(ABORT,'immutable_opening_outcome'); END;
