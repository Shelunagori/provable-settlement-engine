import { randomBytes } from 'node:crypto';
import { getPool, withTx, type Queryable } from '../db.js';
import { seedHashOf } from './outcome.js';

export type Commitment = { seedHash: string; nonce: bigint };
export type RevealedSeed = { seed: string; seedHash: string; revealedAt: Date };

/** 32 bytes from the OS CSPRNG, rendered as 64 lowercase hex characters. */
export const generateSeed = (): { seed: string; seedHash: string } => {
  const seed = randomBytes(32).toString('hex');
  return { seed, seedHash: seedHashOf(seed) };
};

/**
 * Inserts a freshly generated active seed, or reports that one already exists.
 *
 * Takes whatever can run a query -- the pool at boot, a transaction client
 * during a demo reset -- because a reset holds locks that a second connection
 * would wait on forever. If an active seed already exists the partial unique
 * index rejects the insert and ON CONFLICT DO NOTHING turns that rejection into
 * zero rows rather than an error.
 */
export const insertActiveSeed = async (q: Queryable): Promise<Commitment | null> => {
  const { seed, seedHash } = generateSeed();
  const { rows, rowCount } = await q.query<{ seed_hash: string; nonce: bigint }>(
    `INSERT INTO server_seeds (seed, seed_hash, status, nonce)
     VALUES ($1, $2, 'active', 0)
     ON CONFLICT DO NOTHING
     RETURNING seed_hash, nonce`,
    [seed, seedHash],
  );
  if (rowCount !== 1) return null;
  const row = rows[0]!;
  return { seedHash: row.seed_hash, nonce: row.nonce };
};

/**
 * Guarantees exactly one active seed, without ever replacing one that already
 * exists. A restart must not rotate the seed behind users' backs: the hash
 * published before a bet was placed has to stay the hash that bet is verified
 * against.
 *
 * Two instances booting simultaneously are resolved by the partial unique
 * index from migration 002, not by anything in this process. An in-memory
 * "have I initialised yet" latch would be per-process and would let a second
 * instance insert a second active seed.
 */
export const ensureActiveSeed = async (): Promise<Commitment> => {
  const inserted = await insertActiveSeed(getPool());

  if (inserted) {
    return inserted;
  }

  const existing = await getActiveCommitment();
  if (!existing) {
    throw new Error('No active seed could be created or found');
  }
  return existing;
};

/**
 * The published commitment. Selects only the columns it is allowed to return:
 * the plaintext seed is never read here, so it cannot leak through a
 * serialisation mistake, a log line or a debugging spread.
 */
export const getActiveCommitment = async (): Promise<Commitment | null> => {
  const { rows } = await getPool().query<{ seed_hash: string; nonce: bigint }>(
    "SELECT seed_hash, nonce FROM server_seeds WHERE status = 'active'",
  );
  const row = rows[0];
  return row ? { seedHash: row.seed_hash, nonce: row.nonce } : null;
};

/**
 * Reveals the current seed and installs its successor, in one transaction.
 *
 * The order is forced by the partial unique index: the outgoing seed has to
 * stop being active before the incoming one can start. Both statements commit
 * together, so there is no instant at which the service has no active seed and
 * no instant at which it has two -- and a failure anywhere leaves the old seed
 * active and unrevealed, which is the safe direction to fail in.
 */
export const rotateSeed = async (): Promise<{
  revealed: { seed: string; seedHash: string };
  next: { seedHash: string };
}> =>
  withTx(async (client) => {
    const selectActive = () =>
      client.query<{ id: bigint; seed: string; seed_hash: string }>(
        `SELECT id, seed, seed_hash FROM server_seeds
         WHERE status = 'active'
         FOR UPDATE`,
      );

    // A rotation that committed while this statement waited on its row leaves
    // this query with nothing: Postgres rechecks the locked tuple against
    // status = 'active' and the seed it was waiting for is now revealed. That is
    // a lost race, not an absence of seeds, so the successor is picked up by a
    // fresh statement -- the same shape H4 uses when allocating a nonce. Two
    // simultaneous operator rotations therefore serialise into two legitimate
    // rotations rather than one misleading internal error.
    let active = (await selectActive()).rows[0];
    if (!active) {
      active = (await selectActive()).rows[0];
    }
    if (!active) {
      throw new Error('No active seed to rotate');
    }

    await client.query(
      `UPDATE server_seeds SET status = 'revealed', revealed_at = now() WHERE id = $1`,
      [active.id.toString()],
    );

    const next = generateSeed();
    await client.query(
      `INSERT INTO server_seeds (seed, seed_hash, status, nonce)
       VALUES ($1, $2, 'active', 0)`,
      [next.seed, next.seedHash],
    );

    return {
      revealed: { seed: active.seed, seedHash: active.seed_hash },
      next: { seedHash: next.seedHash },
    };
  });

/** Revealed history only. An active seed is never included. */
export const listRevealedSeeds = async (): Promise<RevealedSeed[]> => {
  const { rows } = await getPool().query<{
    seed: string;
    seed_hash: string;
    revealed_at: Date;
  }>(
    `SELECT seed, seed_hash, revealed_at FROM server_seeds
     WHERE status = 'revealed'
     ORDER BY revealed_at DESC, id DESC`,
  );
  return rows.map((r) => ({ seed: r.seed, seedHash: r.seed_hash, revealedAt: r.revealed_at }));
};

/**
 * Whether this hash is a commitment this service published AND has since
 * disclosed. An active seed deliberately does not count: vouching for it would
 * mean confirming a seed whose plaintext nobody outside this service should
 * have yet.
 */
export const isRevealedCommitment = async (seedHash: string): Promise<boolean> => {
  const { rows } = await getPool().query<{ n: bigint }>(
    `SELECT COUNT(*)::BIGINT AS n FROM server_seeds
     WHERE seed_hash = $1 AND status = 'revealed'`,
    [seedHash],
  );
  return rows[0]!.n > 0n;
};
