import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { jsonSafe } from '../json.js';
import {
  computeOutcome,
  isWin,
  parseHundredths,
  seedHashOf,
  SERVER_SEED_PATTERN,
} from '../fairness/outcome.js';
import {
  ensureActiveSeed,
  getActiveCommitment,
  isRevealedCommitment,
  listRevealedSeeds,
  rotateSeed,
} from '../fairness/seeds.js';

const TARGET_MIN_HUNDREDTHS = 100; // 1.00
const TARGET_MAX_HUNDREDTHS = 9800; // 98.00

const verifyQuery = z.object({
  serverSeed: z.string().regex(SERVER_SEED_PATTERN, 'must be 64 lowercase hex characters'),
  clientSeed: z.string().min(1).max(256),
  nonce: z
    .string()
    .regex(/^\d+$/, 'must be a non-negative integer')
    .transform((v) => BigInt(v)),
  // Kept as text and parsed to exact hundredths. Zod's number coercion would
  // route the value through a binary float before we ever saw it.
  targetUnder: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'must be a decimal with at most two places'),
});

const invalidPayload = (message: string) => ({
  refused: true,
  code: 'INVALID_PAYLOAD',
  message,
});

export const registerFairnessRoutes = async (app: FastifyInstance): Promise<void> => {
  /** The commitment, published before the seed is used. Never the plaintext. */
  app.get('/fairness/seed', async (_req, reply) => {
    const commitment = (await getActiveCommitment()) ?? (await ensureActiveSeed());
    return reply.status(200).send(jsonSafe(commitment));
  });

  app.post('/fairness/rotate', async (_req, reply) => {
    const result = await rotateSeed();
    return reply.status(200).send(result);
  });

  /** Revealed history, newest revelation first. */
  app.get('/fairness/seeds', async (_req, reply) => {
    const revealed = await listRevealedSeeds();
    return reply.status(200).send(
      revealed.map((r) => ({
        seed: r.seed,
        seedHash: r.seedHash,
        revealedAt: r.revealedAt.toISOString(),
      })),
    );
  });

  /**
   * Recomputes an outcome from caller-supplied data.
   *
   * `matchesHash` answers a narrower question than "is this arithmetic right":
   * it says whether this server seed is one this service committed to and has
   * since revealed. The roll is returned either way, because the computation
   * belongs to whoever holds the inputs -- but the service only vouches for
   * seeds it published a hash for beforehand.
   */
  app.get('/fairness/verify', async (req, reply) => {
    const parsed = verifyQuery.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply
        .status(422)
        .send(invalidPayload(`${first?.path.join('.') ?? 'query'}: ${first?.message ?? 'invalid'}`));
    }

    const { serverSeed, clientSeed, nonce, targetUnder } = parsed.data;

    let targetHundredths: number;
    try {
      targetHundredths = parseHundredths(targetUnder);
    } catch {
      return reply.status(422).send(invalidPayload('targetUnder: not an exact decimal'));
    }
    if (targetHundredths < TARGET_MIN_HUNDREDTHS || targetHundredths > TARGET_MAX_HUNDREDTHS) {
      return reply
        .status(422)
        .send(invalidPayload('targetUnder: must be between 1.00 and 98.00'));
    }

    const outcome = computeOutcome(serverSeed, clientSeed, nonce);
    const matchesHash = await isRevealedCommitment(seedHashOf(serverSeed));

    return reply.status(200).send({
      roll: Number(outcome.roll),
      won: isWin(outcome.rollHundredths, targetHundredths),
      matchesHash,
    });
  });
};
