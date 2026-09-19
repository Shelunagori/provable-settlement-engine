import { getPool } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';

let migrated = false;

/** Applies migrations once per test process. */
export const ensureMigrated = async (): Promise<void> => {
  if (migrated) return;
  await runMigrations();
  migrated = true;
};

/**
 * Empties the transactional tables between tests and restores the chart of
 * accounts to exactly what migration 003 seeds.
 *
 * Postings are immutable by trigger, so this uses TRUNCATE, which is DDL and
 * does not fire row-level DELETE triggers. Accounts are not truncated (the
 * seeded chart is a fixture, not test data) but any account a test created is
 * removed, so one test cannot leak an account into another's assertions.
 *
 * Tests do not share a rollback-only outer transaction: several of them need
 * real, committed concurrency.
 */
export const SEEDED_ACCOUNTS = [
  'affiliate:alice',
  'gateway',
  'pending_bets',
  'treasury',
  'user:demo',
] as const;

export const resetLedger = async (): Promise<void> => {
  const pool = getPool();
  await pool.query(`
    TRUNCATE TABLE postings, journal_entries, webhook_events, bets, rounds,
                   sessions, server_seeds
    RESTART IDENTITY CASCADE
  `);
  await pool.query('DELETE FROM affiliate_links WHERE user_id <> ALL($1::text[])', [
    SEEDED_ACCOUNTS,
  ]);
  await pool.query('DELETE FROM accounts WHERE id <> ALL($1::text[])', [SEEDED_ACCOUNTS]);
};

export const balanceOf = async (accountId: string): Promise<bigint> => {
  const { rows } = await getPool().query<{ balance_minor: bigint }>(
    'SELECT COALESCE(SUM(amount_minor), 0)::BIGINT AS balance_minor FROM postings WHERE account_id = $1',
    [accountId],
  );
  return rows[0]?.balance_minor ?? 0n;
};

export const ledgerSum = async (): Promise<bigint> => {
  const { rows } = await getPool().query<{ total: bigint }>(
    'SELECT COALESCE(SUM(amount_minor), 0)::BIGINT AS total FROM postings',
  );
  return rows[0]?.total ?? 0n;
};

/**
 * Opens and releases `n` pooled connections so they are already established
 * before a concurrency test fires.
 *
 * Without this, a burst of requests does not actually overlap: establishing a
 * new Postgres connection costs more than one of these transactions takes, so
 * the first request finishes and returns its client to the pool before the
 * second has finished connecting. The requests serialise, every transaction
 * sees the work of the one before it, and a test written to catch a race
 * passes against an implementation that has one.
 */
export const warmPool = async (n = 12): Promise<void> => {
  const pool = getPool();
  const clients = await Promise.all(Array.from({ length: n }, () => pool.connect()));
  for (const c of clients) c.release();
};
