import { createHmac } from 'node:crypto';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db.js';
import { placeBet } from '../../src/engine/bet.js';
import { ensureActiveSeed, rotateSeed } from '../../src/fairness/seeds.js';
import { ingestPaymentEvent } from '../../src/payments/webhook.js';
import { isRefusal } from '../../src/refusals.js';
import { ensureMigrated, resetLedger, warmPool } from '../helpers.js';

/**
 * A random sequence of real operations against real Postgres, with the system's
 * invariants re-checked after every single one.
 *
 * Two things make this worth more than the example-based tests. It reaches
 * orderings nobody thought to write down -- rotate before any bet, three
 * rotations in a row, a duplicate webhook landing between a lock and a settle.
 * And it checks settled outcomes against an oracle implemented here, from the
 * specification, rather than against the production functions.
 *
 * That second point is the whole design. Importing computeOutcome() or
 * payoutFor() would make the property tautological: a mutation to the
 * implementation would move the expected answer with it and the test would stay
 * green while the system broke.
 */

// ---------------------------------------------------------------------------
// Independent oracle. Written from the specification, sharing no code with the
// implementation it judges.
// ---------------------------------------------------------------------------

const oracleRollHundredths = (serverSeed: string, clientSeed: string, nonce: bigint): number => {
  const digest = createHmac('sha256', Buffer.from(serverSeed, 'utf8'))
    .update(Buffer.from(`${clientSeed}:${nonce}`, 'utf8'))
    .digest('hex');
  return Number.parseInt(digest.slice(0, 8), 16) % 10000;
};

const oracleWon = (rollHundredths: number, targetHundredths: number): boolean =>
  rollHundredths < targetHundredths;

const oraclePayout = (amountMinor: bigint, targetHundredths: number, won: boolean): bigint =>
  won ? (amountMinor * 9900n) / BigInt(targetHundredths) : 0n;

/** "59.63" -> 5963, without touching a float. */
const toHundredths = (numeric: string): number => {
  const m = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(numeric.trim());
  if (!m) throw new Error(`Unexpected NUMERIC value: ${numeric}`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
};

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

type RandomOperation =
  | { kind: 'deposit'; slot: number }
  | { kind: 'bet'; amountMinor: number; targetHundredths: number; clientSeedPart: number }
  | { kind: 'rotate' }
  | { kind: 'duplicateWebhook'; slot: number };

const operationArb: fc.Arbitrary<RandomOperation> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('deposit' as const), slot: fc.integer({ min: 0, max: 40 }) }) },
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('bet' as const),
      // Structurally valid stakes and targets: the point is to exercise the
      // engine, not to spend the run re-testing input validation.
      amountMinor: fc.integer({ min: 100, max: 50_000 }),
      targetHundredths: fc.integer({ min: 100, max: 9800 }),
      clientSeedPart: fc.integer({ min: 0, max: 9999 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('rotate' as const) }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('duplicateWebhook' as const),
      slot: fc.integer({ min: 0, max: 40 }),
    }),
  },
);

/**
 * One slot always means one payload, so an idempotency key can never refer to
 * two different amounts. The amount is spread across a useful range rather than
 * being the slot number itself: deposits of a few minor units would never fund
 * a bet, and the sequence would degenerate into 500 INSUFFICIENT_FUNDS.
 */
const eventIdFor = (slot: number) => `property_event_${slot}`;
const eventAmountFor = (slot: number) => BigInt(1_000 + ((slot * 997) % 49_000));

const USER = 'user:demo';

const depositEvent = (slot: number) => ({
  eventId: eventIdFor(slot),
  provider: 'demo',
  type: 'deposit.succeeded' as const,
  userId: USER,
  amountMinor: eventAmountFor(slot),
});

/** Refusals are decisions the system is entitled to make; anything else is a bug. */
const EXPECTED_REFUSALS = new Set([
  'INSUFFICIENT_FUNDS',
  'DAILY_LOSS_LIMIT',
  'BET_BELOW_MIN',
  'BET_ABOVE_MAX',
  'INVALID_TARGET',
  'DUPLICATE_BET',
]);

type Stats = { settled: number; refused: Record<string, number>; deposits: number; rotations: number };

describe('random operation sequences', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  afterAll(async () => {
    await closePool();
  });

  it('holds every invariant after every operation', async () => {
    const stats: Stats = { settled: 0, refused: {}, deposits: 0, rotations: 0 };
    let longestSequence = 0;

    await fc.assert(
      fc.asyncProperty(
        // size 'max' so sequences actually reach toward 500 rather than
        // clustering at the minimum, which is fast-check's default bias.
        fc.array(operationArb, { minLength: 100, maxLength: 500, size: 'max' }),
        async (operations) => {
          longestSequence = Math.max(longestSequence, operations.length);

          // Each property case starts from a clean database. No outer
          // transaction: the code under test needs its own commit boundaries,
          // row locks and deferred constraints to mean anything.
          await resetLedger();
          await ensureActiveSeed();
          await warmPool();

          const knownEvents = new Set<string>();
          const verifiedBets = new Set<string>();

          // Bootstrap funds through the real payment path, not a direct posting.
          await ingestPaymentEvent({
            eventId: 'property_bootstrap',
            provider: 'demo',
            type: 'deposit.succeeded',
            userId: USER,
            amountMinor: 100_000n,
          });
          knownEvents.add('property_bootstrap');
          await checkInvariants(0, 'bootstrap', knownEvents, verifiedBets);

          for (let i = 0; i < operations.length; i += 1) {
            const op = operations[i]!;

            try {
              switch (op.kind) {
                case 'deposit': {
                  await ingestPaymentEvent(depositEvent(op.slot));
                  knownEvents.add(eventIdFor(op.slot));
                  stats.deposits += 1;
                  break;
                }

                case 'duplicateWebhook': {
                  const event = depositEvent(op.slot);
                  const firstTime = !knownEvents.has(event.eventId);
                  // Two identical deliveries at once. The unique key on
                  // webhook_events.event_id is the only thing deciding.
                  const [a, b] = await Promise.all([
                    ingestPaymentEvent(event),
                    ingestPaymentEvent(event),
                  ]);
                  knownEvents.add(event.eventId);

                  const posted = [a, b].filter((r) => r.posted).length;
                  expect(posted, `op ${i} duplicateWebhook posted count`).toBe(firstTime ? 1 : 0);
                  expect(a.entryId, `op ${i} duplicate entry ids agree`).toBe(b.entryId);
                  break;
                }

                case 'bet': {
                  await placeBet({
                    betId: `property_bet_${i}_${op.clientSeedPart}`,
                    userId: USER,
                    amountMinor: BigInt(op.amountMinor),
                    targetUnderHundredths: op.targetHundredths,
                    clientSeed: `property_seed_${op.clientSeedPart}`,
                  });
                  stats.settled += 1;
                  break;
                }

                case 'rotate': {
                  await rotateSeed();
                  stats.rotations += 1;
                  break;
                }
              }
            } catch (err) {
              if (isRefusal(err) && EXPECTED_REFUSALS.has(err.code)) {
                stats.refused[err.code] = (stats.refused[err.code] ?? 0) + 1;
              } else {
                throw new Error(
                  `op ${i} (${op.kind}) failed unexpectedly: ${(err as Error).message}`,
                );
              }
            }

            await checkInvariants(i, op.kind, knownEvents, verifiedBets);
          }

          // One final full pass, including every settled bet again.
          await checkInvariants(operations.length, 'final', knownEvents, new Set());
          return true;
        },
      ),
      { numRuns: 5 },
    );

    // Printed once, not per operation, so CI output stays readable.
    console.log(
      `[property] longest sequence ${longestSequence} ops · ${stats.settled} bets settled · ` +
        `${stats.deposits} deposits · ${stats.rotations} rotations · refusals ` +
        JSON.stringify(stats.refused),
    );
    expect(stats.settled).toBeGreaterThan(0);
  }, 600_000);
});

// ---------------------------------------------------------------------------
// Invariants, re-checked after every operation
// ---------------------------------------------------------------------------

const checkInvariants = async (
  index: number,
  kind: string,
  knownEvents: Set<string>,
  verifiedBets: Set<string>,
): Promise<void> => {
  const where = `after op ${index} (${kind})`;
  const pool = getPool();

  // One round trip for the structural invariants. Checking each with its own
  // query turned the property run into a query-latency benchmark.
  const { rows } = await pool.query<{
    ledger_sum: bigint;
    unbalanced_entries: bigint;
    negative_users: bigint;
    active_seeds: bigint;
    active_nonce: bigint;
    dup_seed_nonce: bigint;
    bad_webhook_events: bigint;
    unlinked_events: bigint;
  }>(
    `SELECT
       (SELECT COALESCE(SUM(amount_minor), 0) FROM postings)::BIGINT AS ledger_sum,
       (SELECT COUNT(*) FROM (
          SELECT entry_id FROM postings GROUP BY entry_id HAVING SUM(amount_minor) <> 0
        ) u)::BIGINT AS unbalanced_entries,
       (SELECT COUNT(*) FROM account_balances
         WHERE kind = 'user' AND balance_minor < 0)::BIGINT AS negative_users,
       (SELECT COUNT(*) FROM server_seeds WHERE status = 'active')::BIGINT AS active_seeds,
       (SELECT COALESCE(MAX(nonce), 0) FROM server_seeds WHERE status = 'active')::BIGINT AS active_nonce,
       (SELECT COUNT(*) FROM (
          SELECT seed_id, nonce FROM bets WHERE seed_id IS NOT NULL
          GROUP BY seed_id, nonce HAVING COUNT(*) > 1
        ) d)::BIGINT AS dup_seed_nonce,
       (SELECT COUNT(*) FROM (
          SELECT e.id, COUNT(p.id) AS postings
          FROM journal_entries e LEFT JOIN postings p ON p.entry_id = e.id
          WHERE e.kind = 'deposit' AND e.ref_type = 'webhook_event'
          GROUP BY e.id HAVING COUNT(p.id) <> 2
        ) w)::BIGINT AS bad_webhook_events,
       (SELECT COUNT(*) FROM webhook_events WHERE entry_id IS NULL)::BIGINT AS unlinked_events`,
  );
  const r = rows[0]!;

  expect(r.ledger_sum, `${where}: Σ postings`).toBe(0n);
  expect(r.unbalanced_entries, `${where}: entries not summing to zero`).toBe(0n);
  expect(r.negative_users, `${where}: user accounts below zero`).toBe(0n);
  expect(r.active_seeds, `${where}: active seeds`).toBe(1n);
  expect(r.active_nonce >= 0n, `${where}: active nonce non-negative`).toBe(true);
  expect(r.dup_seed_nonce, `${where}: duplicate (seed_id, nonce)`).toBe(0n);
  expect(r.bad_webhook_events, `${where}: deposit entries without exactly two postings`).toBe(0n);
  expect(r.unlinked_events, `${where}: reserved events with no ledger entry`).toBe(0n);

  // Exactly one deposit entry per known event id, however many deliveries arrived.
  if (knownEvents.size > 0) {
    const perEvent = await pool.query<{ ref_id: string; entries: bigint; events: bigint }>(
      `SELECT e.ref_id,
              COUNT(DISTINCT e.id)::BIGINT AS entries,
              (SELECT COUNT(*) FROM webhook_events w WHERE w.event_id = e.ref_id)::BIGINT AS events
       FROM journal_entries e
       WHERE e.kind = 'deposit' AND e.ref_type = 'webhook_event' AND e.ref_id = ANY($1::text[])
       GROUP BY e.ref_id`,
      [[...knownEvents]],
    );
    for (const row of perEvent.rows) {
      expect(row.entries, `${where}: deposit entries for ${row.ref_id}`).toBe(1n);
      expect(row.events, `${where}: webhook_events rows for ${row.ref_id}`).toBe(1n);
    }
  }

  // Settled bets, judged by the oracle above. Each bet is verified once; the
  // final pass re-verifies all of them with a cleared set.
  const settled = await pool.query<{
    id: string;
    amount_minor: bigint;
    target_under: string;
    client_seed: string;
    nonce: bigint;
    roll: string;
    won: boolean;
    payout_minor: bigint;
    seed: string;
  }>(
    `SELECT b.id, b.amount_minor, b.target_under, b.client_seed, b.nonce,
            b.roll, b.won, b.payout_minor, s.seed
     FROM bets b
     JOIN rounds r ON r.id = b.round_id
     JOIN server_seeds s ON s.id = b.seed_id
     WHERE r.status = 'settled'`,
  );

  for (const bet of settled.rows) {
    if (verifiedBets.has(bet.id)) continue;
    verifiedBets.add(bet.id);

    expect(bet.roll, `${where}: settled bet ${bet.id} has a roll`).not.toBeNull();
    expect(bet.won, `${where}: settled bet ${bet.id} has an outcome`).not.toBeNull();
    expect(bet.payout_minor, `${where}: settled bet ${bet.id} has a payout`).not.toBeNull();

    const targetHundredths = toHundredths(bet.target_under);
    const expectedRoll = oracleRollHundredths(bet.seed, bet.client_seed, bet.nonce);
    const expectedWon = oracleWon(expectedRoll, targetHundredths);
    const expectedPayout = oraclePayout(bet.amount_minor, targetHundredths, expectedWon);

    expect(toHundredths(bet.roll), `${where}: roll for ${bet.id}`).toBe(expectedRoll);
    expect(bet.won, `${where}: won for ${bet.id} (roll ${expectedRoll} vs target ${targetHundredths})`).toBe(
      expectedWon,
    );
    expect(bet.payout_minor, `${where}: payout for ${bet.id}`).toBe(expectedPayout);
  }
};
