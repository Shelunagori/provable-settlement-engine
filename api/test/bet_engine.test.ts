import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool, withTx } from '../src/db.js';
import vectors from '../../fixtures/fairness-vectors.json';
import { payoutFor, placeBet } from '../src/engine/bet.js';
import { parseHundredths } from '../src/fairness/outcome.js';
import { getBalance } from '../src/ledger/balance.js';
import { postEntry } from '../src/ledger/post.js';
import {
  activeSeedNonce,
  ensureMigrated,
  fundUser,
  resetLedger,
  useFixtureSeed,
  warmPool,
} from './helpers.js';

const V = vectors.vectors[0]!;

const postingsFor = async (roundId: string, kind: string) => {
  const { rows } = await getPool().query<{ account_id: string; amount_minor: bigint }>(
    `SELECT p.account_id, p.amount_minor
     FROM postings p JOIN journal_entries e ON e.id = p.entry_id
     WHERE e.ref_type = 'round' AND e.ref_id = $1 AND e.kind = $2
     ORDER BY p.id`,
    [roundId, kind],
  );
  return rows.map((r) => [r.account_id, r.amount_minor] as const);
};

const counts = async () => {
  const { rows } = await getPool().query<{
    rounds: bigint;
    bets: bigint;
    entries: bigint;
    postings: bigint;
  }>(
    `SELECT (SELECT COUNT(*) FROM rounds)::BIGINT AS rounds,
            (SELECT COUNT(*) FROM bets)::BIGINT AS bets,
            (SELECT COUNT(*) FROM journal_entries WHERE ref_type = 'round')::BIGINT AS entries,
            (SELECT COUNT(*) FROM postings p JOIN journal_entries e ON e.id = p.entry_id
              WHERE e.ref_type = 'round')::BIGINT AS postings`,
  );
  return rows[0]!;
};

describe('bet engine', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await closePool();
  });

  it('pays the fixed vector exactly, by integer arithmetic', async () => {
    // floor(500 * 9900 / 6000) = 825. Asserted independently of the code.
    expect(payoutFor(500n, 6000)).toBe(825n);

    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 5000n);
    const balanceBefore = await getBalance('user:demo');

    const placed = await placeBet({
      betId: 'bet_fixed_win',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: parseHundredths('60.00'),
      clientSeed: V.clientSeed,
    });

    expect(placed.roll).toBe(V.roll);
    expect(placed.won).toBe(true);
    expect(placed.payoutMinor).toBe(825n);
    expect(placed.nonce).toBe(BigInt(V.nonce));
    expect(placed.seedHash).toBe(V.serverSeedHash);

    expect(await postingsFor(placed.bet.roundId, 'bet_lock')).toEqual([
      ['user:demo', -500n],
      ['pending_bets', 500n],
    ]);
    expect(await postingsFor(placed.bet.roundId, 'bet_settle')).toEqual([
      ['pending_bets', -500n],
      ['treasury', -325n],
      ['user:demo', 825n],
    ]);

    expect(await getBalance('user:demo')).toBe(balanceBefore + 325n);
    expect(await getBalance('pending_bets')).toBe(0n);
    expect(await getBalance('treasury')).toBe(-325n);

    // The seed advanced by exactly one.
    expect(await activeSeedNonce()).toBe(BigInt(V.nonce) + 1n);

    const row = await getPool().query<{
      nonce: bigint;
      roll: string;
      won: boolean;
      payout_minor: bigint;
      seed_id: bigint;
    }>('SELECT nonce, roll, won, payout_minor, seed_id FROM bets WHERE id = $1', ['bet_fixed_win']);
    expect(row.rows[0]!.nonce).toBe(42n);
    expect(row.rows[0]!.roll).toBe('59.63');
    expect(row.rows[0]!.won).toBe(true);
    expect(row.rows[0]!.payout_minor).toBe(825n);
  });

  it('settles the same fixed outcome as a loss when the target is below the roll', async () => {
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 5000n);
    const before = await getBalance('user:demo');

    const placed = await placeBet({
      betId: 'bet_fixed_loss',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: parseHundredths('50.00'),
      clientSeed: V.clientSeed,
    });

    expect(placed.roll).toBe('59.63');
    expect(placed.won).toBe(false);
    expect(placed.payoutMinor).toBe(0n);

    expect(await postingsFor(placed.bet.roundId, 'bet_settle')).toEqual([
      ['pending_bets', -500n],
      ['treasury', 500n],
    ]);
    expect(await getBalance('user:demo')).toBe(before - 500n);
    expect(await getBalance('treasury')).toBe(500n);
  });

  it('does not consume a nonce when the bet fails', async () => {
    await useFixtureSeed(V.serverSeed, 7);
    const before = await counts();
    expect(await activeSeedNonce()).toBe(7n);

    // user:demo has no funds: postEntry refuses inside the bet transaction.
    await expect(
      placeBet({
        betId: 'bet_unfunded',
        userId: 'user:demo',
        amountMinor: 500n,
        targetUnderHundredths: parseHundredths('60.00'),
        clientSeed: 'c',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    // The nonce increment was part of that transaction, so it rolled back too.
    expect(await activeSeedNonce()).toBe(7n);
    expect(await counts()).toEqual(before);

    // The next real bet takes nonce 7, not 8.
    await fundUser('user:demo', 5000n);
    const placed = await placeBet({
      betId: 'bet_after_failure',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: parseHundredths('60.00'),
      clientSeed: 'c',
    });
    expect(placed.nonce).toBe(7n);
    expect(await activeSeedNonce()).toBe(8n);
  });

  it('allocates a distinct nonce to every concurrent bet', async () => {
    const seed = await useFixtureSeed(V.serverSeed, 0);
    await warmPool();

    const users = Array.from({ length: 12 }, (_, i) => `user:c${i}`);
    for (const u of users) await fundUser(u, 5000n);

    const placed = await Promise.all(
      users.map((userId, i) =>
        placeBet({
          betId: `bet_concurrent_${i}`,
          userId,
          amountMinor: 500n,
          targetUnderHundredths: parseHundredths('60.00'),
          clientSeed: `seed-${i}`,
        }),
      ),
    );

    expect(placed).toHaveLength(12);

    const nonces = placed.map((p) => Number(p.nonce)).sort((a, b) => a - b);
    expect(nonces).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(nonces).size).toBe(12);
    expect(await activeSeedNonce()).toBe(12n);

    const stored = await getPool().query<{ total: bigint; distinct: bigint; seeds: bigint }>(
      `SELECT COUNT(*)::BIGINT AS total,
              COUNT(DISTINCT (seed_id, nonce))::BIGINT AS distinct,
              COUNT(DISTINCT seed_id)::BIGINT AS seeds
       FROM bets WHERE id LIKE 'bet_concurrent_%'`,
    );
    expect(stored.rows[0]!.total).toBe(12n);
    expect(stored.rows[0]!.distinct).toBe(12n);
    expect(stored.rows[0]!.seeds).toBe(1n);
    expect(placed.every((p) => p.seedHash === seed.seedHash)).toBe(true);
  });

  it('refuses a duplicate bet id and returns the original outcome unchanged', async () => {
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 5000n);

    const first = await placeBet({
      betId: 'bet_dup',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: parseHundredths('60.00'),
      clientSeed: V.clientSeed,
    });
    const after = await counts();
    const nonceAfter = await activeSeedNonce();

    let refusal: { code: string; httpStatus: number; details: Record<string, unknown> } | null =
      null;
    try {
      await placeBet({
        betId: 'bet_dup',
        userId: 'user:demo',
        amountMinor: 500n,
        targetUnderHundredths: parseHundredths('60.00'),
        clientSeed: V.clientSeed,
      });
    } catch (err) {
      refusal = err as never;
    }

    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe('DUPLICATE_BET');
    expect(refusal!.httpStatus).toBe(409);
    expect(refusal!.details).toMatchObject({
      idempotent: true,
      roll: Number(first.roll),
      won: first.won,
      payoutMinor: Number(first.payoutMinor),
      nonce: Number(first.nonce),
    });
    expect((refusal!.details.bet as { roundId: string }).roundId).toBe(first.bet.roundId);

    // Nothing extra happened: no round, no nonce, no entries, no postings.
    expect(await counts()).toEqual(after);
    expect(await activeSeedNonce()).toBe(nonceAfter);
  });

  it('serialises two concurrent attempts at the same bet id', async () => {
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 5000n);
    await warmPool();

    const attempt = () =>
      placeBet({
        betId: 'bet_dup_concurrent',
        userId: 'user:demo',
        amountMinor: 500n,
        targetUnderHundredths: parseHundredths('60.00'),
        clientSeed: V.clientSeed,
      })
        .then((r) => ({ ok: true as const, r }))
        .catch((e: { code?: string; details?: Record<string, unknown> }) => ({
          ok: false as const,
          e,
        }));

    const [a, b] = await Promise.all([attempt(), attempt()]);
    const results = [a, b];

    const succeeded = results.filter((x) => x.ok);
    const refused = results.filter((x) => !x.ok);
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as { e: { code?: string } }).e.code).toBe('DUPLICATE_BET');

    const winner = (succeeded[0] as { r: { bet: { roundId: string }; nonce: bigint } }).r;
    const dupDetails = (refused[0] as { e: { details: Record<string, unknown> } }).e.details;
    expect((dupDetails.bet as { roundId: string }).roundId).toBe(winner.bet.roundId);

    // Exactly one of everything.
    const c = await counts();
    expect(c.rounds).toBe(1n);
    expect(c.bets).toBe(1n);
    expect(c.entries).toBe(3n); // bet_lock, round_resolved, bet_settle
    expect(await activeSeedNonce()).toBe(BigInt(V.nonce) + 1n);
  });

  it('rolls the whole attempt back when a later step fails', async () => {
    await useFixtureSeed(V.serverSeed, 3);
    await fundUser('user:demo', 5000n);
    const before = await counts();

    // A legitimate failure late in the transaction: the settle posting cannot
    // complete because the escrow account is debited beyond what this round put
    // there. Reaching it means the round, the bet, the nonce and the lock entry
    // all already exist inside this transaction.
    await expect(
      withTx(async (c) => {
        const { createRound, lockRound } = await import('../src/engine/round.js');
        const roundId = await createRound(c, 'user:demo');
        await c.query('UPDATE server_seeds SET nonce = nonce + 1 WHERE status = $1', ['active']);
        await lockRound(c, roundId);
        await postEntry(c, {
          kind: 'bet_lock',
          refType: 'round',
          refId: roundId,
          postings: [
            { account: 'user:demo', amountMinor: -500n },
            { account: 'pending_bets', amountMinor: 500n },
          ],
        });
        // Unbalanced on purpose: rejected by the deferred trigger at COMMIT.
        await postEntry(c, {
          kind: 'bet_settle',
          refType: 'round',
          refId: roundId,
          postings: [{ account: 'pending_bets', amountMinor: -500n }],
        });
      }),
    ).rejects.toThrow(/LEDGER_UNBALANCED/);

    expect(await counts()).toEqual(before);
    expect(await activeSeedNonce()).toBe(3n);
  });
});
