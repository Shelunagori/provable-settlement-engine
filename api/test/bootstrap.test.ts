import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { closePool, getPool } from '../src/db.js';
import { runMigrations, migrationStatus } from '../src/migrate.js';
import { ensureMigrated } from './helpers.js';

describe('H0 bootstrap', () => {
  beforeAll(async () => {
    await ensureMigrated();
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
    ]);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const { applied, skipped } = await runMigrations();
    expect(applied).toEqual([]);
    expect(skipped).toHaveLength(3);
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
