import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closePool, getPool } from '../src/db.js';
import { getBalance } from '../src/ledger/balance.js';
import { buildServer } from '../src/server.js';
import { ensureMigrated, resetLedger, warmPool } from './helpers.js';

/**
 * The storm endpoint exists so the idempotency guarantee can be triggered from
 * the console in one click. It fires real concurrent HTTP requests at this
 * server's own listening port -- not in-process handler calls -- so what it
 * demonstrates is the same path a payment provider's retries would take.
 */
describe('POST /demo/webhook-storm', () => {
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
    await warmPool();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  const storm = async (body: Record<string, unknown>) => {
    const res = await fetch(`${baseUrl}/demo/webhook-storm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  it('fires 20 concurrent deliveries and posts exactly one of them', async () => {
    const eventId = 'storm_20';
    const { status, body } = await storm({
      count: 20,
      event_id: eventId,
      user_id: 'user:demo',
      amount_minor: 1000,
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ sent: 20, posted: 1, deduplicated: 19 });

    // Every one of those deliveries arrived over the wire. An implementation
    // that called the handler in-process would report 0 here and still get the
    // counts above right, so this is the assertion that holds it to real HTTP.
    expect(body.httpDeliveries).toBe(20);

    const db = await getPool().query<{
      events: bigint;
      entries: bigint;
      postings: bigint;
      posting_sum: bigint;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM webhook_events WHERE event_id = $1)::BIGINT AS events,
         (SELECT COUNT(*) FROM journal_entries
           WHERE ref_type = 'webhook_event' AND ref_id = $1)::BIGINT AS entries,
         (SELECT COUNT(*) FROM postings p JOIN journal_entries e ON e.id = p.entry_id
           WHERE e.ref_type = 'webhook_event' AND e.ref_id = $1)::BIGINT AS postings,
         (SELECT COALESCE(SUM(p.amount_minor), 0) FROM postings p
            JOIN journal_entries e ON e.id = p.entry_id
           WHERE e.ref_type = 'webhook_event' AND e.ref_id = $1)::BIGINT AS posting_sum`,
      [eventId],
    );

    expect(db.rows[0]).toEqual({
      events: 1n,
      entries: 1n,
      postings: 2n,
      posting_sum: 0n,
    });
    expect(await getBalance('user:demo')).toBe(1000n);
  });

  it('defaults to 20 and refuses a count beyond the upper bound', async () => {
    const defaulted = await storm({ event_id: 'storm_default' });
    expect(defaulted.body).toMatchObject({ sent: 20, posted: 1, deduplicated: 19 });

    const tooMany = await storm({ event_id: 'storm_huge', count: 101 });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body).toMatchObject({ refused: true, code: 'INVALID_PAYLOAD' });

    // The refused storm sent nothing.
    const events = await getPool().query<{ n: bigint }>(
      "SELECT COUNT(*)::BIGINT AS n FROM webhook_events WHERE event_id = 'storm_huge'",
    );
    expect(events.rows[0]!.n).toBe(0n);
  });
});
