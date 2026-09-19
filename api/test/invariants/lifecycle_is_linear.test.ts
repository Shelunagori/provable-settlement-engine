import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool, withTx } from '../../src/db.js';
import vectors from '../../../fixtures/fairness-vectors.json';
import { createRound, settleRound } from '../../src/engine/round.js';
import { placeBet } from '../../src/engine/bet.js';
import { parseHundredths } from '../../src/fairness/outcome.js';
import { ensureMigrated, fundUser, resetLedger, useFixtureSeed } from '../helpers.js';

const V = vectors.vectors[0]!;

/**
 * INVARIANT: a round only ever moves open -> locked -> resolved -> settled, one
 * step at a time, and every step it took is recorded rather than inferred.
 *
 * The rule is stated twice on purpose. The service asserts the current status
 * under a row lock so a caller gets a clean refusal, and the database trigger
 * makes the illegal state unreachable even for a hand-written UPDATE. The
 * second test here exists to prove the trigger is doing its half: if only the
 * service enforced it, that test would pass its UPDATE.
 */
describe('lifecycle_is_linear', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await closePool();
  });

  it('refuses a transition from the wrong state and leaves the round untouched', async () => {
    const roundId = await withTx((c) => createRound(c, 'user:demo'));

    await expect(withTx((c) => settleRound(c, roundId))).rejects.toMatchObject({
      code: 'ROUND_CLOSED',
      httpStatus: 409,
    });

    const { rows } = await getPool().query<{ status: string }>(
      'SELECT status FROM rounds WHERE id = $1',
      [roundId],
    );
    expect(rows[0]!.status).toBe('open');
  });

  it('the database refuses a skipped transition even when the service is bypassed', async () => {
    const roundId = await withTx((c) => createRound(c, 'user:demo'));

    await expect(
      getPool().query("UPDATE rounds SET status = 'resolved' WHERE status = 'open' AND id = $1", [
        roundId,
      ]),
    ).rejects.toThrow(/ROUND_ILLEGAL_TRANSITION/);

    const { rows } = await getPool().query<{ status: string }>(
      'SELECT status FROM rounds WHERE id = $1',
      [roundId],
    );
    expect(rows[0]!.status).toBe('open');
  });

  it('records every step of a completed round, in order', async () => {
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 5000n);

    const placed = await placeBet({
      betId: 'bet_lifecycle_1',
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: parseHundredths('60.00'),
      clientSeed: V.clientSeed,
    });

    const roundId = placed.bet.roundId;

    const round = await getPool().query<{ status: string }>(
      'SELECT status FROM rounds WHERE id = $1',
      [roundId],
    );
    expect(round.rows[0]!.status).toBe('settled');

    // The journal is the history. Ordered by id, because every one of these
    // entries is written inside a single transaction and now() can return the
    // same timestamp for all of them.
    const events = await getPool().query<{ id: bigint; kind: string }>(
      `SELECT id, kind FROM journal_entries
       WHERE ref_type = 'round' AND ref_id = $1
       ORDER BY id`,
      [roundId],
    );
    expect(events.rows.map((r) => r.kind)).toEqual(['bet_lock', 'round_resolved', 'bet_settle']);

    // The money-moving entries balance; the lifecycle marker moves nothing.
    const perEntry = await getPool().query<{ entry_id: bigint; postings: bigint; total: bigint }>(
      `SELECT e.id AS entry_id,
              COUNT(p.id)::BIGINT AS postings,
              COALESCE(SUM(p.amount_minor), 0)::BIGINT AS total
       FROM journal_entries e LEFT JOIN postings p ON p.entry_id = e.id
       WHERE e.ref_type = 'round' AND e.ref_id = $1
       GROUP BY e.id ORDER BY e.id`,
      [roundId],
    );
    expect(perEntry.rows.map((r) => Number(r.postings))).toEqual([2, 0, 3]);
    expect(perEntry.rows.every((r) => r.total === 0n)).toBe(true);

    // Only the two money entries are reported to the caller.
    expect(placed.entryIds).toEqual([events.rows[0]!.id, events.rows[2]!.id]);

    const ledger = await getPool().query<{ total: bigint }>(
      'SELECT COALESCE(SUM(amount_minor), 0)::BIGINT AS total FROM postings',
    );
    expect(ledger.rows[0]!.total).toBe(0n);
  });
});
