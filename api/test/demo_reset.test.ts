import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closePool, getPool } from '../src/db.js';
import { placeBet } from '../src/engine/bet.js';
import { parseHundredths } from '../src/fairness/outcome.js';
import { getBalance } from '../src/ledger/balance.js';
import { buildServer } from '../src/server.js';
import vectors from '../../fixtures/fairness-vectors.json';
import { ensureMigrated, fundUser, resetLedger, useFixtureSeed, warmPool } from './helpers.js';

const V = vectors.vectors[0]!;
const TARGET = parseHundredths('50.00');

/**
 * POST /demo/reset returns the demo environment to a fresh state.
 *
 * It is an environment lifecycle operation and the tests treat it as one: what
 * matters is that it is unreachable unless explicitly enabled, that it cannot
 * be aimed at anything but the fixed demo dataset, that it leaves an
 * immediately usable environment, and that it never leaves a partial one.
 */
describe('POST /demo/reset', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  const originalFlag = process.env.DEMO_RESET_ENABLED;

  const post = async (path: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  const counts = async () => {
    const { rows } = await getPool().query<{
      postings: bigint;
      entries: bigint;
      bets: bigint;
      rounds: bigint;
      events: bigint;
      active_seeds: bigint;
      accounts: bigint;
    }>(`SELECT
          (SELECT COUNT(*) FROM postings)::BIGINT          AS postings,
          (SELECT COUNT(*) FROM journal_entries)::BIGINT   AS entries,
          (SELECT COUNT(*) FROM bets)::BIGINT              AS bets,
          (SELECT COUNT(*) FROM rounds)::BIGINT            AS rounds,
          (SELECT COUNT(*) FROM webhook_events)::BIGINT    AS events,
          (SELECT COUNT(*) FROM server_seeds
             WHERE status = 'active')::BIGINT              AS active_seeds,
          (SELECT COUNT(*) FROM accounts)::BIGINT          AS accounts`);
    return rows[0]!;
  };

  const ledgerSum = async () => {
    const { rows } = await getPool().query<{ total: bigint }>(
      'SELECT COALESCE(SUM(amount_minor), 0)::BIGINT AS total FROM postings',
    );
    return rows[0]!.total;
  };

  const unbalancedEntries = async () => {
    const { rows } = await getPool().query<{ n: bigint }>(
      `SELECT COUNT(*)::BIGINT AS n FROM (
         SELECT entry_id FROM postings GROUP BY entry_id HAVING SUM(amount_minor) <> 0
       ) bad`,
    );
    return rows[0]!.n;
  };

  /** Deposit, then settle one real bet, so there is activity to destroy. */
  const createActivity = async () => {
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    await fundUser('user:demo', 10_000n);
    await placeBet({
      betId: `activity_${Math.random().toString(36).slice(2)}`,
      userId: 'user:demo',
      amountMinor: 500n,
      targetUnderHundredths: TARGET,
      clientSeed: V.clientSeed,
    });
  };

  beforeAll(async () => {
    await ensureMigrated();
    app = await buildServer();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('expected a TCP address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(async () => {
    await resetLedger();
    await warmPool();
    process.env.DEMO_RESET_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.DEMO_RESET_ENABLED;
    else process.env.DEMO_RESET_ENABLED = originalFlag;
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  describe('when the flag is not set', () => {
    it('is not there at all, and says nothing about being switched off', async () => {
      delete process.env.DEMO_RESET_ENABLED;
      await createActivity();
      const before = await getBalance('user:demo');

      const { status, body } = await post('/demo/reset');

      expect(status).toBe(404);
      expect(body.code).toBe('NO_SUCH_ENDPOINT');
      // Nothing in the answer hints that a reset exists behind a flag.
      expect(JSON.stringify(body).toLowerCase()).not.toContain('demo');
      expect(JSON.stringify(body).toLowerCase()).not.toContain('disabled');
      expect(JSON.stringify(body).toLowerCase()).not.toContain('enable');

      // And nothing was destroyed on the way to being refused.
      expect(await getBalance('user:demo')).toBe(before);
    });

    it.each(['1', 'yes', 'TRUE', ''])('stays off for DEMO_RESET_ENABLED=%j', async (value) => {
      process.env.DEMO_RESET_ENABLED = value;
      const { status } = await post('/demo/reset');
      expect(status).toBe(404);
    });
  });

  it('is advertised on /health only when it is actually enabled', async () => {
    process.env.DEMO_RESET_ENABLED = 'true';
    const on = await fetch(`${baseUrl}/health`).then((r) => r.json() as Promise<Record<string, unknown>>);
    expect((on.features as { demoReset: boolean }).demoReset).toBe(true);

    delete process.env.DEMO_RESET_ENABLED;
    const off = await fetch(`${baseUrl}/health`).then((r) => r.json() as Promise<Record<string, unknown>>);
    expect((off.features as { demoReset: boolean }).demoReset).toBe(false);
  });

  describe('when enabled', () => {
    it('clears demo activity and leaves an immediately usable environment', async () => {
      await createActivity();

      const busy = await counts();
      expect(busy.postings).toBeGreaterThan(0n);
      expect(busy.bets).toBe(1n);
      expect(await getBalance('user:demo')).toBeGreaterThan(0n);

      const { status, body } = await post('/demo/reset');
      expect(status).toBe(200);
      expect(body.reset).toBe(true);

      const fresh = await counts();
      expect(fresh.postings).toBe(0n);
      expect(fresh.entries).toBe(0n);
      expect(fresh.bets).toBe(0n);
      expect(fresh.rounds).toBe(0n);
      expect(fresh.events).toBe(0n);

      // A balance of zero because there are no postings, not because anything
      // wrote a zero: there is still no balance column to write.
      expect(await getBalance('user:demo')).toBe(0n);

      // The chart of accounts is a fixture and survives.
      expect(fresh.accounts).toBe(5n);
      expect(fresh.active_seeds).toBe(1n);

      const commitment = body.commitment as { seedHash: string; nonce: number };
      expect(commitment.seedHash).toMatch(/^[0-9a-f]{64}$/);
      expect(commitment.nonce).toBe(0);
    });

    it('leaves an environment a new bet can be placed in', async () => {
      await createActivity();
      expect((await post('/demo/reset')).status).toBe(200);

      await fundUser('user:demo', 10_000n);
      const placed = await placeBet({
        betId: 'after_reset',
        userId: 'user:demo',
        amountMinor: 500n,
        targetUnderHundredths: TARGET,
        clientSeed: 'after-reset-seed',
      });

      expect(placed.bet.id).toBe('after_reset');
      expect(await unbalancedEntries()).toBe(0n);
      expect(await ledgerSum()).toBe(0n);
    });

    it('restores a demo account that has gone missing', async () => {
      // A reset has to produce what a fresh install produces, which means the
      // chart of accounts is part of what it reseeds rather than something it
      // assumes is already there.
      await getPool().query("DELETE FROM affiliate_links WHERE affiliate_id = 'affiliate:alice'");
      await getPool().query("DELETE FROM accounts WHERE id = 'affiliate:alice'");
      expect((await counts()).accounts).toBe(4n);

      expect((await post('/demo/reset')).status).toBe(200);

      expect((await counts()).accounts).toBe(5n);
      const { rows } = await getPool().query<{ affiliate_id: string }>(
        "SELECT affiliate_id FROM affiliate_links WHERE user_id = 'user:demo'",
      );
      expect(rows[0]?.affiliate_id).toBe('affiliate:alice');
    });

    it('is safe to call repeatedly', async () => {
      await createActivity();

      for (let i = 0; i < 3; i += 1) {
        const { status } = await post('/demo/reset');
        expect(status).toBe(200);
        const c = await counts();
        expect(c.active_seeds).toBe(1n);
        expect(c.postings).toBe(0n);
        expect(c.accounts).toBe(5n);
      }
    });

    it('ignores anything in the request body', async () => {
      await createActivity();
      // Nothing here can redirect the reset: there is no account parameter.
      const { status } = await post('/demo/reset', {
        user_id: 'treasury',
        account_id: 'affiliate:alice',
        drop: true,
      });
      expect(status).toBe(200);
      const c = await counts();
      expect(c.accounts).toBe(5n);
      expect(c.active_seeds).toBe(1n);
    });

    it('serialises concurrent resets into one active seed', async () => {
      await createActivity();

      const results = await Promise.all(
        Array.from({ length: 6 }, () => post('/demo/reset')),
      );

      expect(results.every((r) => r.status === 200)).toBe(true);
      const c = await counts();
      expect(c.active_seeds).toBe(1n);
      expect(c.postings).toBe(0n);
      expect(await unbalancedEntries()).toBe(0n);
    });

    it('never leaves a bet half-settled against a reset', async () => {
      await useFixtureSeed(V.serverSeed, Number(V.nonce));
      await fundUser('user:demo', 50_000n);

      // A burst of bets against a reset landing in the middle of them. Whatever
      // the interleaving, the environment afterwards must be coherent: no
      // unbalanced entry, a ledger summing to zero, and exactly one active seed.
      const bets = Array.from({ length: 8 }, (_, i) =>
        placeBet({
          betId: `race_${i}`,
          userId: 'user:demo',
          amountMinor: 500n,
          targetUnderHundredths: TARGET,
          clientSeed: `race-${i}`,
        }).then(
          () => 'settled' as const,
          () => 'refused' as const,
        ),
      );
      const reset = post('/demo/reset');

      const [resetResult] = await Promise.all([reset, ...bets]);

      expect(resetResult.status).toBe(200);
      expect(await unbalancedEntries()).toBe(0n);
      expect(await ledgerSum()).toBe(0n);

      const c = await counts();
      expect(c.active_seeds).toBe(1n);
      // Any bet that committed after the reset is still a coherent bet.
      const { rows } = await getPool().query<{ n: bigint }>(
        `SELECT COUNT(*)::BIGINT AS n FROM bets b
         LEFT JOIN rounds r ON r.id = b.round_id
         WHERE r.id IS NULL`,
      );
      expect(rows[0]!.n).toBe(0n);
    });
  });
});
