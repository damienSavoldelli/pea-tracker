-- Additive V2.0-A registry. No existing financial table, trigger or payload is changed.
-- Independent openings are immutable snapshots in the registry row: creation is atomic
-- and cannot leave an orphan portfolio or opening. Historical sources remain references.
CREATE TABLE portfolios (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  owner_subject TEXT NOT NULL CHECK(length(owner_subject) BETWEEN 1 AND 128),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160 AND name=trim(name)),
  kind TEXT NOT NULL CHECK(kind IN ('real','simulated')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  opening_source TEXT NOT NULL CHECK(opening_source IN ('independent','historical','operational')),
  opening_id TEXT NOT NULL CHECK(length(opening_id)=36),
  opening_revision INTEGER NOT NULL CHECK(opening_revision BETWEEN 1 AND 9007199254740991),
  opening_json TEXT CHECK(opening_json IS NULL OR json_valid(opening_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL CHECK(updated_at>=created_at),
  UNIQUE(opening_source,opening_id,opening_revision),
  CHECK((opening_source='independent' AND opening_json IS NOT NULL AND opening_revision=1)
    OR (opening_source='historical' AND opening_json IS NULL)
    OR (opening_source='operational' AND opening_json IS NULL AND opening_revision=1 AND kind='real'))
);
CREATE INDEX portfolios_owner_id ON portfolios(owner_subject,id);

CREATE TRIGGER portfolio_registry_anchor BEFORE INSERT ON portfolios BEGIN
  SELECT CASE WHEN NEW.version!=1 OR NEW.status!='active' OR NEW.created_at!=NEW.updated_at
    THEN RAISE(ABORT,'invalid_registry_initial_state') END;
  -- Existing journal identity must agree even when its stream is already populated.
  SELECT CASE WHEN EXISTS(SELECT 1 FROM transaction_journals j WHERE j.portfolio_id=NEW.id
    AND (j.owner_subject!=NEW.owner_subject OR j.kind!=NEW.kind OR j.opening_id!=NEW.opening_id OR j.opening_revision!=NEW.opening_revision))
    THEN RAISE(ABORT,'portfolio_anchor_mismatch') END;
  SELECT CASE WHEN NEW.opening_source='historical' AND (
    NOT EXISTS(SELECT 1 FROM opening_revisions WHERE id=NEW.opening_id AND revision=NEW.opening_revision)
    OR NOT EXISTS(SELECT 1 FROM transaction_journals WHERE portfolio_id=NEW.id AND owner_subject=NEW.owner_subject)
    OR EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.id))
    THEN RAISE(ABORT,'portfolio_anchor_mismatch') END;
  SELECT CASE WHEN NEW.opening_source='operational' AND NOT EXISTS(
    SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.id AND owner_subject=NEW.owner_subject AND id=NEW.opening_id)
    THEN RAISE(ABORT,'portfolio_anchor_mismatch') END;
  SELECT CASE WHEN NEW.opening_source='independent' AND (
    EXISTS(SELECT 1 FROM transaction_journals WHERE portfolio_id=NEW.id)
    OR EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.id)
    OR EXISTS(SELECT 1 FROM opening_revisions WHERE id=NEW.opening_id)
    OR EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE id=NEW.opening_id))
    THEN RAISE(ABORT,'portfolio_anchor_mismatch') END;
  SELECT CASE WHEN NEW.opening_source='independent' AND (
    json_extract(NEW.opening_json,'$.id') IS NOT NEW.opening_id
    OR json_extract(NEW.opening_json,'$.revision') IS NOT 1
    OR json_extract(NEW.opening_json,'$.recorded_at') IS NOT NEW.created_at
    OR json_type(NEW.opening_json,'$.effective_at') IS NOT 'text'
    OR json_extract(NEW.opening_json,'$.effective_at')>NEW.created_at
    OR json_type(NEW.opening_json,'$.correction_reason') IS NOT 'null'
    OR json_type(NEW.opening_json,'$.cash.amount') IS NOT 'text'
    OR json_extract(NEW.opening_json,'$.cash.amount') LIKE '-%'
    OR json_extract(NEW.opening_json,'$.cash.currency') IS NOT 'EUR'
    OR json_type(NEW.opening_json,'$.positions') IS NOT 'array'
    OR json_array_length(NEW.opening_json,'$.positions')>100)
    THEN RAISE(ABORT,'portfolio_anchor_mismatch') END;
  SELECT CASE WHEN NEW.opening_source='independent' AND EXISTS(
    SELECT 1 FROM json_each(NEW.opening_json,'$.positions') p WHERE json_extract(p.value,'$.currency') IS NOT 'EUR'
      OR NOT EXISTS(SELECT 1 FROM instruments i WHERE i.id=json_extract(p.value,'$.instrument_id') AND i.quote_currency='EUR'))
    THEN RAISE(ABORT,'unknown_instrument') END;
  SELECT CASE WHEN NEW.opening_source='independent' AND (
    SELECT COUNT(*)!=COUNT(DISTINCT json_extract(value,'$.instrument_id')) FROM json_each(NEW.opening_json,'$.positions'))
    THEN RAISE(ABORT,'portfolio_anchor_mismatch') END;
END;

CREATE TRIGGER portfolio_registry_immutable BEFORE UPDATE ON portfolios BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.owner_subject IS NOT OLD.owner_subject OR NEW.name IS NOT OLD.name
    OR NEW.kind IS NOT OLD.kind OR NEW.opening_source IS NOT OLD.opening_source OR NEW.opening_id IS NOT OLD.opening_id
    OR NEW.opening_revision IS NOT OLD.opening_revision OR NEW.opening_json IS NOT OLD.opening_json
    OR NEW.created_at IS NOT OLD.created_at OR NEW.version!=OLD.version+1
    OR OLD.status!='active' OR NEW.status!='archived'
    THEN RAISE(ABORT,'immutable_portfolio_identity') END;
END;
CREATE TRIGGER portfolio_registry_no_delete BEFORE DELETE ON portfolios
BEGIN SELECT RAISE(ABORT,'immutable_portfolio_identity'); END;
-- JSON snapshots retain immutable financial values; protect their instrument links
-- with the equivalent of ON DELETE RESTRICT (legacy tables already have guards).
CREATE TRIGGER portfolio_opening_instrument_reference BEFORE DELETE ON instruments
WHEN EXISTS(SELECT 1 FROM portfolios p,json_each(p.opening_json,'$.positions') h
  WHERE p.opening_source='independent' AND json_extract(h.value,'$.instrument_id')=OLD.id)
BEGIN SELECT RAISE(ABORT,'portfolio_opening_instrument_referenced'); END;

-- Deterministic adoption: operational references identify portfolios even before
-- their first event. Journals without such references retain their historical anchor.
-- Inconsistent identities abort the migration; no invented UUID/owner or reset.
INSERT INTO portfolios(id,owner_subject,name,kind,status,version,opening_source,opening_id,opening_revision,created_at,updated_at)
SELECT portfolio_id,owner_subject,'Historical portfolio','real','active',1,'operational',id,1,
  json_extract(reference_json,'$.opening.recorded_at'),json_extract(reference_json,'$.opening.recorded_at')
FROM portfolio_operational_openings;
INSERT INTO portfolios(id,owner_subject,name,kind,status,version,opening_source,opening_id,opening_revision,created_at,updated_at)
SELECT j.portfolio_id,j.owner_subject,'Historical portfolio',j.kind,'active',1,'historical',j.opening_id,j.opening_revision,r.recorded_at,r.recorded_at
FROM transaction_journals j JOIN opening_revisions r ON r.id=j.opening_id AND r.revision=j.opening_revision
WHERE NOT EXISTS(SELECT 1 FROM portfolio_operational_openings o WHERE o.portfolio_id=j.portfolio_id);
-- Refuse to silently skip a journal with an invalid/unresolvable anchor.
CREATE TABLE portfolio_registry_migration_guard (missing INTEGER NOT NULL CHECK(missing=0));
INSERT INTO portfolio_registry_migration_guard
SELECT COUNT(*) FROM transaction_journals j WHERE NOT EXISTS(SELECT 1 FROM portfolios p WHERE p.id=j.portfolio_id);
DROP TABLE portfolio_registry_migration_guard;
