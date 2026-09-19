import type { PoolClient } from '../db.js';
import { getPool } from '../db.js';
import { postEntry } from '../ledger/post.js';

const TREASURY = 'treasury';

/**
 * Pays the referring affiliate 1% of what the treasury took on a losing bet.
 *
 * Runs inside the bet's transaction, so a failure here takes the whole bet with
 * it rather than leaving a settled round whose commission silently never
 * happened.
 *
 * Nothing is paid when there is no take (a winning bet costs the treasury), when
 * the user has no referrer, or when 1% floors to zero -- a posting of zero is
 * not a movement, and an entry with no movement is noise in the journal.
 */
export const postCommission = async (
  client: PoolClient,
  roundId: string,
  userId: string,
  treasuryTakeMinor: bigint,
): Promise<bigint | null> => {
  if (treasuryTakeMinor <= 0n) return null;

  const link = await client.query<{ affiliate_id: string }>(
    'SELECT affiliate_id FROM affiliate_links WHERE user_id = $1',
    [userId],
  );
  const affiliateId = link.rows[0]?.affiliate_id;
  if (!affiliateId) return null;

  const commission = treasuryTakeMinor / 100n;
  if (commission === 0n) return null;

  const { entryId } = await postEntry(client, {
    kind: 'commission',
    refType: 'round',
    refId: roundId,
    postings: [
      { account: TREASURY, amountMinor: -commission },
      { account: affiliateId, amountMinor: commission },
    ],
  });
  return entryId;
};

/** Earnings derived from commission postings; never a stored running total. */
export const affiliateSummary = async (
  affiliateId: string,
): Promise<{ earnedMinor: bigint; referred: string[] }> => {
  const pool = getPool();

  const earned = await pool.query<{ earned: bigint }>(
    `SELECT COALESCE(SUM(p.amount_minor), 0)::BIGINT AS earned
     FROM postings p JOIN journal_entries e ON e.id = p.entry_id
     WHERE p.account_id = $1 AND e.kind = 'commission'`,
    [affiliateId],
  );

  const referred = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM affiliate_links WHERE affiliate_id = $1 ORDER BY user_id',
    [affiliateId],
  );

  return {
    earnedMinor: earned.rows[0]?.earned ?? 0n,
    referred: referred.rows.map((r) => r.user_id),
  };
};
