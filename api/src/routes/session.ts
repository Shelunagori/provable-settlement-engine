import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import {
  SESSION_COOKIE,
  createSession,
  requireSession,
  sessionCookieOptions,
} from '../auth/session.js';
import { dailyNetMinor } from '../engine/limits.js';
import { jsonSafe } from '../json.js';
import { getBalance } from '../ledger/balance.js';

const DEMO_USER = 'user:demo';

export const registerSessionRoutes = async (app: FastifyInstance): Promise<void> => {
  /** The deliberate demo login. Public by design; there is one account. */
  app.post('/session', async (_req, reply) => {
    const { token } = await createSession(DEMO_USER);
    return reply
      .setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.isProduction))
      .status(200)
      .send({ userId: DEMO_USER });
  });

  app.get('/me', { preHandler: requireSession }, async (req, reply) => {
    const userId = req.userId!;
    const [balanceMinor, dailyNet] = await Promise.all([
      getBalance(userId),
      dailyNetMinor(userId),
    ]);
    return reply.status(200).send(jsonSafe({ userId, balanceMinor, dailyNetMinor: dailyNet }));
  });
};
