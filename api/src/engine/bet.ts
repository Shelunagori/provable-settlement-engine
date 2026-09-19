import type { PoolClient } from '../db.js';
import { getPool, withTx } from '../db.js';
import { computeOutcome, formatHundredths, isWin } from '../fairness/outcome.js';
import { postEntry } from '../ledger/post.js';
import { RefusalError } from '../refusals.js';
import {
  createRound,
  lockRound,
  recordRoundResolved,
  resolveRound,
  settleRound,
} from './round.js';

export type PlaceBetInput = {
  betId: string;
  userId: string;
  amountMinor: bigint;
  targetUnderHundredths: number;
  clientSeed: string;
};

export type PlacedBet = {
  bet: {
    id: string;
    roundId: string;
    userId: string;
    amountMinor: bigint;
    targetUnder: string;
    clientSeed: string;
  };
  roll: string;
  won: boolean;
  payoutMinor: bigint;
  entryIds: [bigint, bigint];
  seedHash: string;
  nonce: bigint;
};

export type BetRow = {
  id: string;
  roundId: string;
  userId: string;
  amountMinor: bigint;
  targetUnder: string;
  clientSeed: string;
  seedHash: string | null;
  nonce: bigint | null;
  roll: string | null;
  won: boolean | null;
  payoutMinor: bigint | null;
  createdAt: string;
};

const ESCROW = 'pending_bets';
const TREASURY = 'treasury';

/**
 * Payout at a 1% margin: multiplier = 99 / targetUnder, truncated to minor units.
 *
 * Done entirely in BigInt. targetUnder is already integer hundredths, so
 * multiplying the stake by 9900 and dividing by those hundredths is the same
 * expression with no decimal anywhere. BigInt division truncates toward zero
 * and both operands are positive, so this is the floor the brief asks for --
 * and no rounding can invent a fraction of a cent the ledger cannot represent.
 */
export const payoutFor = (amountMinor: bigint, targetUnderHundredths: number): bigint =>
  (amountMinor * 9900n) / BigInt(targetUnderHundredths);

/**
 * Takes the active seed's row lock and returns the nonce this bet will use.
 *
 * The lock is held until the caller's transaction ends, which serialises bets
 * on the seed row: two bets cannot read the same nonce, and a rolled-back bet
 * gives its nonce back because the increment is part of the same transaction.
 * MAX(nonce)+1 would be a read-then-write race, and a counter in this process
 * would stop working the moment a second instance started.
 *
 * A rotation committing between the statement starting and the row being
 * locked leaves this query with no row: Postgres rechecks the locked tuple
 * against the predicate and the old seed is no longer active. That is not an
 * error, it is a lost race, so it is retried once against the seed the
 * rotation installed.
 */
const allocateNonce = async (
  client: PoolClient,
): Promise<{ id: bigint; seed: string; seedHash: string; nonce: bigint }> => {
  const select = () =>
    client.query<{ id: bigint; seed: string; seed_hash: string; nonce: bigint }>(
      `SELECT id, seed, seed_hash, nonce FROM server_seeds
       WHERE status = 'active'
       FOR UPDATE`,
    );

  let active = (await select()).rows[0];
  if (!active) {
    active = (await select()).rows[0];
  }
  if (!active) {
    throw new Error('No active seed: cannot allocate a nonce');
  }

  await client.query('UPDATE server_seeds SET nonce = nonce + 1 WHERE id = $1', [
    active.id.toString(),
  ]);

  return { id: active.id, seed: active.seed, seedHash: active.seed_hash, nonce: active.nonce };
};

const loadBet = async (client: PoolClient, betId: string): Promise<PlacedBet | null> => {
  const { rows } = await client.query<{
    id: string;
    round_id: string;
    user_id: string;
    amount_minor: bigint;
    target_under: string;
    client_seed: string;
    nonce: bigint | null;
    roll: string | null;
    won: boolean | null;
    payout_minor: bigint | null;
    seed_hash: string | null;
  }>(
    `SELECT b.id, b.round_id, b.user_id, b.amount_minor, b.target_under, b.client_seed,
            b.nonce, b.roll, b.won, b.payout_minor, s.seed_hash
     FROM bets b LEFT JOIN server_seeds s ON s.id = b.seed_id
     WHERE b.id = $1`,
    [betId],
  );
  const r = rows[0];
  if (!r) return null;

  const entries = await client.query<{ id: bigint; kind: string }>(
    `SELECT id, kind FROM journal_entries
     WHERE ref_type = 'round' AND ref_id = $1 AND kind IN ('bet_lock', 'bet_settle')
     ORDER BY id`,
    [r.round_id],
  );

  return {
    bet: {
      id: r.id,
      roundId: r.round_id,
      userId: r.user_id,
      amountMinor: r.amount_minor,
      targetUnder: r.target_under,
      clientSeed: r.client_seed,
    },
    roll: r.roll ?? '0.00',
    won: r.won ?? false,
    payoutMinor: r.payout_minor ?? 0n,
    entryIds: [entries.rows[0]?.id ?? 0n, entries.rows[1]?.id ?? 0n],
    seedHash: r.seed_hash ?? '',
    nonce: r.nonce ?? 0n,
  };
};

/**
 * One bet, one transaction, one round driven end to end.
 *
 * Nothing here survives partially. A failure at any point takes the round, the
 * bet row, the nonce increment, the journal entries and the postings with it,
 * which is why the nonce a failed bet would have used is still available to the
 * next one.
 */
export const placeBet = async (input: PlaceBetInput): Promise<PlacedBet> =>
  withTx(async (client) => {
    const { betId, userId, amountMinor, targetUnderHundredths, clientSeed } = input;

    // Serialise same-id attempts before anything is read or written. Two
    // concurrent deliveries of one bet id would otherwise both find no row and
    // both proceed; the primary key would stop the second from persisting, but
    // only after it had consumed a nonce and moved money.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [betId]);

    const existing = await loadBet(client, betId);
    if (existing) {
      throw new RefusalError('DUPLICATE_BET', `Bet ${betId} already exists`, {
        idempotent: true,
        bet: {
          id: existing.bet.id,
          roundId: existing.bet.roundId,
          amountMinor: Number(existing.bet.amountMinor),
          targetUnder: Number(existing.bet.targetUnder),
          clientSeed: existing.bet.clientSeed,
        },
        roll: Number(existing.roll),
        won: existing.won,
        payoutMinor: Number(existing.payoutMinor),
        entryIds: existing.entryIds.map(Number),
        seedHash: existing.seedHash,
        nonce: Number(existing.nonce),
      });
    }

    const targetUnder = formatHundredths(targetUnderHundredths);

    const roundId = await createRound(client, userId);

    await client.query(
      `INSERT INTO bets (id, round_id, user_id, amount_minor, target_under, client_seed)
       VALUES ($1, $2, $3, $4, $5::NUMERIC, $6)`,
      [betId, roundId, userId, amountMinor.toString(), targetUnder, clientSeed],
    );

    const seed = await allocateNonce(client);

    // open -> locked, and the stake moves into escrow. INSUFFICIENT_FUNDS is
    // raised by postEntry here, before anything else happens.
    await lockRound(client, roundId);
    const lock = await postEntry(client, {
      kind: 'bet_lock',
      refType: 'round',
      refId: roundId,
      postings: [
        { account: userId, amountMinor: -amountMinor },
        { account: ESCROW, amountMinor },
      ],
    });

    const outcome = computeOutcome(seed.seed, clientSeed, seed.nonce);
    const won = isWin(outcome.rollHundredths, targetUnderHundredths);
    const payoutMinor = won ? payoutFor(amountMinor, targetUnderHundredths) : 0n;
    const roll = formatHundredths(outcome.rollHundredths);

    await client.query(
      `UPDATE bets SET seed_id = $1, nonce = $2, roll = $3::NUMERIC, won = $4, payout_minor = $5
       WHERE id = $6`,
      [seed.id.toString(), seed.nonce.toString(), roll, won, payoutMinor.toString(), betId],
    );

    // locked -> resolved. No money moves when an outcome is computed, so the
    // marker carries no postings.
    await resolveRound(client, roundId);
    await recordRoundResolved(client, roundId);

    // resolved -> settled. On a win the treasury funds the difference between
    // the stake already in escrow and the payout; on a loss it receives the
    // stake. Zero-value legs are dropped, because a posting of 0 is not a
    // movement and the schema rejects one.
    const settlePostings = won
      ? [
          { account: ESCROW, amountMinor: -amountMinor },
          { account: TREASURY, amountMinor: -(payoutMinor - amountMinor) },
          { account: userId, amountMinor: payoutMinor },
        ].filter((p) => p.amountMinor !== 0n)
      : [
          { account: ESCROW, amountMinor: -amountMinor },
          { account: TREASURY, amountMinor },
        ];

    const settle = await postEntry(client, {
      kind: 'bet_settle',
      refType: 'round',
      refId: roundId,
      postings: settlePostings,
    });

    await settleRound(client, roundId);

    return {
      bet: { id: betId, roundId, userId, amountMinor, targetUnder, clientSeed },
      roll,
      won,
      payoutMinor,
      entryIds: [lock.entryId, settle.entryId],
      seedHash: seed.seedHash,
      nonce: seed.nonce,
    };
  });

/** Persisted bets, newest first. Never exposes a server seed's plaintext. */
export const listBets = async (limit: number): Promise<BetRow[]> => {
  const { rows } = await getPool().query<{
    id: string;
    round_id: string;
    user_id: string;
    amount_minor: bigint;
    target_under: string;
    client_seed: string;
    seed_hash: string | null;
    nonce: bigint | null;
    roll: string | null;
    won: boolean | null;
    payout_minor: bigint | null;
    created_at: Date;
  }>(
    `SELECT b.id, b.round_id, b.user_id, b.amount_minor, b.target_under, b.client_seed,
            s.seed_hash, b.nonce, b.roll, b.won, b.payout_minor, b.created_at
     FROM bets b LEFT JOIN server_seeds s ON s.id = b.seed_id
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    roundId: r.round_id,
    userId: r.user_id,
    amountMinor: r.amount_minor,
    targetUnder: r.target_under,
    clientSeed: r.client_seed,
    seedHash: r.seed_hash,
    nonce: r.nonce,
    roll: r.roll,
    won: r.won,
    payoutMinor: r.payout_minor,
    createdAt: r.created_at.toISOString(),
  }));
};
