-- 004_round_lifecycle.sql
-- Adds a lifecycle journal event so a round's history is recorded rather than
-- inferred.
--
-- open -> locked and resolved -> settled each coincide with a money-moving
-- entry (bet_lock, bet_settle). locked -> resolved does not: computing an
-- outcome moves no money. Without a marker for it, the "resolved" step could
-- only be guessed from the round's current status, which is exactly the kind
-- of derived-from-nothing history this system is built to avoid.
--
-- A round_resolved entry carries zero postings. That is not a money movement,
-- so postEntry() remains the only path by which money moves; the deferred
-- balance trigger fires per posting and is simply never reached by an entry
-- that has none.

ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_kind_check;

ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_kind_check
  CHECK (kind IN (
    'deposit',
    'bet_lock',
    'bet_settle',
    'commission',
    'withdrawal',
    'round_resolved'
  ));
