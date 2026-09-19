-- 001_schema.sql
-- Core schema. Deliberate absence: no table in this file has a balance column.
-- A balance is always SUM(postings.amount_minor) for an account, computed at read time.

CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('treasury','user','gateway','escrow','affiliate')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('deposit','bet_lock','bet_settle','commission','withdrawal')),
  ref_type    TEXT CHECK (ref_type IN ('webhook_event','bet','round')),
  ref_id      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_entries_ref_idx ON journal_entries(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS journal_entries_created_idx ON journal_entries(created_at);

-- Sign convention: positive = credit to that account, negative = debit from it.
-- Every journal entry's postings sum to exactly 0 (enforced in 002_triggers.sql).
CREATE TABLE IF NOT EXISTS postings (
  id           BIGSERIAL PRIMARY KEY,
  entry_id     BIGINT NOT NULL REFERENCES journal_entries(id),
  account_id   TEXT   NOT NULL REFERENCES accounts(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS postings_account_idx ON postings(account_id);
CREATE INDEX IF NOT EXISTS postings_entry_idx ON postings(entry_id);
CREATE INDEX IF NOT EXISTS postings_account_created_idx ON postings(account_id, created_at);

-- Idempotency ledger for inbound payment events.
-- The PRIMARY KEY is the idempotency mechanism: concurrent duplicates block on this
-- unique index until the first transaction commits, then read back its entry_id.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id     TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  payload      JSONB NOT NULL,
  entry_id     BIGINT REFERENCES journal_entries(id),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed custody. seed_hash is published before the seed is ever used;
-- seed is only disclosed once status flips to 'revealed'.
CREATE TABLE IF NOT EXISTS server_seeds (
  id           BIGSERIAL PRIMARY KEY,
  seed         TEXT NOT NULL,
  seed_hash    TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL CHECK (status IN ('active','revealed')),
  nonce        BIGINT NOT NULL DEFAULT 0 CHECK (nonce >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revealed_at  TIMESTAMPTZ
);
-- At most one active seed at a time.
CREATE UNIQUE INDEX IF NOT EXISTS server_seeds_single_active
  ON server_seeds ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS rounds (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES accounts(id),
  status       TEXT NOT NULL CHECK (status IN ('open','locked','resolved','settled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bets (
  id            TEXT PRIMARY KEY,
  round_id      TEXT NOT NULL REFERENCES rounds(id),
  user_id       TEXT NOT NULL REFERENCES accounts(id),
  amount_minor  BIGINT NOT NULL CHECK (amount_minor > 0),
  target_under  NUMERIC(5,2) NOT NULL CHECK (target_under >= 1.00 AND target_under <= 98.00),
  client_seed   TEXT NOT NULL,
  seed_id       BIGINT REFERENCES server_seeds(id),
  nonce         BIGINT,
  roll          NUMERIC(5,2),
  won           BOOLEAN,
  payout_minor  BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bets_user_created_idx ON bets(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bets_seed_nonce_idx ON bets(seed_id, nonce);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES accounts(id),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_links (
  user_id      TEXT PRIMARY KEY REFERENCES accounts(id),
  affiliate_id TEXT NOT NULL REFERENCES accounts(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read-time projection. A view, never a materialized column.
CREATE OR REPLACE VIEW account_balances AS
  SELECT a.id AS account_id,
         a.kind,
         COALESCE(SUM(p.amount_minor), 0)::BIGINT AS balance_minor
  FROM accounts a
  LEFT JOIN postings p ON p.account_id = a.id
  GROUP BY a.id, a.kind;
