import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { closePool, getPool } from '../src/db.js';
import {
  ensureActiveSeed,
  getActiveCommitment,
  listRevealedSeeds,
  rotateSeed,
} from '../src/fairness/seeds.js';
import { computeOutcome } from '../src/fairness/outcome.js';
import { buildServer } from '../src/server.js';
import { ensureMigrated, resetLedger } from './helpers.js';

const HEX64 = /^[0-9a-f]{64}$/;
const sha256 = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

describe('seed custody', () => {
  let app: FastifyInstance;
  let baseUrl: string;

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
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  const get = async (path: string) => {
    const res = await fetch(`${baseUrl}${path}`);
    return { status: res.status, raw: await res.text() };
  };
  const getJson = async (path: string) => {
    const { status, raw } = await get(path);
    return { status, body: JSON.parse(raw) as Record<string, unknown>, raw };
  };
  const post = async (path: string) => {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST' });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  const activeRows = async () => {
    const { rows } = await getPool().query<{
      id: bigint;
      seed: string;
      seed_hash: string;
      status: string;
      nonce: bigint;
      revealed_at: Date | null;
    }>('SELECT id, seed, seed_hash, status, nonce, revealed_at FROM server_seeds ORDER BY id');
    return rows;
  };

  it('creates exactly one active seed on boot, committed by its hash', async () => {
    expect(await activeRows()).toHaveLength(0);

    await ensureActiveSeed();

    const rows = await activeRows();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.status).toBe('active');
    expect(row.seed).toMatch(HEX64);
    expect(row.seed_hash).toBe(sha256(row.seed));
    expect(row.nonce).toBe(0n);
    expect(row.revealed_at).toBeNull();
  });

  it('a restart reuses the active seed rather than silently replacing it', async () => {
    const first = await ensureActiveSeed();
    const rowsAfterFirst = await activeRows();

    // Three more initialisations, as three restarts would do.
    await ensureActiveSeed();
    await ensureActiveSeed();
    await ensureActiveSeed();

    const rowsAfter = await activeRows();
    expect(rowsAfter).toHaveLength(1);
    expect(rowsAfter[0]!.id).toBe(rowsAfterFirst[0]!.id);
    expect(rowsAfter[0]!.seed).toBe(rowsAfterFirst[0]!.seed);
    expect((await ensureActiveSeed()).seedHash).toBe(first.seedHash);
  });

  it('survives several initialisations racing, because the database decides', async () => {
    // Two instances booting at once must not produce two active seeds. The
    // partial unique index is the guard; nothing here is an in-memory latch.
    await Promise.all(Array.from({ length: 8 }, () => ensureActiveSeed()));
    const rows = await activeRows();
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
  });

  it('GET /fairness/seed publishes the commitment and never the plaintext', async () => {
    await ensureActiveSeed();
    const stored = (await activeRows())[0]!;

    const { status, body, raw } = await getJson('/fairness/seed');
    expect(status).toBe(200);
    expect(body).toEqual({ seedHash: stored.seed_hash, nonce: 0 });

    // Not merely "no seed key" -- the plaintext must not appear anywhere in
    // the response, under any key or nesting.
    expect(Object.keys(body)).not.toContain('seed');
    expect(raw).not.toContain(stored.seed);
  });

  it('rotation reveals the old seed and installs a new one in one transaction', async () => {
    await ensureActiveSeed();
    const before = await activeRows();
    expect(before).toHaveLength(1);
    const old = before[0]!;

    const { status, body } = await post('/fairness/rotate');
    expect(status).toBe(200);
    expect(body).toEqual({
      revealed: { seed: old.seed, seedHash: old.seed_hash },
      next: { seedHash: expect.any(String) },
    });

    const after = await activeRows();
    expect(after).toHaveLength(2);

    const revealed = after.find((r) => r.id === old.id)!;
    expect(revealed.status).toBe('revealed');
    expect(revealed.revealed_at).not.toBeNull();
    // The commitment published before use still matches the disclosed seed.
    expect(sha256(revealed.seed)).toBe(revealed.seed_hash);
    expect(revealed.seed).toBe(old.seed);
    expect(revealed.seed_hash).toBe(old.seed_hash);

    const actives = after.filter((r) => r.status === 'active');
    expect(actives).toHaveLength(1);
    const next = actives[0]!;
    expect(next.seed).not.toBe(old.seed);
    expect(next.seed_hash).not.toBe(old.seed_hash);
    expect(next.seed).toMatch(HEX64);
    expect(next.seed_hash).toBe(sha256(next.seed));
    expect(next.nonce).toBe(0n);
    expect(next.revealed_at).toBeNull();

    // The published commitment moved to the new seed; the new plaintext stays hidden.
    const seedRes = await getJson('/fairness/seed');
    expect(seedRes.body).toEqual({ seedHash: next.seed_hash, nonce: 0 });
    expect(seedRes.raw).not.toContain(next.seed);
  });

  it('survives two simultaneous rotations, leaving one active seed', async () => {
    await ensureActiveSeed();
    const before = (await activeRows())[0]!;

    // Both callers contend on the same active row. The loser used to find no
    // row after waiting and report "No active seed to rotate", which was
    // misleading: nothing was wrong, it had simply lost a race.
    const results = await Promise.all([rotateSeed(), rotateSeed()]);
    expect(results).toHaveLength(2);

    const rows = await activeRows();
    const actives = rows.filter((r) => r.status === 'active');
    const revealed = rows.filter((r) => r.status === 'revealed');

    expect(actives).toHaveLength(1);
    expect(actives[0]!.nonce).toBe(0n);
    expect(actives[0]!.revealed_at).toBeNull();
    expect(revealed).toHaveLength(2);

    // Both disclosed seeds still hash to the commitments published for them.
    for (const r of revealed) {
      expect(sha256(r.seed)).toBe(r.seed_hash);
      expect(r.revealed_at).not.toBeNull();
    }
    expect(revealed.map((r) => r.id)).toContain(before.id);

    // The seed now in use is not disclosed anywhere public.
    const seedRes = await getJson('/fairness/seed');
    expect(seedRes.body).toEqual({ seedHash: actives[0]!.seed_hash, nonce: 0 });
    expect(seedRes.raw).not.toContain(actives[0]!.seed);

    const history = await getJson('/fairness/seeds');
    expect(history.raw).not.toContain(actives[0]!.seed);
  });

  it('establishes seed custody as part of building the server', async () => {
    // Not via ensureActiveSeed(): this pins the production boot path, so a
    // refactor cannot drop seed initialisation from buildServer() while the
    // lower-level tests stay green.
    await getPool().query('TRUNCATE server_seeds RESTART IDENTITY CASCADE');
    expect(await activeRows()).toHaveLength(0);

    const booted = await buildServer();
    try {
      const rows = await activeRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('active');
      expect(rows[0]!.nonce).toBe(0n);
      expect(rows[0]!.seed).toMatch(HEX64);
      expect(rows[0]!.seed_hash).toBe(sha256(rows[0]!.seed));
    } finally {
      await booted.close();
    }
  });

  it('GET /fairness/seeds is revealed history only, newest first', async () => {
    await ensureActiveSeed();
    const committedHash = (await getActiveCommitment())!.seedHash;
    const activeBefore = (await activeRows())[0]!;

    // Nothing revealed yet.
    const empty = await getJson('/fairness/seeds');
    expect(empty.body).toEqual([]);

    await rotateSeed();
    const secondActive = (await activeRows()).find((r) => r.status === 'active')!;
    await rotateSeed();

    const { body, raw } = await getJson('/fairness/seeds');
    const history = body as unknown as { seed: string; seedHash: string; revealedAt: string }[];
    expect(history).toHaveLength(2);

    // Newest revelation first.
    expect(history[0]!.seedHash).toBe(secondActive.seed_hash);
    expect(history[1]!.seedHash).toBe(committedHash);

    // The first seed's disclosed plaintext hashes to the hash published before use.
    const original = history[1]!;
    expect(original.seed).toBe(activeBefore.seed);
    expect(sha256(original.seed)).toBe(original.seedHash);
    expect(original.revealedAt).toEqual(expect.any(String));

    // The seed currently in use is not in the history and not in the response.
    const stillActive = (await activeRows()).find((r) => r.status === 'active')!;
    expect(history.map((h) => h.seedHash)).not.toContain(stillActive.seed_hash);
    expect(raw).not.toContain(stillActive.seed);
  });

  it('verifies a revealed seed, and refuses to vouch for one it never committed', async () => {
    await ensureActiveSeed();
    const active = (await activeRows())[0]!;

    // While the seed is active it is not a revealed commitment, even though
    // the arithmetic is perfectly computable.
    const whileActive = await getJson(
      `/fairness/verify?serverSeed=${active.seed}&clientSeed=c1&nonce=7&targetUnder=50.00`,
    );
    expect(whileActive.status).toBe(200);
    expect(whileActive.body.matchesHash).toBe(false);

    await rotateSeed();
    const revealed = (await listRevealedSeeds())[0]!;
    expect(revealed.seed).toBe(active.seed);

    const expected = computeOutcome(revealed.seed, 'c1', 7n);
    const after = await getJson(
      `/fairness/verify?serverSeed=${revealed.seed}&clientSeed=c1&nonce=7&targetUnder=50.00`,
    );
    expect(after.status).toBe(200);
    expect(after.body).toEqual({
      roll: Number(expected.roll),
      won: expected.rollHundredths < 5000,
      matchesHash: true,
    });

    // A well-formed seed this service never committed verifies arithmetically
    // but is not vouched for.
    const stranger = 'ab'.repeat(32);
    const strangerRes = await getJson(
      `/fairness/verify?serverSeed=${stranger}&clientSeed=c1&nonce=7&targetUnder=50.00`,
    );
    expect(strangerRes.status).toBe(200);
    expect(strangerRes.body.matchesHash).toBe(false);
    expect(strangerRes.body.roll).toBe(Number(computeOutcome(stranger, 'c1', 7n).roll));
  });

  it('rejects malformed verify input', async () => {
    const cases = [
      '/fairness/verify?serverSeed=nothex&clientSeed=c&nonce=1&targetUnder=50.00',
      `/fairness/verify?serverSeed=${'AB'.repeat(32)}&clientSeed=c&nonce=1&targetUnder=50.00`,
      `/fairness/verify?serverSeed=${'ab'.repeat(32)}&clientSeed=&nonce=1&targetUnder=50.00`,
      `/fairness/verify?serverSeed=${'ab'.repeat(32)}&clientSeed=c&nonce=-1&targetUnder=50.00`,
      `/fairness/verify?serverSeed=${'ab'.repeat(32)}&clientSeed=c&nonce=1&targetUnder=0.99`,
      `/fairness/verify?serverSeed=${'ab'.repeat(32)}&clientSeed=c&nonce=1&targetUnder=98.01`,
    ];
    for (const url of cases) {
      const { status, body } = await getJson(url);
      expect(status, url).toBe(422);
      expect(body.code, url).toBe('INVALID_PAYLOAD');
    }
  });
});
