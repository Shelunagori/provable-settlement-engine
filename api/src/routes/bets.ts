import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listBets, placeBet } from '../engine/bet.js';
import { getRoundWithHistory } from '../engine/round.js';
import { parseHundredths } from '../fairness/outcome.js';
import { jsonSafe } from '../json.js';
import { requireSession } from '../auth/session.js';
import { RefusalError } from '../refusals.js';

const TARGET_MIN_HUNDREDTHS = 100; // 1.00
const TARGET_MAX_HUNDREDTHS = 9800; // 98.00

const placeBetSchema = z.object({
  betId: z.string().min(1).max(200),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  // Accepted as a number or a string and re-read as exact text either way:
  // JSON.stringify(60.00) is "60", and a float can never represent 59.63.
  targetUnder: z.union([z.number(), z.string()]).transform((v) => String(v)),
  clientSeed: z.string().min(1).max(256),
  // Optional: the commitment the caller believes is active. Omitting it keeps
  // pre-session callers working unchanged.
  seedHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex characters')
    .optional(),
});

const betsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const invalidPayload = (message: string) => ({
  refused: true,
  code: 'INVALID_PAYLOAD',
  message,
});

export const registerBetRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/bets', { preHandler: requireSession }, async (req, reply) => {
    const parsed = placeBetSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .status(422)
        .send(invalidPayload(`${first?.path.join('.') ?? 'body'}: ${first?.message ?? 'invalid'}`));
    }
    const p = parsed.data;

    let targetUnderHundredths: number;
    try {
      targetUnderHundredths = parseHundredths(p.targetUnder);
    } catch {
      throw new RefusalError(
        'INVALID_TARGET',
        `targetUnder ${p.targetUnder} is not an exact decimal with at most two places`,
        { targetUnder: p.targetUnder },
      );
    }
    if (
      targetUnderHundredths < TARGET_MIN_HUNDREDTHS ||
      targetUnderHundredths > TARGET_MAX_HUNDREDTHS
    ) {
      throw new RefusalError(
        'INVALID_TARGET',
        `targetUnder ${p.targetUnder} is outside 1.00 to 98.00`,
        { targetUnder: p.targetUnder, min: '1.00', max: '98.00' },
      );
    }

    const placed = await placeBet({
      betId: p.betId,
      userId: req.userId!,
      amountMinor: BigInt(p.amountMinor),
      targetUnderHundredths,
      clientSeed: p.clientSeed,
      ...(p.seedHash === undefined ? {} : { seedHash: p.seedHash }),
    });

    return reply.status(200).send(
      jsonSafe({
        bet: {
          id: placed.bet.id,
          roundId: placed.bet.roundId,
          amountMinor: placed.bet.amountMinor,
          targetUnder: Number(placed.bet.targetUnder),
          clientSeed: placed.bet.clientSeed,
        },
        roll: Number(placed.roll),
        won: placed.won,
        payoutMinor: placed.payoutMinor,
        entryIds: placed.entryIds,
        seedHash: placed.seedHash,
        nonce: placed.nonce,
      }),
    );
  });

  app.get('/bets', async (req, reply) => {
    const parsed = betsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(422).send(invalidPayload('limit must be an integer between 1 and 100'));
    }
    const bets = await listBets(parsed.data.limit);
    return reply.status(200).send(
      jsonSafe(
        bets.map((b) => ({
          ...b,
          targetUnder: Number(b.targetUnder),
          roll: b.roll === null ? null : Number(b.roll),
        })),
      ),
    );
  });

  app.get<{ Params: { id: string } }>('/rounds/:id', async (req, reply) => {
    const round = await getRoundWithHistory(req.params.id);
    if (!round) {
      return reply.status(404).send({
        refused: true,
        code: 'NO_SUCH_ROUND',
        message: `No round ${req.params.id}`,
      });
    }
    return reply.status(200).send(round);
  });
};
