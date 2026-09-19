import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool } from '../db.js';
import { jsonSafe } from '../json.js';
import { ingestPaymentEvent } from '../payments/webhook.js';

const paymentEventSchema = z.object({
  event_id: z.string().min(1).max(200),
  provider: z.string().min(1).max(64),
  type: z.literal('deposit.succeeded'),
  user_id: z.string().min(1).max(200),
  // Money arrives as a JSON number and becomes bigint immediately below.
  // The safe-integer bound is what makes that conversion lossless.
  amount_minor: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
});

const STORM_MAX = 100;

const stormSchema = z.object({
  count: z.number().int().min(1).max(STORM_MAX).default(20),
  event_id: z.string().min(1).max(200).default('storm_demo'),
  user_id: z.string().min(1).max(200).default('user:demo'),
  amount_minor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1000),
});

/**
 * Counts deliveries that actually arrived over the wire at /webhooks/payment.
 *
 * The storm endpoint reports the delta across its own run, which is what makes
 * "these were real HTTP requests" a checkable claim rather than a comment. A
 * version that called the handler in-process would report zero.
 */
let httpDeliveryCount = 0;

const invalidPayload = (message: string) => ({
  refused: true,
  code: 'INVALID_PAYLOAD',
  message,
});

/** The target of a deposit has to be a real account of kind 'user'. */
const userAccountExists = async (userId: string): Promise<boolean> => {
  const { rows } = await getPool().query<{ n: bigint }>(
    "SELECT COUNT(*)::BIGINT AS n FROM accounts WHERE id = $1 AND kind = 'user'",
    [userId],
  );
  return rows[0]!.n === 1n;
};

export const registerPaymentRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/webhooks/payment', async (req, reply) => {
    httpDeliveryCount += 1;
    const parsed = paymentEventSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .status(422)
        .send(invalidPayload(`${first?.path.join('.') ?? 'body'}: ${first?.message ?? 'invalid'}`));
    }
    const p = parsed.data;

    if (!(await userAccountExists(p.user_id))) {
      return reply.status(422).send(invalidPayload(`Unknown user account ${p.user_id}`));
    }

    const result = await ingestPaymentEvent({
      eventId: p.event_id,
      provider: p.provider,
      type: p.type,
      userId: p.user_id,
      amountMinor: BigInt(p.amount_minor),
    });

    return reply.status(200).send(jsonSafe(result));
  });

  /**
   * Delivers the same payment event `count` times, concurrently, over real
   * HTTP to this server's own listening port.
   *
   * It goes back out through the network on purpose. Calling the handler
   * function in a loop would prove only that the function is deterministic;
   * what is worth demonstrating is that N simultaneous connections, N pooled
   * database sessions and N transactions contending on one unique index still
   * produce one journal entry.
   *
   * Bounded at 100 so a demo endpoint cannot be turned into an unbounded
   * self-request amplifier.
   */
  app.post('/demo/webhook-storm', async (req, reply) => {
    const parsed = stormSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .status(422)
        .send(invalidPayload(`${first?.path.join('.') ?? 'body'}: ${first?.message ?? 'invalid'}`));
    }
    const { count, event_id, user_id, amount_minor } = parsed.data;

    const address = app.server.address();
    if (!address || typeof address === 'string') {
      return reply
        .status(503)
        .send(invalidPayload('Server address unavailable; cannot address itself'));
    }
    const selfUrl = `http://127.0.0.1:${address.port}/webhooks/payment`;

    const body = JSON.stringify({
      event_id,
      provider: 'demo',
      type: 'deposit.succeeded',
      user_id,
      amount_minor,
    });

    type Delivery = { ok: boolean; body: Record<string, unknown> };

    const deliveriesBefore = httpDeliveryCount;

    const settled: Delivery[] = await Promise.all(
      Array.from(
        { length: count },
        (): Promise<Delivery> =>
          fetch(selfUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
            .then(async (r) => ({ ok: r.ok, body: (await r.json()) as Record<string, unknown> }))
            .catch((err: Error) => ({ ok: false, body: { error: err.message } })),
      ),
    );

    const posted = settled.filter((r) => r.body.posted === true).length;
    const deduplicated = settled.filter((r) => r.body.deduplicated === true).length;
    const failed = settled.filter((r) => !r.ok).length;
    const entryIds = [
      ...new Set(settled.map((r) => r.body.entryId).filter((v) => v !== undefined)),
    ];

    return reply.status(200).send({
      sent: count,
      posted,
      deduplicated,
      failed,
      httpDeliveries: httpDeliveryCount - deliveriesBefore,
      entryId: entryIds.length === 1 ? entryIds[0] : null,
      distinctEntryIds: entryIds.length,
      eventId: event_id,
    });
  });
};
