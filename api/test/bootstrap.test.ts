import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { healthHandler } from '../src/routes/index.js';
import { buildServer } from '../src/server.js';
import { closePool, getPool } from '../src/db.js';
import { runMigrations, migrationStatus } from '../src/migrate.js';
import { ensureMigrated, resetLedger } from './helpers.js';

describe('H0 bootstrap', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  beforeEach(async () => {
    // This file asserts the exact seeded chart of accounts, so it must not
    // inherit accounts another test file created. Without this the assertion
    // passes or fails purely on which file vitest happens to run first -- it
    // survived until a clean checkout with no test cache reordered the files.
    await resetLedger();
  });

  afterAll(async () => {
    await closePool();
  });

  it('applies every migration file and records it', async () => {
    const status = await migrationStatus();
    expect(status.map((m) => m.filename)).toEqual([
      '001_schema.sql',
      '002_triggers.sql',
      '003_seed_data.sql',
      '004_round_lifecycle.sql',
    ]);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const { applied, skipped } = await runMigrations();
    expect(applied).toEqual([]);
    expect(skipped).toHaveLength(4);
  });

  it('seeds the chart of accounts', async () => {
    const { rows } = await getPool().query<{ id: string; kind: string }>(
      'SELECT id, kind FROM accounts ORDER BY id',
    );
    expect(rows).toEqual([
      { id: 'affiliate:alice', kind: 'affiliate' },
      { id: 'gateway', kind: 'gateway' },
      { id: 'pending_bets', kind: 'escrow' },
      { id: 'treasury', kind: 'treasury' },
      { id: 'user:demo', kind: 'user' },
    ]);
  });

  it('allows the round_resolved lifecycle kind', async () => {
    const { rows } = await getPool().query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'journal_entries'::regclass AND conname = 'journal_entries_kind_check'`,
    );
    expect(rows[0]!.def).toContain('round_resolved');
  });

  it('installs the ledger triggers', async () => {
    const { rows } = await getPool().query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgrelid IN ('postings'::regclass, 'journal_entries'::regclass, 'rounds'::regclass)
       ORDER BY tgname`,
    );
    expect(rows.map((r) => r.tgname)).toEqual([
      'journal_entries_immutable',
      'postings_balanced',
      'postings_immutable',
      'rounds_linear',
    ]);
  });

  it('answers 503, not 200, when the database is unreachable', async () => {
    // A body of {"ok": false} with HTTP 200 looks healthy to every load
    // balancer there is, including the platform probe configured against this
    // path. The status code is the part that has to be right.
    const app = Fastify();
    app.get(
      '/health',
      healthHandler({
        ping: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.1:5432');
        },
        migrationStatus: async () => [],
      }),
    );

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ ok: false, db: false, migrations: [] });

    // The failure must not leak the database's address or driver message.
    expect(res.body).not.toContain('ECONNREFUSED');
    expect(res.body).not.toContain('5432');
    await app.close();
  });

  it('answers 503 when the database answers but reports not ready', async () => {
    const app = Fastify();
    app.get('/health', healthHandler({ ping: async () => false, migrationStatus: async () => [] }));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json().ok).toBe(false);
    await app.close();
  });

  it('serves /health with db and migration state', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
    expect(body.migrations).toContain('001_schema.sql');
    expect(typeof body.uptimeSeconds).toBe('number');
    await app.close();
  });
});
