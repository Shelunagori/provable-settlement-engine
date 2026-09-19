import pg from 'pg';
import { config } from './config.js';

// BIGINT (OID 20) arrives as a string by default so precision is not lost.
// Money is handled as bigint throughout the API, so parse it into one here.
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => BigInt(v));
// NUMERIC (OID 1700) stays a string; callers decide the precision they want.

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

/**
 * Anything that can run a statement: the pool, or one client already inside a
 * transaction. Helpers that must be callable from both take this rather than
 * reaching for the pool themselves -- a helper that opens its own connection
 * while the caller holds a lock will wait on that lock forever.
 */
export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

let pool: pg.Pool | null = null;

export const getPool = (): pg.Pool => {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? config.databaseUrl,
      max: config.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: /[?&]sslmode=require/.test(process.env.DATABASE_URL ?? '')
        ? { rejectUnauthorized: false }
        : undefined,
    });
    pool.on('error', (err) => {
      // A pooled idle client died; pg will replace it. Never crash the process.
      console.error('[db] idle client error', err.message);
    });
  }
  return pool;
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

/**
 * Run `fn` inside a single transaction. Commits on return, rolls back on throw.
 * Everything that moves money runs inside one of these -- the balance check and
 * the postings that depend on it must not be able to straddle a commit boundary.
 */
export const withTx = async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Connection is already gone; nothing to roll back.
    }
    throw err;
  } finally {
    client.release();
  }
};

export const ping = async (): Promise<boolean> => {
  const { rows } = await getPool().query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
};
