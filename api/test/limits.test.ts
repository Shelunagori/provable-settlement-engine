import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/db.js';
import vectors from '../../fixtures/fairness-vectors.json';
import { placeBet } from '../src/engine/bet.js';
import { DAILY_LOSS_LIMIT_MINOR, dailyNetMinor } from '../src/engine/limits.js';
import { parseHundredths } from '../src/fairness/outcome.js';
import {
  activeSeedNonce,
  ensureMigrated,
  fundUser,
  insertSettledLoss,
  resetLedger,
  useFixtureSeed,
  warmPool,
} from './helpers.js';

const V = vectors.vectors[0]!;
const LOSING_TARGET = parseHundredths('50.00'); // roll 59.63 at nonce 42

const counts = async () => {
  const { rows } = await getPool().query<{
    rounds: bigint;
    bets: bigint;
    entries: bigint;
    postings: bigint;
  }>(
    `SELECT (SELECT COUNT(*) FROM rounds)::BIGINT AS rounds,
            (SELECT COUNT(*) FROM bets)::BIGINT AS bets,
            (SELECT COUNT(*) FROM journal_entries WHERE ref_type='round')::BIGINT AS entries,
            (SELECT COUNT(*) FROM postings p JOIN journal_entries e ON e.id=p.entry_id
              WHERE e.ref_type='round')::BIGINT AS postings`,
  );
  return rows[0]!;
};

describe('bet limits', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  beforeEach(async () => {
    await resetLedger();
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
  });

  afterAll(async () => {
    await closePool();
  });

  const bet = (betId: string, amountMinor: bigint, userId = 'user:demo') =>
    placeBet({
      betId,
      userId,
      amountMinor,
      targetUnderHundredths: LOSING_TARGET,
      clientSeed: V.clientSeed,
    });

  it('refuses a stake below the minimum and writes nothing', async () => {
    await fundUser('user:demo', 100_000n);
    const before = await counts();
    const nonceBefore = await activeSeedNonce();

    await expect(bet('bet_min', 99n)).rejects.toMatchObject({
      code: 'BET_BELOW_MIN',
      httpStatus: 422,
      details: { limit: 100 },
    });

    expect(await counts()).toEqual(before);
    expect(await activeSeedNonce()).toBe(nonceBefore);

    // Exactly the minimum is allowed.
    await expect(bet('bet_min_ok', 100n)).resolves.toMatchObject({ won: false });
  });

  it('refuses a stake above the maximum and writes nothing', async () => {
    await fundUser('user:demo', 200_000n);
    const before = await counts();

    await expect(bet('bet_max', 50_001n)).rejects.toMatchObject({
      code: 'BET_ABOVE_MAX',
      httpStatus: 422,
      details: { limit: 50000 },
    });

    expect(await counts()).toEqual(before);
    await expect(bet('bet_max_ok', 50_000n)).resolves.toMatchObject({ won: false });
  });

  it('counts only today, only this user, and only bet postings', async () => {
    await fundUser('user:demo', 100_000n);
    expect(await dailyNetMinor('user:demo')).toBe(0n);

    // A deposit is not a bet: it must not move the daily figure.
    await fundUser('user:demo', 5_000n);
    expect(await dailyNetMinor('user:demo')).toBe(0n);

    await bet('bet_today', 500n);
    expect(await dailyNetMinor('user:demo')).toBe(-500n);

    // Another user's losses are not this user's.
    await fundUser('user:other', 10_000n);
    await bet('bet_other_user', 500n, 'user:other');
    expect(await dailyNetMinor('user:demo')).toBe(-500n);
    expect(await dailyNetMinor('user:other')).toBe(-500n);
  });

  it('excludes a loss dated to a previous UTC day', async () => {
    await fundUser('user:demo', 500_000n);
    await insertSettledLoss('user:demo', 180_000n, 1);

    // Yesterday's 180000 loss is real, but it is not today's.
    expect(await dailyNetMinor('user:demo')).toBe(0n);

    // So a stake that would breach the limit if yesterday counted is allowed.
    await expect(bet('bet_after_rollover', 50_000n)).resolves.toMatchObject({ won: false });
    expect(await dailyNetMinor('user:demo')).toBe(-50_000n);
  });

  it('allows a stake that reaches exactly the limit', async () => {
    await fundUser('user:demo', 1_000_000n);
    // Start the day 150000 down, written as a fixture so no nonce is consumed
    // and the only real bet is the one whose roll the fixture seed fixes.
    await insertSettledLoss('user:demo', 150_000n);
    expect(await dailyNetMinor('user:demo')).toBe(-150_000n);

    // 150000 + 50000 = exactly 200000, which is allowed.
    await expect(bet('bet_at_limit', 50_000n)).resolves.toMatchObject({ won: false });
    expect(await dailyNetMinor('user:demo')).toBe(-200_000n);
    expect(-(await dailyNetMinor('user:demo'))).toBe(DAILY_LOSS_LIMIT_MINOR);
  });

  it('refuses a stake one unit past the limit, and writes nothing', async () => {
    await fundUser('user:edge', 1_000_000n);
    await insertSettledLoss('user:edge', 150_001n);
    expect(await dailyNetMinor('user:edge')).toBe(-150_001n);

    const before = await counts();
    const nonceBefore = await activeSeedNonce();

    // 150001 + 50000 = 200001. One unit too far.
    await expect(bet('bet_past_limit', 50_000n, 'user:edge')).rejects.toMatchObject({
      code: 'DAILY_LOSS_LIMIT',
      httpStatus: 429,
      details: { limit: 200000, netLossToday: 150001, requestedAmount: 50000 },
    });

    expect(await counts()).toEqual(before);
    expect(await activeSeedNonce()).toBe(nonceBefore);
    expect(await dailyNetMinor('user:edge')).toBe(-150_001n);
  });

  it('serialises the limit decision for one user under concurrency', async () => {
    await fundUser('user:demo', 1_000_000n);
    await insertSettledLoss('user:demo', 150_000n);
    expect(await dailyNetMinor('user:demo')).toBe(-150_000n);

    await warmPool();

    // Each of these is individually allowable against a 150000 starting loss.
    // Together they would reach 250000, so one of them must lose the race.
    const results = await Promise.all(
      ['race_a', 'race_b'].map((id) =>
        bet(id, 50_000n)
          .then(() => ({ ok: true as const }))
          .catch((e: { code?: string }) => ({ ok: false as const, code: e.code })),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.filter((r) => !r.ok);
    expect(refused).toHaveLength(1);
    expect((refused[0] as { code?: string }).code).toBe('DAILY_LOSS_LIMIT');

    expect(await dailyNetMinor('user:demo')).toBe(-200_000n);
  });
});
