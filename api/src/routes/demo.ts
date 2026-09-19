import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { resetDemoEnvironment } from '../demo/reset.js';
import { jsonSafe } from '../json.js';

export const registerDemoRoutes = async (app: FastifyInstance): Promise<void> => {
  await app.register(async (scope) => {
    /**
     * A reset takes no parameters, so the natural way to call it is a POST with
     * no body at all. Fastify's default JSON parser rejects that outright when
     * the request still carries `Content-Type: application/json`, which is what
     * every fetch wrapper sends -- and the rejection surfaces as a 500 rather
     * than anything a caller could act on.
     *
     * Registered inside this scope so it applies to the demo routes only and
     * changes nothing about how the money-moving endpoints parse their bodies.
     */
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_req, body, done) => {
        const text = String(body ?? '').trim();
        if (text === '') return done(null, {});
        try {
          done(null, JSON.parse(text) as unknown);
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    /**
     * Returns the demo environment to a fresh state.
     *
     * Gated on DEMO_RESET_ENABLED rather than on NODE_ENV, because the public
     * demo runs with NODE_ENV=production and a real deployment of this engine
     * would too. When the flag is off the route answers with the same 404 an
     * unknown path gets: a disabled destructive endpoint should not announce
     * that it exists and is merely switched off.
     *
     * The body is ignored entirely. There is no account id to pass, so there is
     * no way to aim this at anything but the fixed demo dataset.
     */
    scope.post('/demo/reset', async (_req, reply) => {
      if (!config.demoResetEnabled) {
        return reply.status(404).send({
          refused: true,
          code: 'NO_SUCH_ENDPOINT',
          message: 'Not found.',
        });
      }

      const result = await resetDemoEnvironment();
      return reply.status(200).send(
        jsonSafe({
          reset: true,
          commitment: result.commitment,
          clearedTables: result.clearedTables,
        }),
      );
    });
  });
};
