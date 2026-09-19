import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { closePool } from './db.js';
import { ensureActiveSeed } from './fairness/seeds.js';
import { runMigrations } from './migrate.js';
import { isRefusal } from './refusals.js';
import { registerRoutes } from './routes/index.js';

export const buildServer = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: config.isProduction
      ? { level: 'info' }
      : { level: 'info', transport: undefined },
    // Money amounts travel as JSON numbers; they are minor units and stay far
    // below 2^53. bigint still needs an explicit serializer.
    serializerOpts: { rounding: 'trunc' },
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });

  const allowed = new Set(config.webOrigins);
  if (!config.isProduction) allowed.add('http://localhost:5173');

  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin/curl requests arrive with no Origin header.
      if (!origin) return cb(null, true);
      cb(null, allowed.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(cookie, { secret: config.sessionSecret });

  // A refusal is a decision, not a failure: it carries its own status and a
  // stable code. Anything else is a real error and must not leak its internals.
  app.setErrorHandler((err, req, reply) => {
    if (isRefusal(err)) {
      return reply.status(err.httpStatus).send(err.toBody());
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      refused: false,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error.',
    });
  });

  await registerRoutes(app);

  // Seed custody is part of building the service, not of one entrypoint, so
  // the boot path under test is the boot path that runs in production. It
  // reuses an existing active seed and never replaces one.
  await ensureActiveSeed();

  return app;
};

const isEntrypoint =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isEntrypoint) {
  const main = async () => {
    const { applied, skipped } = await runMigrations();
    console.log(`[boot] migrations applied=${applied.length} skipped=${skipped.length}`);

    const app = await buildServer();
    await app.listen({ port: config.port, host: config.host });

    const shutdown = async (signal: string) => {
      console.log(`[boot] ${signal} received, shutting down`);
      await app.close();
      await closePool();
      process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  };

  main().catch((err) => {
    console.error('[boot] failed to start:', err);
    process.exit(1);
  });
}
