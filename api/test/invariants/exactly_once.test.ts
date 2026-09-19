import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closePool, getPool } from '../../src/db.js';
import { getBalance } from '../../src/ledger/balance.js';
import { ingestPaymentEvent } from '../../src/payments/webhook.js';
import { buildServer } from '../../src/server.js';
import { ensureMigrated, resetLedger, warmPool } from '../helpers.js';

/**
 * INVARIANT: the same payment event, delivered any number of times and in any
 * degree of concurrency, moves money exactly once.
 *
 * The arbiter is the PRIMARY KEY on webhook_events.event_id. Concurrent
 * inserters block on that index until the first transaction resolves; the
 * losers then find the committed row and return its entry id. No application
 * lock, no in-memory set, no read-then-write.
 *
 * The concurrency proof uses a real listening server and real HTTP, not
 * app.inject(): injection runs in-process and would not exercise the
 * connection pool, the transaction boundaries, or the index contention that
 * this invariant is actually about.
 */
describe('exactly_once', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    await ensureMigrated();
    app = await buildServer();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('expected a TCP address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  const deliver = (body: Record<string, unknown>) =>
    fetch(`${baseUrl}/webhooks/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const entriesFor = async (eventId: string) => {
    const { rows } = await getPool().query<{ id: bigint }>(
      `SELECT id FROM journal_entries
       WHERE ref_type = 'webhook_event' AND ref_id = $1
       ORDER BY id`,
      [eventId],
    );
    return rows;
  };

  it('posts exactly one entry for 20 concurrent deliveries of the same event', async () => {
    const eventId = 'evt_concurrent_storm';
    const amountMinor = 1000;
    const body = {
      event_id: eventId,
      provider: 'demo',
      type: 'deposit.succeeded',
      user_id: 'user:demo',
      amount_minor: amountMinor,
    };

    expect(await getBalance('user:demo')).toBe(0n);

    // The connections must already exist, or the burst serialises behind
    // connection setup and nothing contends. See warmPool().
    await warmPool();

    const responses = await Promise.all(Array.from({ length: 20 }, () => deliver(body)));
    const bodies = await Promise.all(responses.map((r) => r.json()));

    // Every delivery got a successful HTTP response.
    expect(responses).toHaveLength(20);
    expect(responses.every((r) => r.status === 200)).toBe(true);

    const posted = bodies.filter((b) => b.posted === true);
    const deduplicated = bodies.filter((b) => b.deduplicated === true);
    expect(posted).toHaveLength(1);
    expect(deduplicated).toHaveLength(19);
    expect(deduplicated.every((b) => b.posted === false)).toBe(true);

    // Winner and losers all name the same entry.
    const entryIds = new Set(bodies.map((b) => b.entryId));
    expect(entryIds.size).toBe(1);
    const entryId = posted[0]!.entryId;
    expect([...entryIds][0]).toBe(entryId);

    // Exactly one reservation row.
    const events = await getPool().query<{ n: bigint }>(
      'SELECT COUNT(*)::BIGINT AS n FROM webhook_events WHERE event_id = $1',
      [eventId],
    );
    expect(events.rows[0]!.n).toBe(1n);

    // Exactly one journal entry carries this event as its reference.
    const entries = await entriesFor(eventId);
    expect(entries).toHaveLength(1);
    expect(Number(entries[0]!.id)).toBe(entryId);

    // ref_id lives on journal_entries, so the postings are reached by join.
    const postings = await getPool().query<{ account_id: string; amount_minor: bigint }>(
      `SELECT p.account_id, p.amount_minor
       FROM postings p
       JOIN journal_entries e ON e.id = p.entry_id
       WHERE e.ref_type = 'webhook_event' AND e.ref_id = $1
       ORDER BY p.id`,
      [eventId],
    );
    expect(postings.rows).toHaveLength(2);
    expect(postings.rows.reduce((acc, r) => acc + r.amount_minor, 0n)).toBe(0n);
    expect(postings.rows.map((r) => r.account_id).sort()).toEqual(['gateway', 'user:demo']);

    // Credited once, not twenty times.
    expect(await getBalance('user:demo')).toBe(BigInt(amountMinor));
    expect(await getBalance('gateway')).toBe(BigInt(-amountMinor));
  });

  it('deduplicates a redelivery that arrives long after the first succeeded', async () => {
    const eventId = 'evt_sequential_repeat';
    const body = {
      event_id: eventId,
      provider: 'demo',
      type: 'deposit.succeeded',
      user_id: 'user:demo',
      amount_minor: 2500,
    };

    const first = await (await deliver(body)).json();
    expect(first).toEqual({ posted: true, entryId: expect.any(Number) });
    expect(await getBalance('user:demo')).toBe(2500n);

    const countsAfterFirst = await getPool().query<{ e: bigint; p: bigint }>(
      `SELECT (SELECT COUNT(*) FROM journal_entries)::BIGINT AS e,
              (SELECT COUNT(*) FROM postings)::BIGINT AS p`,
    );

    const second = await (await deliver(body)).json();
    expect(second).toEqual({
      posted: false,
      deduplicated: true,
      entryId: first.entryId,
    });

    // No second entry, no second pair of postings, no second credit.
    const countsAfterSecond = await getPool().query<{ e: bigint; p: bigint }>(
      `SELECT (SELECT COUNT(*) FROM journal_entries)::BIGINT AS e,
              (SELECT COUNT(*) FROM postings)::BIGINT AS p`,
    );
    expect(countsAfterSecond.rows[0]).toEqual(countsAfterFirst.rows[0]);
    expect(await getBalance('user:demo')).toBe(2500n);
    expect(await entriesFor(eventId)).toHaveLength(1);
  });

  it('does not poison the event id when the ledger posting fails after reservation', async () => {
    // The reservation and the money movement are one transaction. If the
    // posting fails, the reservation must go with it -- otherwise every retry
    // would look like a duplicate of a payment that was never credited.
    const eventId = 'evt_rolls_back_cleanly';
    const event = {
      eventId,
      provider: 'demo',
      type: 'deposit.succeeded' as const,
      userId: 'user:ghost', // no such account: postEntry will throw
      amountMinor: 700n,
    };

    await expect(ingestPaymentEvent(event)).rejects.toThrow(/Unknown account/);

    // Nothing survives the rollback.
    const events = await getPool().query<{ n: bigint }>(
      'SELECT COUNT(*)::BIGINT AS n FROM webhook_events WHERE event_id = $1',
      [eventId],
    );
    expect(events.rows[0]!.n).toBe(0n);
    expect(await entriesFor(eventId)).toHaveLength(0);

    const postings = await getPool().query<{ n: bigint }>(
      `SELECT COUNT(*)::BIGINT AS n
       FROM postings p JOIN journal_entries e ON e.id = p.entry_id
       WHERE e.ref_type = 'webhook_event' AND e.ref_id = $1`,
      [eventId],
    );
    expect(postings.rows[0]!.n).toBe(0n);

    // Correct the cause, retry the same event id: it must post.
    await getPool().query(
      "INSERT INTO accounts (id, kind) VALUES ('user:ghost', 'user') ON CONFLICT DO NOTHING",
    );
    const retry = await ingestPaymentEvent(event);
    expect(retry.posted).toBe(true);
    expect(await getBalance('user:ghost')).toBe(700n);
    expect(await entriesFor(eventId)).toHaveLength(1);
  });
});
