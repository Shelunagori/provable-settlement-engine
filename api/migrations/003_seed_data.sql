-- 003_seed_data.sql
-- The fixed chart of accounts. No balances here -- only names and kinds.

INSERT INTO accounts (id, kind) VALUES
  ('treasury',         'treasury'),
  ('gateway',          'gateway'),
  ('pending_bets',     'escrow'),
  ('user:demo',        'user'),
  ('affiliate:alice',  'affiliate')
ON CONFLICT (id) DO NOTHING;

INSERT INTO affiliate_links (user_id, affiliate_id) VALUES
  ('user:demo', 'affiliate:alice')
ON CONFLICT (user_id) DO NOTHING;
