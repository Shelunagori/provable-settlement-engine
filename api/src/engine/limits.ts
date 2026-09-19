import type { PoolClient } from '../db.js';
import { getPool } from '../db.js';

export const MIN_BET_MINOR = 100n;
export const MAX_BET_MINOR = 50_000n;
export const DAILY_LOSS_LIMIT_MINOR = 200_000n;

/**
 * The user's net movement from betting so far today.
 *
 * Only this account's postings, only entries of kind bet_lock or bet_settle,
 * only the current UTC day. Deposits, withdrawals and affiliate commission are
 * all excluded: none of them is the user losing money at the table, and
 * counting a deposit as a win would hand back allowance the user never earned.
 *
 * The day boundary is pinned to UTC in SQL rather than taken from the server's
 * or session's timezone, so the limit resets at the same instant wherever this
 * runs and whatever the database is configured with.
 *
 * Negative means down on the day. The value is deliberately not clamped: a user
 * who is up today legitimately has more headroom than one who is level.
 */
const DAILY_NET_SQL = `
  SELECT COALESCE(SUM(p.amount_minor), 0)::BIGINT AS net
  FROM postings p
  JOIN journal_entries e ON e.id = p.entry_id
  WHERE p.account_id = $1
    AND e.kind IN ('bet_lock', 'bet_settle')
    AND e.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
`;

export const dailyNetMinorTx = async (
  client: PoolClient,
  userId: string,
): Promise<bigint> => {
  const { rows } = await client.query<{ net: bigint }>(DAILY_NET_SQL, [userId]);
  return rows[0]?.net ?? 0n;
};

export const dailyNetMinor = async (userId: string): Promise<bigint> => {
  const { rows } = await getPool().query<{ net: bigint }>(DAILY_NET_SQL, [userId]);
  return rows[0]?.net ?? 0n;
};
