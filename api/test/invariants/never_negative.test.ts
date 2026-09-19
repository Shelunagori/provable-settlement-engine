import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db.js';
import vectors from '../../../fixtures/fairness-vectors.json';
import { placeBet } from '../../src/engine/bet.js';
import { parseHundredths } from '../../src/fairness/outcome.js';
import { getBalance, listAccountBalances } from '../../src/ledger/balance.js';
import {
  activeSeedNonce,
  ensureMigrated,
  fundUser,
  resetLedger,
  useFixtureSeed,
  warmPool,
} from '../helpers.js';

const V = vectors.vectors[0]!;

/**
 * INVARIANT: a user account cannot go below zero, however many requests arrive
 * at once.
 *
 * The overspend is refused inside the same transaction that would have posted
 * it, under the account's row lock, so there is no window in which fifty
 * requests each see a balance that the other forty-nine are about to spend.
 */
describe('never_negative', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await closePool();
  });

  it('lets exactly one of fifty concurrent overspends through', async () => {
    // Nonce 42 on the fixture seed rolls 59.63, so a target of 50.00 loses.
    // A win would pay the stake back and make later bets legitimately
    // affordable, which would test something else entirely.
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 1000n);
    await warmPool();

    expect(await getBalance('user:demo')).toBe(1000n);

    const attempts = Array.from({ length: 50 }, (_, i) =>
      placeBet({
        betId: `bet_never_negative_${i}`,
        userId: 'user:demo',
        amountMinor: 600n,
        targetUnderHundredths: parseHundredths('50.00'),
        clientSeed: V.clientSeed,
      })
        .then(() => ({ ok: true as const }))
        .catch((e: { code?: string }) => ({ ok: false as const, code: e.code })),
    );

    const results = await Promise.all(attempts);

    expect(results).toHaveLength(50);
    const succeeded = results.filter((r) => r.ok);
    const refused = results.filter((r) => !r.ok);
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(49);
    expect(refused.every((r) => (r as { code?: string }).code === 'INSUFFICIENT_FUNDS')).toBe(true);

    // 1000 staked 600 and lost it.
    expect(await getBalance('user:demo')).toBe(400n);
    expect(await getBalance('user:demo')).toBeGreaterThanOrEqual(0n);

    // The 49 refusals rolled back, so they took no nonces with them.
    expect(await activeSeedNonce()).toBe(BigInt(V.nonce) + 1n);

    const rounds = await getPool().query<{ n: bigint; settled: bigint }>(
      `SELECT COUNT(*)::BIGINT AS n,
              COUNT(*) FILTER (WHERE status = 'settled')::BIGINT AS settled FROM rounds`,
    );
    expect(rounds.rows[0]!.n).toBe(1n);
    expect(rounds.rows[0]!.settled).toBe(1n);

    const bets = await getPool().query<{ n: bigint }>('SELECT COUNT(*)::BIGINT AS n FROM bets');
    expect(bets.rows[0]!.n).toBe(1n);
  });

  it('leaves no user account anywhere below zero', async () => {
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 1000n);
    await fundUser('user:other', 300n);
    await warmPool();

    await Promise.all([
      ...Array.from({ length: 20 }, (_, i) =>
        placeBet({
          betId: `nn_demo_${i}`,
          userId: 'user:demo',
          amountMinor: 600n,
          targetUnderHundredths: parseHundredths('50.00'),
          clientSeed: V.clientSeed,
        }).catch(() => undefined),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        placeBet({
          betId: `nn_other_${i}`,
          userId: 'user:other',
          amountMinor: 600n,
          targetUnderHundredths: parseHundredths('50.00'),
          clientSeed: V.clientSeed,
        }).catch(() => undefined),
      ),
    ]);

    const balances = await listAccountBalances();
    const negativeUsers = balances.filter((b) => b.kind === 'user' && b.balanceMinor < 0n);
    expect(negativeUsers).toEqual([]);

    // user:other could never afford 600 at all.
    expect(await getBalance('user:other')).toBe(300n);
  });
});
