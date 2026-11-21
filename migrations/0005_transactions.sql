-- Additive journal only. No UPDATE/backfill of V1 opening revisions, positions or quotation tables.
-- Local validation does not authorize applying this migration to production.
CREATE TABLE transaction_journals (
  portfolio_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('real','simulated')),
  owner_subject TEXT NOT NULL CHECK (length(owner_subject) BETWEEN 1 AND 128),
  opening_id TEXT NOT NULL REFERENCES opening_revisions(id) ON DELETE RESTRICT,
  opening_revision INTEGER NOT NULL REFERENCES opening_revisions(revision) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 1000)
);
CREATE TRIGGER transaction_journal_anchor BEFORE INSERT ON transaction_journals BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM opening_revisions WHERE id = NEW.opening_id AND revision = NEW.opening_revision)
    THEN RAISE(ABORT,'opening_anchor_mismatch') END;
END;
CREATE TRIGGER transaction_journal_identity BEFORE UPDATE ON transaction_journals BEGIN
  SELECT CASE WHEN NEW.portfolio_id != OLD.portfolio_id OR NEW.kind != OLD.kind OR NEW.owner_subject != OLD.owner_subject
    OR NEW.opening_id != OLD.opening_id OR NEW.opening_revision != OLD.opening_revision OR NEW.version != OLD.version + 1
    THEN RAISE(ABORT,'immutable_journal_identity') END;
END;
CREATE TRIGGER transaction_journal_no_delete BEFORE DELETE ON transaction_journals BEGIN SELECT RAISE(ABORT,'immutable_journal'); END;

CREATE TABLE transaction_events (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES transaction_journals(portfolio_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 1000),
  instrument_id TEXT REFERENCES instruments(id) ON DELETE RESTRICT,
  reversal_of TEXT,
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  balances_json TEXT NOT NULL CHECK (json_valid(balances_json)),
  UNIQUE (portfolio_id,sequence), UNIQUE (portfolio_id,id), UNIQUE (portfolio_id,reversal_of),
  FOREIGN KEY (portfolio_id,reversal_of) REFERENCES transaction_events(portfolio_id,id) ON DELETE RESTRICT,
  CHECK (json_extract(event_json,'$.id') = id AND json_extract(event_json,'$.portfolio_id') = portfolio_id
    AND json_extract(event_json,'$.sequence') = sequence),
  CHECK (json_extract(balances_json,'$.portfolio_id') = portfolio_id AND json_extract(balances_json,'$.version') = sequence)
);
CREATE TRIGGER transaction_event_sequence BEFORE INSERT ON transaction_events BEGIN
  SELECT CASE WHEN NEW.sequence != (SELECT version + 1 FROM transaction_journals WHERE portfolio_id = NEW.portfolio_id)
    THEN RAISE(ABORT,'transaction_version_conflict') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM transaction_journals WHERE portfolio_id = NEW.portfolio_id
      AND owner_subject = json_extract(NEW.event_json,'$.actor')
      AND kind = json_extract(NEW.balances_json,'$.kind')
      AND opening_id = json_extract(NEW.balances_json,'$.opening_id')
      AND opening_revision = json_extract(NEW.balances_json,'$.opening_revision')
  ) THEN RAISE(ABORT,'opening_anchor_mismatch') END;
END;
CREATE TRIGGER transaction_event_advance AFTER INSERT ON transaction_events BEGIN
  UPDATE transaction_journals SET version = NEW.sequence WHERE portfolio_id = NEW.portfolio_id;
END;
CREATE TRIGGER transaction_event_no_update BEFORE UPDATE ON transaction_events BEGIN SELECT RAISE(ABORT,'immutable_transaction'); END;
CREATE TRIGGER transaction_event_no_delete BEFORE DELETE ON transaction_events BEGIN SELECT RAISE(ABORT,'immutable_transaction'); END;

CREATE TABLE transaction_outcomes (
  portfolio_id TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 128),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  canonical_input TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  PRIMARY KEY (portfolio_id,subject,idempotency_key),
  FOREIGN KEY (portfolio_id,sequence) REFERENCES transaction_events(portfolio_id,sequence) ON DELETE RESTRICT
);
CREATE TRIGGER transaction_outcome_no_update BEFORE UPDATE ON transaction_outcomes BEGIN SELECT RAISE(ABORT,'immutable_transaction_outcome'); END;
CREATE TRIGGER transaction_outcome_no_delete BEFORE DELETE ON transaction_outcomes BEGIN SELECT RAISE(ABORT,'immutable_transaction_outcome'); END;
