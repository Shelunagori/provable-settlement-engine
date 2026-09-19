import type { PoolClient } from '../db.js';
import { getPool } from '../db.js';

export type AccountKind = 'treasury' | 'user' | 'gateway' | 'escrow' | 'affiliate';
export type Account = { id: string; kind: AccountKind };

/**
 * Locks every named account for the rest of the caller's transaction, in a
 * single statement ordered by id.
 *
 * The ordering is what prevents deadlock: two transactions touching the same
 * pair of accounts from opposite directions would otherwise each hold the lock
 * the other needs. Postgres builds this plan as LockRows over Sort, so the sort
 * is applied before any row is locked -- the order is a property of the plan,
 * not a hope about scan order.
 */
export const lockAccounts = async (
  client: PoolClient,
  accountIds: readonly string[],
): Promise<Account[]> => {
  const ids = [...new Set(accountIds)].sort();
  if (ids.length === 0) return [];

  const { rows } = await client.query<Account>(
    `SELECT id, kind FROM accounts
     WHERE id = ANY($1::text[])
     ORDER BY id
     FOR UPDATE`,
    [ids],
  );

  if (rows.length !== ids.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    // Not a refusal: a caller naming an account that does not exist is a bug in
    // this codebase, not a decision a user is owed an explanation for.
    throw new Error(`Unknown account(s): ${missing.join(', ')}`);
  }

  return rows;
};

export const listAccounts = async (): Promise<Account[]> => {
  const { rows } = await getPool().query<Account>(
    'SELECT id, kind FROM accounts ORDER BY id',
  );
  return rows;
};
