import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { closePool, getPool } from '../src/db.js';
import vectors from '../../fixtures/fairness-vectors.json';
import { withTx } from '../src/db.js';
import { createRound, settleRound } from '../src/engine/round.js';
import { OFFICIAL_REFUSAL_CODES, REFUSALS } from '../src/refusals.js';
import { rotateSeed } from '../src/fairness/seeds.js';
import { buildServer } from '../src/server.js';
import {
  ensureMigrated,
  fundUser,
  insertSettledLoss,
  resetLedger,
  useFixtureSeed,
} from './helpers.js';

const V = vectors.vectors[0]!;

/** Every refusal, whatever produced it, answers to this shape. */
const refusalSchema = z
  .object({
    refused: z.literal(true),
    code: z.enum(OFFICIAL_REFUSAL_CODES),
    message: z.string().min(1),
  })
  .passthrough();

describe('refusal table', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let cookie: string;

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
    await useFixtureSeed(V.serverSeed, Number(V.nonce));
    const res = await fetch(`${baseUrl}/session`, { method: 'POST' });
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  const postBet = async (body: Record<string, unknown>, withCookie = true) => {
    const res = await fetch(`${baseUrl}/bets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(withCookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  const validBet = (over: Record<string, unknown> = {}) => ({
    betId: `r_${Math.random().toString(36).slice(2)}`,
    amountMinor: 500,
    targetUnder: 50,
    clientSeed: V.clientSeed,
    ...over,
  });

  const counts = async () => {
    const { rows } = await getPool().query<{ b: bigint; r: bigint; n: bigint }>(
      `SELECT (SELECT COUNT(*) FROM bets)::BIGINT AS b,
              (SELECT COUNT(*) FROM rounds)::BIGINT AS r,
              (SELECT nonce FROM server_seeds WHERE status='active')::BIGINT AS n`,
    );
    return rows[0]!;
  };

  it('publishes exactly the nine official codes', async () => {
    const res = await fetch(`${baseUrl}/refusals`);
    expect(res.status).toBe(200);
    const table = (await res.json()) as {
      code: string;
      httpStatus: number;
      summary: string;
      enforcedIn: string;
    }[];

    expect(table.map((r) => r.code).sort()).toEqual([...OFFICIAL_REFUSAL_CODES].sort());
    expect(new Set(table.map((r) => r.code)).size).toBe(9);

    const byCode = Object.fromEntries(table.map((r) => [r.code, r.httpStatus]));
    expect(byCode).toEqual({
      INSUFFICIENT_FUNDS: 409,
      BET_BELOW_MIN: 422,
      BET_ABOVE_MAX: 422,
      DAILY_LOSS_LIMIT: 429,
      ROUND_CLOSED: 409,
      DUPLICATE_BET: 409,
      INVALID_TARGET: 422,
      SEED_ROTATED: 409,
      NOT_AUTHENTICATED: 401,
    });
    for (const row of table) {
      expect(row.summary.length).toBeGreaterThan(0);
      expect(row.enforcedIn.length).toBeGreaterThan(0);
    }
  });

  it('NOT_AUTHENTICATED', async () => {
    const before = await counts();
    const { status, body } = await postBet(validBet(), false);
    expect(status).toBe(401);
    expect(refusalSchema.parse(body).code).toBe('NOT_AUTHENTICATED');
    expect(await counts()).toEqual(before);
  });

  it('INVALID_TARGET', async () => {
    await fundUser('user:demo', 100_000n);
    const before = await counts();
    const { status, body } = await postBet(validBet({ targetUnder: 99 }));
    expect(status).toBe(422);
    expect(refusalSchema.parse(body).code).toBe('INVALID_TARGET');
    expect(await counts()).toEqual(before);
  });

  it('BET_BELOW_MIN', async () => {
    await fundUser('user:demo', 100_000n);
    const before = await counts();
    const { status, body } = await postBet(validBet({ amountMinor: 99 }));
    expect(status).toBe(422);
    const parsed = refusalSchema.parse(body);
    expect(parsed.code).toBe('BET_BELOW_MIN');
    expect(body.limit).toBe(100);
    expect(await counts()).toEqual(before);
  });

  it('BET_ABOVE_MAX', async () => {
    await fundUser('user:demo', 1_000_000n);
    const before = await counts();
    const { status, body } = await postBet(validBet({ amountMinor: 60_000 }));
    expect(status).toBe(422);
    expect(refusalSchema.parse(body).code).toBe('BET_ABOVE_MAX');
    expect(body.limit).toBe(50000);
    expect(body.message).toContain('60000');
    expect(await counts()).toEqual(before);
  });

  it('INSUFFICIENT_FUNDS', async () => {
    const before = await counts();
    const { status, body } = await postBet(validBet({ amountMinor: 500 }));
    expect(status).toBe(409);
    expect(refusalSchema.parse(body).code).toBe('INSUFFICIENT_FUNDS');
    expect(await counts()).toEqual(before);
  });

  it('DAILY_LOSS_LIMIT', async () => {
    await fundUser('user:demo', 1_000_000n);
    // Written as a fixture rather than as four real bets: a real bet's outcome
    // depends on the nonce it draws, and a win would leave the day's net
    // somewhere other than the limit.
    await insertSettledLoss('user:demo', 200_000n);
    const before = await counts();

    const { status, body } = await postBet(validBet({ betId: 'dll_over', amountMinor: 500 }));
    expect(status).toBe(429);
    expect(refusalSchema.parse(body).code).toBe('DAILY_LOSS_LIMIT');
    expect(body.limit).toBe(200000);
    expect(body.netLossToday).toBe(200000);
    expect(body.requestedAmount).toBe(500);
    expect(await counts()).toEqual(before);
  });

  it('DUPLICATE_BET', async () => {
    await fundUser('user:demo', 100_000n);
    const first = await postBet(validBet({ betId: 'dup_http' }));
    expect(first.status).toBe(200);
    const after = await counts();

    const { status, body } = await postBet(validBet({ betId: 'dup_http' }));
    expect(status).toBe(409);
    const parsed = refusalSchema.parse(body);
    expect(parsed.code).toBe('DUPLICATE_BET');
    expect(body.idempotent).toBe(true);
    expect((body.bet as { id: string }).id).toBe('dup_http');
    expect(await counts()).toEqual(after);
  });

  it('SEED_ROTATED', async () => {
    await fundUser('user:demo', 100_000n);
    const stale = (await (await fetch(`${baseUrl}/fairness/seed`)).json()) as { seedHash: string };
    await rotateSeed();
    const before = await counts();

    const { status, body } = await postBet(
      validBet({ betId: 'seed_stale', seedHash: stale.seedHash }),
    );
    expect(status).toBe(409);
    expect(refusalSchema.parse(body).code).toBe('SEED_ROTATED');
    expect(await counts()).toEqual(before);

    // The current commitment is accepted.
    const fresh = (await (await fetch(`${baseUrl}/fairness/seed`)).json()) as { seedHash: string };
    const ok = await postBet(validBet({ betId: 'seed_fresh', seedHash: fresh.seedHash }));
    expect(ok.status).toBe(200);
  });

  it('ROUND_CLOSED', async () => {
    // No public endpoint drives a transition, so the refusal is taken from the
    // service and validated against the same schema every HTTP refusal answers to.
    const roundId = await withTx((c) => createRound(c, 'user:demo'));
    let body: Record<string, unknown> | null = null;
    try {
      await withTx((c) => settleRound(c, roundId));
    } catch (err) {
      body = (err as { toBody: () => Record<string, unknown> }).toBody();
    }
    expect(body).not.toBeNull();
    expect(refusalSchema.parse(body).code).toBe('ROUND_CLOSED');
    expect(REFUSALS.ROUND_CLOSED.httpStatus).toBe(409);
  });
});
