import type { PoolClient } from '../db.js';
import { RefusalError } from '../refusals.js';
import { lockAccounts } from './accounts.js';
import { derivedBalanceTx } from './balance.js';

export type EntryKind = 'deposit' | 'bet_lock' | 'bet_settle' | 'commission' | 'withdrawal';
export type RefType = 'webhook_event' | 'bet' | 'round';

/** Positive credits the account, negative debits it. */
export type Posting = { account: string; amountMinor: bigint };

export type EntryInput = {
  kind: EntryKind;
  refType?: RefType;
  refId?: string;
  postings: Posting[];
};

export type PostedEntry = {
  entryId: bigint;
  kind: EntryKind;
  postings: Posting[];
};

/**
 * The only path through which money moves in this application.
 *
 * It runs inside the caller's transaction and never opens or commits one of its
 * own: the balance it reads and the postings it writes have to be the same unit
 * of work, or the refusal it makes is a decision about a balance that no longer
 * exists by the time the postings land.
 *
 * Order matters and is the whole design:
 *
 *   1. Lock every involved account, ordered by id, in one statement.
 *   2. Read the derived balance of each user account being debited -- after the
 *      lock, so no concurrent transaction can move it underneath us.
 *   3. Refuse before writing anything, if the debit would take it below zero.
 *   4. Only then insert the journal entry and its postings.
 *
 * What it deliberately does NOT do is check that the postings sum to zero.
 * That check belongs to the deferred constraint trigger, which fires at COMMIT
 * and cannot be bypassed by a future caller, a migration, or a psql session.
 * Validating it here as well would move the apparent authority into TypeScript
 * and hide a trigger that had silently stopped working.
 */
export const postEntry = async (
  client: PoolClient,
  input: EntryInput,
): Promise<PostedEntry> => {
  const { kind, refType, refId, postings } = input;

  if (postings.length === 0) {
    throw new Error('postEntry requires at least one posting');
  }
  if (postings.some((p) => p.amountMinor === 0n)) {
    throw new Error('postEntry rejects zero-amount postings');
  }

  // 1. Deterministic lock over every account this entry touches.
  const accounts = await lockAccounts(
    client,
    postings.map((p) => p.account),
  );
  const userAccounts = new Set(accounts.filter((a) => a.kind === 'user').map((a) => a.id));

  // 2 & 3. An entry may post more than once to the same account, so the test is
  // the account's net movement within this entry, not each posting in isolation.
  const netByAccount = new Map<string, bigint>();
  for (const p of postings) {
    netByAccount.set(p.account, (netByAccount.get(p.account) ?? 0n) + p.amountMinor);
  }

  for (const [accountId, net] of [...netByAccount].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (net >= 0n || !userAccounts.has(accountId)) continue;

    const balance = await derivedBalanceTx(client, accountId);
    if (balance + net < 0n) {
      throw new RefusalError(
        'INSUFFICIENT_FUNDS',
        `Account ${accountId} holds ${balance} and cannot absorb a debit of ${-net}`,
        {
          accountId,
          balanceMinor: Number(balance),
          requestedMinor: Number(-net),
        },
      );
    }
  }

  // 4. Write the entry, then its postings. The deferred trigger re-checks the
  // sum at COMMIT and is what makes an unbalanced entry impossible.
  const entryResult = await client.query<{ id: bigint }>(
    `INSERT INTO journal_entries (kind, ref_type, ref_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [kind, refType ?? null, refId ?? null],
  );
  const entryId = entryResult.rows[0]!.id;

  const values: string[] = [];
  const params: unknown[] = [entryId];
  for (const p of postings) {
    params.push(p.account, p.amountMinor.toString());
    values.push(`($1, $${params.length - 1}, $${params.length}::BIGINT)`);
  }

  await client.query(
    `INSERT INTO postings (entry_id, account_id, amount_minor) VALUES ${values.join(', ')}`,
    params,
  );

  return { entryId, kind, postings };
};
