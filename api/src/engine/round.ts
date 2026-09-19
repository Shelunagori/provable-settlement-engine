import { ulid } from 'ulid';
import type { PoolClient } from '../db.js';
import { getPool } from '../db.js';
import { RefusalError } from '../refusals.js';

export type RoundStatus = 'open' | 'locked' | 'resolved' | 'settled';

export type RoundHistoryStep = {
  status: RoundStatus;
  at: string;
  entryId?: number;
};

export type RoundView = {
  id: string;
  userId: string;
  status: RoundStatus;
  history: RoundHistoryStep[];
};

/**
 * Moves a round exactly one step, under a row lock, asserting where it started.
 *
 * The lock is what makes the assertion worth anything: without it two callers
 * could both read 'open' and both try to advance. The database trigger from
 * migration 002 is still the final arbiter and would reject the second, but a
 * refusal is a better answer than a constraint violation, so the service
 * checks as well. Neither replaces the other.
 */
const transition = async (
  client: PoolClient,
  roundId: string,
  from: RoundStatus,
  to: RoundStatus,
): Promise<void> => {
  const { rows } = await client.query<{ status: RoundStatus }>(
    'SELECT status FROM rounds WHERE id = $1 FOR UPDATE',
    [roundId],
  );
  const current = rows[0]?.status;

  if (current === undefined) {
    throw new RefusalError('ROUND_CLOSED', `No such round ${roundId}`, { roundId });
  }
  if (current !== from) {
    throw new RefusalError(
      'ROUND_CLOSED',
      `Round ${roundId} is ${current}; this step requires ${from}`,
      { roundId, status: current, required: from },
    );
  }

  await client.query('UPDATE rounds SET status = $1 WHERE id = $2', [to, roundId]);
};

export const createRound = async (client: PoolClient, userId: string): Promise<string> => {
  const id = ulid();
  await client.query("INSERT INTO rounds (id, user_id, status) VALUES ($1, $2, 'open')", [
    id,
    userId,
  ]);
  return id;
};

export const lockRound = (client: PoolClient, roundId: string): Promise<void> =>
  transition(client, roundId, 'open', 'locked');

export const resolveRound = (client: PoolClient, roundId: string): Promise<void> =>
  transition(client, roundId, 'locked', 'resolved');

export const settleRound = (client: PoolClient, roundId: string): Promise<void> =>
  transition(client, roundId, 'resolved', 'settled');

/**
 * Writes the lifecycle marker for locked -> resolved.
 *
 * It carries no postings because computing an outcome moves no money. Without
 * it the resolved step would have to be inferred from the round's current
 * status, which is not history -- it is a guess that happens to be right until
 * something goes wrong.
 */
export const recordRoundResolved = async (
  client: PoolClient,
  roundId: string,
): Promise<bigint> => {
  const { rows } = await client.query<{ id: bigint }>(
    `INSERT INTO journal_entries (kind, ref_type, ref_id)
     VALUES ('round_resolved', 'round', $1)
     RETURNING id`,
    [roundId],
  );
  return rows[0]!.id;
};

/**
 * The round and the steps it actually took.
 *
 * Every step but the first is read from the journal, so this is a record
 * rather than a rendering of the current status. The ordering is by journal id:
 * all of these entries are written in one transaction, so their timestamps can
 * be identical and sorting by time would be arbitrary.
 */
export const getRoundWithHistory = async (roundId: string): Promise<RoundView | null> => {
  const pool = getPool();

  const roundRes = await pool.query<{
    id: string;
    user_id: string;
    status: RoundStatus;
    created_at: Date;
  }>('SELECT id, user_id, status, created_at FROM rounds WHERE id = $1', [roundId]);
  const round = roundRes.rows[0];
  if (!round) return null;

  const events = await pool.query<{ id: bigint; kind: string; created_at: Date }>(
    `SELECT id, kind, created_at FROM journal_entries
     WHERE ref_type = 'round' AND ref_id = $1
     ORDER BY id`,
    [roundId],
  );

  const stepFor: Record<string, RoundStatus> = {
    bet_lock: 'locked',
    round_resolved: 'resolved',
    bet_settle: 'settled',
  };

  const history: RoundHistoryStep[] = [
    { status: 'open', at: round.created_at.toISOString() },
  ];
  for (const e of events.rows) {
    const status = stepFor[e.kind];
    if (!status) continue;
    history.push({ status, at: e.created_at.toISOString(), entryId: Number(e.id) });
  }

  return { id: round.id, userId: round.user_id, status: round.status, history };
};
