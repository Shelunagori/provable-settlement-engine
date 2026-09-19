import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { ping } from '../db.js';
import { migrationStatus } from '../migrate.js';
import { registerBetRoutes } from './bets.js';
import { registerDemoRoutes } from './demo.js';
import { registerFairnessRoutes } from './fairness.js';
import { registerLedgerRoutes } from './ledger.js';
import { registerMetaRoutes } from './meta.js';
import { registerPaymentRoutes } from './payments.js';
import { registerSessionRoutes } from './session.js';

const bootedAt = Date.now();

export type HealthDeps = {
  ping: () => Promise<boolean>;
  migrationStatus: () => Promise<{ filename: string }[]>;
};

const defaultHealthDeps: HealthDeps = { ping, migrationStatus };

/**
 * The deployment health check, and therefore a status code that has to mean
 * something.
 *
 * A body of {"ok": false} returned with HTTP 200 is indistinguishable from a
 * healthy service to every load balancer and platform health probe there is --
 * including Railway's, which is configured against this path. An instance that
 * cannot reach its database must answer 503 so it is taken out of service.
 *
 * The failure is caught rather than allowed to become a 500, and nothing about
 * the database error reaches the response: a health endpoint is unauthenticated
 * and has no business disclosing connection strings, hostnames or driver
 * messages.
 */
export const healthHandler =
  (deps: HealthDeps = defaultHealthDeps) =>
  async (_req: FastifyRequest, reply: FastifyReply) => {
    const uptimeSeconds = Math.floor((Date.now() - bootedAt) / 1000);

    try {
      const db = await deps.ping();
      if (!db) throw new Error('database did not answer');
      const migrations = (await deps.migrationStatus()).map((m) => m.filename);
      // Which optional facilities this deployment actually has. The console
      // uses it to decide whether to offer the demo reset at all, rather than
      // showing a button that answers 404 on a deployment without the flag.
      return reply.status(200).send({
        ok: true,
        db: true,
        migrations,
        uptimeSeconds,
        features: { demoReset: config.demoResetEnabled },
      });
    } catch {
      return reply
        .status(503)
        .send({ ok: false, db: false, migrations: [], uptimeSeconds });
    }
  };

export const registerRoutes = async (
  app: FastifyInstance,
  healthDeps: HealthDeps = defaultHealthDeps,
): Promise<void> => {
  app.get('/health', healthHandler(healthDeps));

  await registerLedgerRoutes(app);
  await registerPaymentRoutes(app);
  await registerFairnessRoutes(app);
  await registerBetRoutes(app);
  await registerSessionRoutes(app);
  await registerMetaRoutes(app);
  await registerDemoRoutes(app);
};
