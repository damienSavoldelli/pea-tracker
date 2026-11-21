-- Local preparation only. No production activation or migration is authorized.
CREATE TABLE financial_approvals (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL,
  digest TEXT NOT NULL CHECK(length(digest)=64),
  prepared_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at > prepared_at),
  proposal_json TEXT NOT NULL CHECK(json_valid(proposal_json)),
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
  status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','approved','consumed')),
  csrf TEXT,
  approved_at TEXT,
  consumed_at TEXT,
  CHECK((status='prepared' AND approved_at IS NULL AND consumed_at IS NULL)
    OR (status='approved' AND approved_at IS NOT NULL AND consumed_at IS NULL AND csrf IS NULL)
    OR (status='consumed' AND approved_at IS NOT NULL AND consumed_at IS NOT NULL AND csrf IS NULL)),
  CHECK(id=json_extract(proposal_json,'$.idempotency_key') AND digest=json_extract(proposal_json,'$.digest')
    AND prepared_at=json_extract(proposal_json,'$.prepared_at') AND expires_at=json_extract(proposal_json,'$.expires_at'))
);
CREATE TRIGGER financial_approval_immutable BEFORE UPDATE ON financial_approvals
WHEN NEW.id IS NOT OLD.id OR NEW.subject IS NOT OLD.subject OR NEW.digest IS NOT OLD.digest
  OR NEW.prepared_at IS NOT OLD.prepared_at OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.proposal_json IS NOT OLD.proposal_json OR NEW.summary_json IS NOT OLD.summary_json
  OR NOT ((OLD.status='prepared' AND NEW.status IN ('prepared','approved'))
    OR (OLD.status='approved' AND NEW.status='consumed' AND NEW.approved_at IS OLD.approved_at))
BEGIN SELECT RAISE(ABORT,'financial_approval_immutable'); END;
