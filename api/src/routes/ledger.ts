import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { jsonSafe } from '../json.js';
import { listAccountBalances } from '../ledger/balance.js';
import { checkInvariants, listEntries } from '../ledger/entries.js';

const entriesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const registerLedgerRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/ledger/accounts', async () => {
    const accounts = await listAccountBalances();
    return jsonSafe(accounts);
  });

  app.get('/ledger/entries', async (req, reply) => {
    const parsed = entriesQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(422).send({
        refused: true,
        code: 'INVALID_QUERY',
        message: 'limit must be an integer between 1 and 200',
      });
    }
    const entries = await listEntries(parsed.data.limit);
    return jsonSafe(entries);
  });

  app.get('/ledger/invariants', async () => {
    const invariants = await checkInvariants();
    return jsonSafe(invariants);
  });

  /**
   * Declared so the absence is explicit rather than incidental. A balance is
   * the sum of postings; there is no value here to write, and a 404 that says
   * so is more useful than a generic route-not-found.
   */
  app.put('/balance', async (_req, reply) =>
    reply.status(404).send({
      refused: true,
      code: 'NO_SUCH_ENDPOINT',
      message: 'Balance is derived from postings and cannot be written.',
    }),
  );
};
