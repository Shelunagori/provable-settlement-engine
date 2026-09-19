import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { closePool } from './db.js';
import { runMigrations } from './migrate.js';
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

  await registerRoutes(app);

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
