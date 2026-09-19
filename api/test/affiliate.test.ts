import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/db.js';
import vectors from '../../fixtures/fairness-vectors.json';
import { affiliateSummary } from '../src/affiliate/commission.js';
import { placeBet } from '../src/engine/bet.js';
import { dailyNetMinor } from '../src/engine/limits.js';
import { parseHundredths } from '../src/fairness/outcome.js';
import { getBalance } from '../src/ledger/balance.js';
import { ensureMigrated, fundUser, resetLedger, useFixtureSeed } from './helpers.js';

const V = vectors.vectors[0]!;
const LOSE = parseHundredths('50.00'); // roll 59.63
const WIN = parseHundredths('60.00');

const entriesFor = async (roundId: string, kind: string) => {
  const { rows } = await getPool().query<{ account_id: string; amount_minor: bigint }>(
    `SELECT p.account_id, p.amount_minor FROM postings p
     JOIN journal_entries e ON e.id = p.entry_id
     WHERE e.ref_type = 'round' AND e.ref_id = $1 AND e.kind = $2 ORDER BY p.id`,
    [roundId, kind],
  );
  return rows.map((r) => [r.account_id, r.amount_minor] as const);
};

describe('affiliate commission', () => {
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

  it('pays 1% of the treasury take when a linked user loses', async () => {
    await fundUser('user:demo', 10_000n);

    const placed = await placeBet({
      betId: 'aff_loss',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: LOSE,
      clientSeed: V.clientSeed,
    });
    expect(placed.won).toBe(false);

    expect(await entriesFor(placed.bet.roundId, 'bet_settle')).toEqual([
      ['pending_bets', -500n],
      ['treasury', 500n],
    ]);
    expect(await entriesFor(placed.bet.roundId, 'commission')).toEqual([
      ['treasury', -5n],
      ['affiliate:alice', 5n],
    ]);

    // Treasury keeps the take minus the commission.
    expect(await getBalance('treasury')).toBe(495n);
    expect(await getBalance('affiliate:alice')).toBe(5n);

    const total = await getPool().query<{ t: bigint }>(
      'SELECT COALESCE(SUM(amount_minor),0)::BIGINT AS t FROM postings',
    );
    expect(total.rows[0]!.t).toBe(0n);

    // The commission is not the user's money and must not touch their daily figure.
    expect(await dailyNetMinor('user:demo')).toBe(-500n);
  });

  it('pays nothing on a win', async () => {
    await fundUser('user:demo', 10_000n);

    const placed = await placeBet({
      betId: 'aff_win',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: WIN,
      clientSeed: V.clientSeed,
    });
    expect(placed.won).toBe(true);

    expect(await entriesFor(placed.bet.roundId, 'commission')).toEqual([]);
    expect(await getBalance('affiliate:alice')).toBe(0n);
  });

  it('pays nothing for a user with no affiliate link', async () => {
    await fundUser('user:unlinked', 10_000n);

    const placed = await placeBet({
      betId: 'aff_unlinked',
      userId: 'user:unlinked',
      amountMinor: 500n,
      targetUnderHundredths: LOSE,
      clientSeed: V.clientSeed,
    });
    expect(placed.won).toBe(false);

    expect(await entriesFor(placed.bet.roundId, 'commission')).toEqual([]);
    expect(await getBalance('affiliate:alice')).toBe(0n);
  });

  it('pays nothing when 1% rounds down to zero', async () => {
    await fundUser('user:demo', 10_000n);

    // A 100 stake yields a take of 100; 1% of that is 1. A 99 stake would be
    // below the minimum, so the smallest reachable take is 100 -- but the guard
    // still has to exist, because a posting of zero is not a movement.
    const placed = await placeBet({
      betId: 'aff_tiny',
      userId: 'user:demo',
      amountMinor: 100n,
      targetUnderHundredths: LOSE,
      clientSeed: V.clientSeed,
    });
    expect(await entriesFor(placed.bet.roundId, 'commission')).toEqual([
      ['treasury', -1n],
      ['affiliate:alice', 1n],
    ]);
  });

  it('derives affiliate earnings from commission postings only', async () => {
    const empty = await affiliateSummary('affiliate:alice');
    expect(empty).toEqual({ earnedMinor: 0n, referred: ['user:demo'] });

    await fundUser('user:demo', 10_000n);
    await placeBet({
      betId: 'aff_sum_1',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: LOSE,
      clientSeed: V.clientSeed,
    });

    const after = await affiliateSummary('affiliate:alice');
    expect(after.earnedMinor).toBe(5n);
    expect(after.referred).toEqual(['user:demo']);
  });
});
