import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from './db.js';
import { getPool, closePool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
// src/migrate.ts -> ../migrations ; dist/migrate.js -> ../migrations
const MIGRATIONS_DIR = join(here, '..', 'migrations');

export type AppliedMigration = { filename: string; checksum: string; appliedAt: Date };

const ensureTable = async (c: PoolClient): Promise<void> => {
  await c.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename    TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
};

const checksum = (sql: string): string => createHash('sha256').update(sql).digest('hex');

/**
 * Applies every migration not yet recorded in _migrations, in filename order,
 * each in its own transaction. Safe to run on every boot: already-applied files
 * are skipped, and a file whose contents changed after being applied is a hard
 * error rather than a silent divergence between code and database.
 */
export const runMigrations = async (): Promise<{ applied: string[]; skipped: string[] }> => {
  const pool = getPool();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await ensureTable(client);
    const { rows } = await client.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM _migrations',
    );
    const seen = new Map(rows.map((r) => [r.filename, r.checksum]));

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    for (const filename of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
      const sum = checksum(sql);
      const previous = seen.get(filename);

      if (previous !== undefined) {
        if (previous !== sum) {
          throw new Error(
            `Migration ${filename} was already applied but its contents changed. ` +
              `Add a new migration instead of editing an applied one.`,
          );
        }
        skipped.push(filename);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)', [
          filename,
          sum,
        ]);
        await client.query('COMMIT');
        applied.push(filename);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${filename} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    client.release();
  }

  return { applied, skipped };
};

export const migrationStatus = async (): Promise<AppliedMigration[]> => {
  const { rows } = await getPool().query<{
    filename: string;
    checksum: string;
    applied_at: Date;
  }>('SELECT filename, checksum, applied_at FROM _migrations ORDER BY filename');
  return rows.map((r) => ({ filename: r.filename, checksum: r.checksum, appliedAt: r.applied_at }));
};

// Allow `npm run migrate` as a standalone command.
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(`[migrate] applied=${applied.length} skipped=${skipped.length}`);
      for (const f of applied) console.log(`[migrate]   + ${f}`);
      return closePool();
    })
    .catch(async (err) => {
      console.error('[migrate] failed:', err.message);
      await closePool();
      process.exit(1);
    });
}
