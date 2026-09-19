-- 002_triggers.sql
-- The database, not the application, is the authority on ledger integrity.

-- Deferred constraint trigger: at COMMIT, every touched entry's postings must sum to 0.
CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS trigger AS $$
DECLARE s BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount_minor), 0) INTO s FROM postings WHERE entry_id = NEW.entry_id;
  IF s <> 0 THEN
    RAISE EXCEPTION 'LEDGER_UNBALANCED entry % sums to %', NEW.entry_id, s
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS postings_balanced ON postings;
CREATE CONSTRAINT TRIGGER postings_balanced
  AFTER INSERT ON postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();

-- Postings are append-only. History is never rewritten; corrections are new entries.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE postings cannot be updated or deleted'
    USING ERRCODE = 'integrity_constraint_violation';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS postings_immutable ON postings;
CREATE TRIGGER postings_immutable
  BEFORE UPDATE OR DELETE ON postings
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Journal entries are append-only too.
DROP TRIGGER IF EXISTS journal_entries_immutable ON journal_entries;
CREATE TRIGGER journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Rounds move forward only: open -> locked -> resolved -> settled.
CREATE OR REPLACE FUNCTION assert_round_transition() RETURNS trigger AS $$
DECLARE
  rank_old INT;
  rank_new INT;
BEGIN
  rank_old := CASE OLD.status WHEN 'open' THEN 0 WHEN 'locked' THEN 1 WHEN 'resolved' THEN 2 WHEN 'settled' THEN 3 END;
  rank_new := CASE NEW.status WHEN 'open' THEN 0 WHEN 'locked' THEN 1 WHEN 'resolved' THEN 2 WHEN 'settled' THEN 3 END;
  IF rank_new <> rank_old + 1 THEN
    RAISE EXCEPTION 'ROUND_ILLEGAL_TRANSITION round % cannot move % -> %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rounds_linear ON rounds;
CREATE TRIGGER rounds_linear
  BEFORE UPDATE ON rounds
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION assert_round_transition();
