-- Extend anchors without replacing any populated journal/table or historical payload.
DROP TRIGGER transaction_journal_anchor;
CREATE TRIGGER transaction_journal_anchor BEFORE INSERT ON transaction_journals BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM portfolios WHERE id=NEW.portfolio_id)
    AND NOT EXISTS(SELECT 1 FROM portfolios WHERE id=NEW.portfolio_id AND owner_subject=NEW.owner_subject
      AND kind=NEW.kind AND status='active' AND opening_id=NEW.opening_id AND opening_revision=NEW.opening_revision)
    THEN RAISE(ABORT,'portfolio_write_denied') END;
  -- Preserve legacy anchors for old standalone compositions. Registered portfolios
  -- never fall back to another portfolio's historical/operational opening.
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM portfolios WHERE id=NEW.portfolio_id)
    AND EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.portfolio_id)
    AND NOT EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.portfolio_id
      AND id=NEW.opening_id AND owner_subject=NEW.owner_subject AND NEW.opening_revision=1 AND NEW.kind='real')
    THEN RAISE(ABORT,'opening_anchor_mismatch') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM portfolios WHERE id=NEW.portfolio_id)
    AND NOT EXISTS(SELECT 1 FROM portfolio_operational_openings WHERE portfolio_id=NEW.portfolio_id)
    AND NOT EXISTS(SELECT 1 FROM opening_revisions WHERE id=NEW.opening_id AND revision=NEW.opening_revision)
    THEN RAISE(ABORT,'opening_anchor_mismatch') END;
END;

-- Same transaction as event append: closes the check/archive/append race for both
-- first and subsequent writes. Existing sequence, actor, CAS and receipt guards stay.
CREATE TRIGGER portfolio_transaction_write_guard BEFORE INSERT ON transaction_events
WHEN EXISTS(SELECT 1 FROM portfolios WHERE id=NEW.portfolio_id)
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM portfolios p WHERE p.id=NEW.portfolio_id AND p.status='active'
    AND p.owner_subject=json_extract(NEW.event_json,'$.actor')
    AND p.kind=json_extract(NEW.balances_json,'$.kind')
    AND p.opening_id=json_extract(NEW.balances_json,'$.opening_id')
    AND p.opening_revision=json_extract(NEW.balances_json,'$.opening_revision'))
    THEN RAISE(ABORT,'portfolio_write_denied') END;
END;
