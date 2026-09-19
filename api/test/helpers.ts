import { createHash } from 'node:crypto';
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

/**
 * Replaces whatever active seed exists with a known one, so a test can assert a
 * fixed roll. The seed text is the shared fixture's, which is the same value
 * the browser verifier will be checked against.
 */
export const useFixtureSeed = async (
  seed: string,
  nonce = 0,
): Promise<{ id: bigint; seedHash: string }> => {
  const pool = getPool();
  await pool.query("DELETE FROM server_seeds WHERE status = 'active'");
  const seedHash = createHash('sha256').update(Buffer.from(seed, 'utf8')).digest('hex');
  const { rows } = await pool.query<{ id: bigint }>(
    `INSERT INTO server_seeds (seed, seed_hash, status, nonce)
     VALUES ($1, $2, 'active', $3) RETURNING id`,
    [seed, seedHash, nonce],
  );
  return { id: rows[0]!.id, seedHash };
};

/** Credits a user account straight through the ledger, for test setup. */
export const fundUser = async (userId: string, amountMinor: bigint): Promise<void> => {
  const pool = getPool();
  await pool.query(
    "INSERT INTO accounts (id, kind) VALUES ($1, 'user') ON CONFLICT DO NOTHING",
    [userId],
  );
  const { postEntry } = await import('../src/ledger/post.js');
  const { withTx } = await import('../src/db.js');
  await withTx((c) =>
    postEntry(c, {
      kind: 'deposit',
      refType: 'webhook_event',
      refId: `fund_${userId}_${amountMinor}_${Math.random().toString(36).slice(2)}`,
      postings: [
        { account: 'gateway', amountMinor: -amountMinor },
        { account: userId, amountMinor },
      ],
    }),
  );
};

export const activeSeedNonce = async (): Promise<bigint> => {
  const { rows } = await getPool().query<{ nonce: bigint }>(
    "SELECT nonce FROM server_seeds WHERE status = 'active'",
  );
  return rows[0]!.nonce;
};

/**
 * Writes a balanced, already-settled losing bet pair directly, dated `daysAgo`.
 *
 * Test fixture only: it is how a test reaches a previous UTC day without
 * mutating an immutable journal row, and how it sets up a starting daily loss
 * without consuming nonces or depending on what the seed happens to roll.
 *
 * Both entries go in one transaction. Each pool.query commits on its own, so
 * writing the legs separately would trip the deferred balance trigger on a
 * half-written entry.
 */
export const insertSettledLoss = async (
  userId: string,
  amountMinor: bigint,
  daysAgo = 0,
): Promise<void> => {
  const { withTx } = await import('../src/db.js');
  const at = `now() - interval '${daysAgo} days'`;
  await withTx(async (c) => {
    const legsByKind = [
      ['bet_lock', [[userId, -amountMinor], ['pending_bets', amountMinor]]],
      ['bet_settle', [['pending_bets', -amountMinor], ['treasury', amountMinor]]],
    ] as const;
    for (const [kind, legs] of legsByKind) {
      const { rows } = await c.query<{ id: bigint }>(
        `INSERT INTO journal_entries (kind, ref_type, ref_id, created_at)
         VALUES ($1, 'round', $2, ${at}) RETURNING id`,
        [kind, `fixture_${userId}_${daysAgo}_${amountMinor}`],
      );
      for (const [account, amount] of legs) {
        await c.query(
          `INSERT INTO postings (entry_id, account_id, amount_minor, created_at)
           VALUES ($1, $2, $3, ${at})`,
          [rows[0]!.id.toString(), account, String(amount)],
        );
      }
    }
  });
};
