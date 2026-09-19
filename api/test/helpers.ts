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
 * Empties the transactional tables between tests. Postings are immutable by
 * trigger, so this uses TRUNCATE (DDL-level, not a DELETE) and re-seeds the
 * chart of accounts afterwards. Tests do not share a rollback-only transaction
 * because several of them need real, committed concurrency.
 */
export const resetLedger = async (): Promise<void> => {
  const pool = getPool();
  await pool.query(`
    TRUNCATE TABLE postings, journal_entries, webhook_events, bets, rounds,
                   sessions, server_seeds
    RESTART IDENTITY CASCADE
  `);
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
