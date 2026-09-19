import { getPool } from '../db.js';
import type { EntryKind, Posting, RefType } from './post.js';

export type JournalEntryView = {
  id: bigint;
  kind: EntryKind;
  ref: { type: RefType | null; id: string | null };
  createdAt: Date;
  postings: Posting[];
  sum: bigint;
};

export type LedgerInvariants = {
  sumIsZero: boolean;
  totalPostings: bigint;
  lastEntryId: bigint;
  totalAmountMinor: bigint;
  unbalancedEntries: bigint;
  checkedAt: string;
};

/**
 * Entries newest first, each with its postings and the sum of those postings.
 * The sum is computed per response rather than stored, so a reader can see the
 * invariant holding on the same data they are looking at.
 */
export const listEntries = async (limit: number): Promise<JournalEntryView[]> => {
  const pool = getPool();

  const { rows: entries } = await pool.query<{
    id: bigint;
    kind: EntryKind;
    ref_type: RefType | null;
    ref_id: string | null;
    created_at: Date;
  }>(
    `SELECT id, kind, ref_type, ref_id, created_at
     FROM journal_entries
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );

  if (entries.length === 0) return [];

  const { rows: postings } = await pool.query<{
    entry_id: bigint;
    account_id: string;
    amount_minor: bigint;
  }>(
    `SELECT entry_id, account_id, amount_minor
     FROM postings
     WHERE entry_id = ANY($1::bigint[])
     ORDER BY entry_id DESC, id ASC`,
    [entries.map((e) => e.id.toString())],
  );

  const byEntry = new Map<string, Posting[]>();
  for (const p of postings) {
    const key = p.entry_id.toString();
    const list = byEntry.get(key) ?? [];
    list.push({ account: p.account_id, amountMinor: p.amount_minor });
    byEntry.set(key, list);
  }

  return entries.map((e) => {
    const entryPostings = byEntry.get(e.id.toString()) ?? [];
    return {
      id: e.id,
      kind: e.kind,
      ref: { type: e.ref_type, id: e.ref_id },
      createdAt: e.created_at,
      postings: entryPostings,
      sum: entryPostings.reduce((acc, p) => acc + p.amountMinor, 0n),
    };
  });
};

/**
 * A live check, run against the database every time it is asked for. Nothing
 * here is cached or assumed: `sumIsZero` is false the moment the ledger stops
 * balancing, either globally or for any single entry.
 */
export const checkInvariants = async (): Promise<LedgerInvariants> => {
  const pool = getPool();

  const { rows } = await pool.query<{
    total_amount: bigint;
    total_postings: bigint;
    last_entry_id: bigint;
    unbalanced_entries: bigint;
  }>(
    `SELECT
       (SELECT COALESCE(SUM(amount_minor), 0) FROM postings)::BIGINT        AS total_amount,
       (SELECT COUNT(*) FROM postings)::BIGINT                              AS total_postings,
       (SELECT COALESCE(MAX(id), 0) FROM journal_entries)::BIGINT           AS last_entry_id,
       (SELECT COUNT(*) FROM (
          SELECT entry_id FROM postings
          GROUP BY entry_id
          HAVING SUM(amount_minor) <> 0
        ) AS bad)::BIGINT                                                   AS unbalanced_entries`,
  );

  const r = rows[0]!;
  return {
    sumIsZero: r.total_amount === 0n && r.unbalanced_entries === 0n,
    totalPostings: r.total_postings,
    lastEntryId: r.last_entry_id,
    totalAmountMinor: r.total_amount,
    unbalancedEntries: r.unbalanced_entries,
    checkedAt: new Date().toISOString(),
  };
};
