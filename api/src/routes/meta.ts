import type { FastifyInstance } from 'fastify';
import { affiliateSummary } from '../affiliate/commission.js';
import { jsonSafe } from '../json.js';
import { refusalTable } from '../refusals.js';

export const registerMetaRoutes = async (app: FastifyInstance): Promise<void> => {
  /** The refusal table as data. Same object the docs are generated from. */
  app.get('/refusals', async (_req, reply) => reply.status(200).send(refusalTable()));

  app.get<{ Params: { id: string } }>('/affiliate/:id', async (req, reply) => {
    const summary = await affiliateSummary(req.params.id);
    return reply.status(200).send(jsonSafe(summary));
  });
};
