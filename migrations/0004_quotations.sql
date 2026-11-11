-- Local synthetic immutable provider observations, never portfolio valuations.
CREATE TABLE quotation_observations (
  id TEXT PRIMARY KEY NOT NULL,
  instrument_id TEXT NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  price_kind TEXT NOT NULL CHECK (price_kind IN ('last_trade','session_close')),
  adjustment TEXT NOT NULL CHECK (adjustment = 'unadjusted'),
  fetched_at TEXT NOT NULL,
  market_timestamp TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','unavailable')),
  price TEXT,
  declaration_json TEXT NOT NULL CHECK (json_valid(declaration_json)),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  CHECK (json_extract(record_json,'$.id') = id),
  CHECK (json_extract(record_json,'$.instrument_id') = instrument_id),
  CHECK (json_extract(record_json,'$.provider') = provider),
  CHECK (json_extract(record_json,'$.fetched_at') = fetched_at),
  CHECK (json_extract(record_json,'$.outcome') = outcome),
  CHECK ((outcome = 'unavailable' AND price IS NULL AND market_timestamp IS NULL) OR
    (outcome = 'success' AND price IS NOT NULL AND market_timestamp IS NOT NULL
      AND market_timestamp <= fetched_at AND json_extract(record_json,'$.price') = price
      AND typeof(price) = 'text' AND length(price) BETWEEN 1 AND 44 AND price != '0'
      AND price NOT GLOB '*[^0-9.]*' AND price NOT LIKE '.%' AND price NOT LIKE '%.'
      AND length(price)-length(replace(price,'.','')) <= 1
      AND (instr(price,'.') = 0 OR length(price)-instr(price,'.') <= 12)
      AND length(ltrim(replace(price,'.',''),'0')) <= 30)),
  UNIQUE (instrument_id,provider,price_kind,adjustment,fetched_at)
);
CREATE INDEX quotation_market_history ON quotation_observations
  (instrument_id,provider,price_kind,adjustment,outcome,market_timestamp,fetched_at,id);
CREATE INDEX quotation_collection_history ON quotation_observations
  (instrument_id,provider,price_kind,adjustment,fetched_at);
CREATE TRIGGER quotation_conflict_guard BEFORE INSERT ON quotation_observations BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM quotation_observations q WHERE q.instrument_id = NEW.instrument_id
      AND q.provider = NEW.provider AND q.price_kind = NEW.price_kind AND q.adjustment = NEW.adjustment
      AND q.fetched_at = NEW.fetched_at AND q.declaration_json != NEW.declaration_json
  ) THEN RAISE(ABORT,'quotation_observation_conflict') END;
END;
CREATE TRIGGER quotation_no_update BEFORE UPDATE ON quotation_observations BEGIN SELECT RAISE(ABORT,'immutable_quotation'); END;
CREATE TRIGGER quotation_no_delete BEFORE DELETE ON quotation_observations BEGIN SELECT RAISE(ABORT,'immutable_quotation'); END;
CREATE TABLE quotation_batch_outcomes (
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 128),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  canonical_input TEXT NOT NULL,
  original_outcome_json TEXT NOT NULL CHECK (json_valid(original_outcome_json)),
  PRIMARY KEY (subject,idempotency_key)
);
CREATE TRIGGER quotation_outcome_no_update BEFORE UPDATE ON quotation_batch_outcomes BEGIN SELECT RAISE(ABORT,'immutable_quotation_outcome'); END;
CREATE TRIGGER quotation_outcome_no_delete BEFORE DELETE ON quotation_batch_outcomes BEGIN SELECT RAISE(ABORT,'immutable_quotation_outcome'); END;
