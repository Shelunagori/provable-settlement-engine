import type { FastifyInstance } from 'fastify';
import { ping } from '../db.js';
import { migrationStatus } from '../migrate.js';
import { registerLedgerRoutes } from './ledger.js';
import { registerBetRoutes } from './bets.js';
import { registerFairnessRoutes } from './fairness.js';
import { registerMetaRoutes } from './meta.js';
import { registerSessionRoutes } from './session.js';
import { registerPaymentRoutes } from './payments.js';

const bootedAt = Date.now();

export const registerRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/health', async () => {
    let db = false;
    let migrations: string[] = [];
    try {
      db = await ping();
      migrations = (await migrationStatus()).map((m) => m.filename);
    } catch {
      db = false;
    }
    return {
      ok: db,
      db,
      migrations,
      uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000),
    };
  });

  await registerLedgerRoutes(app);
  await registerPaymentRoutes(app);
  await registerFairnessRoutes(app);
  await registerBetRoutes(app);
  await registerSessionRoutes(app);
  await registerMetaRoutes(app);
};
