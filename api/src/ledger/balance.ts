import type { PoolClient } from '../db.js';
import { getPool } from '../db.js';
import type { AccountKind } from './accounts.js';

export type AccountBalance = {
  accountId: string;
  kind: AccountKind;
  balanceMinor: bigint;
};

// SUM() over BIGINT returns NUMERIC in Postgres, which the driver hands back as
// a string. Every sum in this file is cast back to BIGINT so it arrives as a
// bigint and money never passes through a float or a string comparison.
const SUM_FOR_ACCOUNT = `
  SELECT COALESCE(SUM(amount_minor), 0)::BIGINT AS balance_minor
  FROM postings
  WHERE account_id = $1
`;

/**
 * The derived balance of an account, read inside the caller's transaction.
 *
 * Call this only after the account row is locked: between an unlocked read and
 * the posting that depends on it, another transaction can commit a debit, and
 * the decision would be made on a balance that is already stale.
 */
export const derivedBalanceTx = async (
  client: PoolClient,
  accountId: string,
): Promise<bigint> => {
  const { rows } = await client.query<{ balance_minor: bigint }>(SUM_FOR_ACCOUNT, [accountId]);
  return rows[0]?.balance_minor ?? 0n;
};

/** The derived balance of an account, read outside any transaction. */
export const getBalance = async (accountId: string): Promise<bigint> => {
  const { rows } = await getPool().query<{ balance_minor: bigint }>(SUM_FOR_ACCOUNT, [accountId]);
  return rows[0]?.balance_minor ?? 0n;
};

/** Every account with its balance, derived at read time from the view. */
export const listAccountBalances = async (): Promise<AccountBalance[]> => {
  const { rows } = await getPool().query<{
    account_id: string;
    kind: AccountKind;
    balance_minor: bigint;
  }>('SELECT account_id, kind, balance_minor FROM account_balances ORDER BY account_id');

  return rows.map((r) => ({
    accountId: r.account_id,
    kind: r.kind,
    balanceMinor: r.balance_minor,
  }));
};
