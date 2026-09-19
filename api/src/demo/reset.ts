import { withTx, type PoolClient } from '../db.js';
import { insertActiveSeed, type Commitment } from '../fairness/seeds.js';

/**
 * The demo dataset, fixed in code.
 *
 * Nothing about a reset is parameterised by the request. There is no account id
 * in the body and no way to name one, because an endpoint that accepts "which
 * account should I wipe" is a destructive admin API wearing a demo's clothes.
 * These are exactly the accounts migration 003 seeds.
 */
export const DEMO_ACCOUNTS = [
  { id: 'treasury', kind: 'treasury' },
  { id: 'gateway', kind: 'gateway' },
  { id: 'pending_bets', kind: 'escrow' },
  { id: 'user:demo', kind: 'user' },
  { id: 'affiliate:alice', kind: 'affiliate' },
] as const;

export const DEMO_USER_ID = 'user:demo';
export const DEMO_AFFILIATE_ID = 'affiliate:alice';

/** Namespaces 1 and 2 are betId and daily-loss userId; this is the third. */
const RESET_LOCK_NAMESPACE = 3;
const RESET_LOCK_KEY = 'demo-reset';

/**
 * Tables holding demo activity, cleared in full.
 *
 * TRUNCATE rather than DELETE, and that is the point rather than a shortcut:
 * `postings` and `journal_entries` carry BEFORE DELETE triggers that raise
 * LEDGER_IMMUTABLE, so a row-level delete is impossible by design and stays
 * impossible after this change. TRUNCATE is DDL and does not fire row triggers,
 * which is why it is available to an environment lifecycle operation and not to
 * anything the product itself can call.
 *
 * `accounts`, `affiliate_links` and `sessions` are deliberately absent: the
 * chart of accounts is a fixture rather than activity, and a visitor should
 * stay signed in across a reset instead of silently losing their session.
 */
const DEMO_ACTIVITY_TABLES = [
  'postings',
  'journal_entries',
  'webhook_events',
  'bets',
  'rounds',
  'server_seeds',
] as const;

export type DemoResetResult = {
  commitment: Commitment;
  clearedTables: readonly string[];
  attempts: number;
};

/** deadlock_detected, and lock_not_available from the lock_timeout below. */
const RETRYABLE = new Set(['40P01', '55P03']);
const MAX_ATTEMPTS = 5;

const isRetryable = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  'code' in err &&
  typeof (err as { code: unknown }).code === 'string' &&
  RETRYABLE.has((err as { code: string }).code);

/**
 * Returns the demo environment to the state a fresh install would have: no
 * activity, the seeded chart of accounts, and exactly one active server seed.
 *
 * This is an environment lifecycle operation, not a financial one. It writes no
 * balance and could not: there is no balance column to write, and the postings
 * that a balance is summed from are append-only to every code path the product
 * exposes. What it does is discard a dataset and reseed it -- the same thing
 * dropping and recreating a demo database would do, without touching schema or
 * migration history.
 *
 * Everything happens in one transaction. TRUNCATE takes ACCESS EXCLUSIVE on the
 * tables it clears and holds it until commit, so a concurrent bet either
 * completes before the reset begins or waits and then runs against the reseeded
 * environment. There is no window in which a request can observe a truncated
 * ledger with no active seed.
 */
const attemptReset = async (): Promise<Omit<DemoResetResult, 'attempts'>> =>
  withTx(async (client: PoolClient) => {
    // Bounded so a reset that cannot get its locks fails and is retried rather
    // than parking a connection behind a long-running bet indefinitely.
    await client.query("SET LOCAL lock_timeout = '3s'");

    // Serialises resets against each other before any of them takes a table
    // lock, so two concurrent calls queue rather than deadlock-race.
    await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
      RESET_LOCK_NAMESPACE,
      RESET_LOCK_KEY,
    ]);

    await client.query(
      `TRUNCATE TABLE ${DEMO_ACTIVITY_TABLES.join(', ')} RESTART IDENTITY CASCADE`,
    );

    // Reseed the chart of accounts. Idempotent, and identical to migration 003,
    // so a reset cannot drift away from what a fresh install produces.
    for (const account of DEMO_ACCOUNTS) {
      await client.query(
        'INSERT INTO accounts (id, kind) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [account.id, account.kind],
      );
    }
    await client.query(
      `INSERT INTO affiliate_links (user_id, affiliate_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [DEMO_USER_ID, DEMO_AFFILIATE_ID],
    );

    // The environment is not usable without one, and the truncate above removed
    // whatever was there, so this insert must succeed rather than find an
    // existing seed.
    const commitment = await insertActiveSeed(client);
    if (!commitment) {
      throw new Error('demo reset could not install an active seed');
    }

    return { commitment, clearedTables: DEMO_ACTIVITY_TABLES };
  });

/**
 * A reset competes for table locks with whatever bets are in flight, and the
 * two acquire their tables in different orders -- a bet reads postings while
 * computing a daily total, then locks the active seed, while a reset wants
 * exclusive access to both. Postgres detects the cycle and kills one side.
 *
 * The reset is the right side to lose. It is idempotent and wholly inside one
 * transaction, so the victim rolls back with nothing half-done and simply tries
 * again; a bet that is mid-settlement is not something to sacrifice for a demo
 * convenience. Retrying is therefore the mechanism, not a workaround for one:
 * every attempt either commits a complete reset or leaves the environment
 * exactly as it found it.
 */
export const resetDemoEnvironment = async (): Promise<DemoResetResult> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await attemptReset();
      return { ...result, attempts: attempt };
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastError = err;
      // Brief, growing pause so the in-flight bets that won the race can finish
      // before the next attempt asks for their tables.
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }

  throw lastError;
};
