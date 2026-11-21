-- Existing real PEA startup only. Abort rather than resetting any recorded journal.
CREATE TABLE operational_opening_migration_guard (events INTEGER NOT NULL CHECK(events=0));
INSERT INTO operational_opening_migration_guard SELECT COUNT(*) FROM transaction_events;
DROP TABLE operational_opening_migration_guard;

CREATE TABLE portfolio_operational_openings (
  portfolio_id TEXT PRIMARY KEY NOT NULL,
  id TEXT NOT NULL UNIQUE,
  owner_subject TEXT NOT NULL,
  historical_opening_id TEXT NOT NULL REFERENCES opening_revisions(id) ON DELETE RESTRICT,
  historical_opening_revision INTEGER NOT NULL REFERENCES opening_revisions(revision) ON DELETE RESTRICT,
  reference_json TEXT NOT NULL CHECK(json_valid(reference_json)),
  CHECK(json_type(reference_json,'$.opening.positions') IS 'array'),
  CHECK(json_type(reference_json,'$.opening.cash.amount') IS 'text'),
  CHECK(json_extract(reference_json,'$.portfolio_id') IS portfolio_id),
  CHECK(json_extract(reference_json,'$.owner_subject') IS owner_subject),
  CHECK(json_extract(reference_json,'$.historical_opening_id') IS historical_opening_id),
  CHECK(json_extract(reference_json,'$.historical_opening_revision') IS historical_opening_revision),
  CHECK(json_extract(reference_json,'$.opening.id') IS id),
  CHECK(json_extract(reference_json,'$.opening.revision') IS 1),
  CHECK(json_extract(reference_json,'$.opening.cash.currency') IS 'EUR')
);
CREATE TRIGGER operational_opening_no_update BEFORE UPDATE ON portfolio_operational_openings
BEGIN SELECT RAISE(ABORT,'immutable_operational_opening'); END;
CREATE TRIGGER operational_opening_no_delete BEFORE DELETE ON portfolio_operational_openings
BEGIN SELECT RAISE(ABORT,'immutable_operational_opening'); END;

-- The old FKs could only address historical V1 openings. Replace the EMPTY journal
-- parent, preserving every row and child-table name, with equivalent anchor guards
-- accepting either the historical anchor or the explicit immutable operational one.
CREATE TABLE transaction_journals_operational (
  portfolio_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('real','simulated')),
  owner_subject TEXT NOT NULL CHECK(length(owner_subject) BETWEEN 1 AND 128),
  opening_id TEXT NOT NULL,
  opening_revision INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 1000)
);
INSERT INTO transaction_journals_operational SELECT * FROM transaction_journals;
DROP TRIGGER transaction_event_sequence;
DROP TRIGGER transaction_event_advance;
DROP TABLE transaction_journals;
ALTER TABLE transaction_journals_operational RENAME TO transaction_journals;
CREATE TRIGGER transaction_journal_anchor BEFORE INSERT ON transaction_journals BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.portfolio_id)
    AND NOT EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.portfolio_id
      AND id=NEW.opening_id AND owner_subject=NEW.owner_subject AND NEW.opening_revision=1 AND NEW.kind='real')
    THEN RAISE(ABORT,'opening_anchor_mismatch') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.portfolio_id)
    AND NOT EXISTS(SELECT 1 FROM opening_revisions WHERE id=NEW.opening_id AND revision=NEW.opening_revision)
    THEN RAISE(ABORT,'opening_anchor_mismatch') END;
END;
CREATE TRIGGER transaction_journal_identity BEFORE UPDATE ON transaction_journals BEGIN
  SELECT CASE WHEN NEW.portfolio_id != OLD.portfolio_id OR NEW.kind != OLD.kind OR NEW.owner_subject != OLD.owner_subject
    OR NEW.opening_id != OLD.opening_id OR NEW.opening_revision != OLD.opening_revision OR NEW.version != OLD.version+1
    THEN RAISE(ABORT,'immutable_journal_identity') END;
END;
CREATE TRIGGER transaction_journal_no_delete BEFORE DELETE ON transaction_journals
BEGIN SELECT RAISE(ABORT,'immutable_journal'); END;
CREATE TRIGGER transaction_event_sequence BEFORE INSERT ON transaction_events BEGIN
  SELECT CASE WHEN NEW.sequence != (SELECT version+1 FROM transaction_journals WHERE portfolio_id=NEW.portfolio_id)
    THEN RAISE(ABORT,'transaction_version_conflict') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM transaction_journals WHERE portfolio_id=NEW.portfolio_id
    AND owner_subject=json_extract(NEW.event_json,'$.actor') AND kind=json_extract(NEW.balances_json,'$.kind')
    AND opening_id=json_extract(NEW.balances_json,'$.opening_id') AND opening_revision=json_extract(NEW.balances_json,'$.opening_revision'))
    THEN RAISE(ABORT,'opening_anchor_mismatch') END;
END;
CREATE TRIGGER transaction_event_advance AFTER INSERT ON transaction_events BEGIN
  UPDATE transaction_journals SET version=NEW.sequence WHERE portfolio_id=NEW.portfolio_id;
END;
CREATE TRIGGER operational_opening_guard BEFORE INSERT ON portfolio_operational_openings BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM transaction_journals WHERE portfolio_id=NEW.portfolio_id)
    OR EXISTS(SELECT 1 FROM transaction_events WHERE portfolio_id=NEW.portfolio_id)
    THEN RAISE(ABORT,'operational_journal_not_empty') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM opening_revisions WHERE id=NEW.historical_opening_id
    AND revision=NEW.historical_opening_revision AND effective_at<json_extract(NEW.reference_json,'$.opening.effective_at'))
    THEN RAISE(ABORT,'opening_anchor_mismatch') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.reference_json,'$.opening.positions') p
    WHERE NOT EXISTS(SELECT 1 FROM instruments i WHERE i.id=json_extract(p.value,'$.instrument_id') AND i.quote_currency='EUR'))
    THEN RAISE(ABORT,'unknown_instrument') END;
END;
