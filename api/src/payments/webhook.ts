import type { PoolClient } from '../db.js';
import { withTx } from '../db.js';
import { postEntry } from '../ledger/post.js';

export type PaymentEvent = {
  eventId: string;
  provider: string;
  type: 'deposit.succeeded';
  userId: string;
  amountMinor: bigint;
};

export type IngestResult =
  | { posted: true; entryId: bigint }
  | { posted: false; deduplicated: true; entryId: bigint };

/**
 * Reserves the event id, and only the transaction that wins the reservation
 * moves money.
 *
 * The arbiter is the PRIMARY KEY on webhook_events.event_id. `ON CONFLICT DO
 * NOTHING` performs a speculative insertion: when another transaction has
 * already inserted this key but has not yet committed, Postgres makes this
 * statement wait on that transaction rather than guessing. When the other
 * side commits, the conflict resolves and this statement returns no row; when
 * the other side rolls back, this statement inserts and wins instead. Either
 * way the database decides, under a constraint that no future caller can
 * forget to consult.
 *
 * What this is deliberately not: `SELECT` whether the event exists and
 * `INSERT` if it does not. Two deliveries can both read "absent" before either
 * writes, and both then post. The race is small and the consequence is a
 * customer credited twice, which is exactly the kind of bug that only shows up
 * under the load that makes it expensive.
 *
 * There is no application mutex, no in-memory set of seen ids and no external
 * lock. Any of those would be per-process state, and would stop working the
 * moment a second instance of this service started.
 */
export const ingestPaymentEvent = async (event: PaymentEvent): Promise<IngestResult> =>
  withTx(async (client: PoolClient) => {
    const reservation = await client.query<{ event_id: string }>(
      `INSERT INTO webhook_events (event_id, provider, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [
        event.eventId,
        event.provider,
        JSON.stringify({
          event_id: event.eventId,
          provider: event.provider,
          type: event.type,
          user_id: event.userId,
          amount_minor: Number(event.amountMinor),
        }),
      ],
    );

    if (reservation.rowCount === 0) {
      // Lost the reservation. The winning transaction has committed by the
      // time the conflict resolved, so its entry id is readable now.
      const existing = await client.query<{ entry_id: bigint | null }>(
        'SELECT entry_id FROM webhook_events WHERE event_id = $1',
        [event.eventId],
      );
      const entryId = existing.rows[0]?.entry_id ?? null;

      if (entryId === null) {
        // Unreachable while the reservation and the posting stay in one
        // transaction. If it ever fires, the two have been split apart and
        // this event id is poisoned -- every retry would be told "duplicate"
        // for money that was never credited. Fail loudly rather than lie.
        throw new Error(
          `webhook_events row for ${event.eventId} has no entry_id: ` +
            'the reservation and the ledger posting are no longer atomic',
        );
      }

      return { posted: false, deduplicated: true, entryId };
    }

    // Won the reservation. Money moves through the H1 choke point, in this
    // same transaction, so a failure here takes the reservation with it.
    const { entryId } = await postEntry(client, {
      kind: 'deposit',
      refType: 'webhook_event',
      refId: event.eventId,
      postings: [
        { account: 'gateway', amountMinor: -event.amountMinor },
        { account: event.userId, amountMinor: event.amountMinor },
      ],
    });

    await client.query('UPDATE webhook_events SET entry_id = $1 WHERE event_id = $2', [
      entryId.toString(),
      event.eventId,
    ]);

    return { posted: true, entryId };
  });
