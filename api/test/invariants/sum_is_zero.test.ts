import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool, withTx } from '../../src/db.js';
import { postEntry } from '../../src/ledger/post.js';
import { ensureMigrated, resetLedger } from '../helpers.js';

/**
 * INVARIANT: the postings of a journal entry always sum to exactly 0, and
 * Postgres -- not TypeScript -- is what enforces it.
 *
 * The first test proves the enforcement point by going around the application
 * entirely: raw SQL, a real transaction, deliberately unbalanced postings. The
 * INSERTs must succeed (the constraint is DEFERRABLE INITIALLY DEFERRED) and
 * the COMMIT must be what refuses. If the check lived in postEntry() this test
 * would pass its INSERTs and its COMMIT, and fail.
 */
describe('sum_is_zero', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await closePool();
  });

  it('accepts unbalanced postings at INSERT and rejects them at COMMIT', async () => {
    const client = await getPool().connect();
    let entryId: bigint | undefined;
    let commitError: Error | undefined;

    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ id: bigint }>(
        `INSERT INTO journal_entries (kind, ref_type, ref_id)
         VALUES ('deposit', 'webhook_event', 'evt_unbalanced') RETURNING id`,
      );
      entryId = rows[0]!.id;

      // -1000 in, +900 out. Deliberately 100 minor units short.
      await client.query(
        `INSERT INTO postings (entry_id, account_id, amount_minor)
         VALUES ($1, 'gateway', -1000)`,
        [entryId],
      );
      await client.query(
        `INSERT INTO postings (entry_id, account_id, amount_minor)
         VALUES ($1, 'user:demo', 900)`,
        [entryId],
      );

      // Both INSERTs are still visible inside this transaction: the constraint
      // is deferred, so nothing has been checked yet.
      const midTx = await client.query<{ n: string }>(
        'SELECT COUNT(*)::TEXT AS n FROM postings WHERE entry_id = $1',
        [entryId],
      );
      expect(midTx.rows[0]!.n).toBe('2');

      try {
        await client.query('COMMIT');
      } catch (err) {
        commitError = err as Error;
        // The transaction is already aborted and rolled back by Postgres.
      }
    } finally {
      client.release();
    }

    expect(commitError).toBeDefined();
    expect(commitError!.message).toContain('LEDGER_UNBALANCED');

    // The rollback took the journal entry with it: nothing was persisted.
    const after = await getPool().query<{ entries: string; postings: string }>(
      `SELECT (SELECT COUNT(*) FROM journal_entries)::TEXT AS entries,
              (SELECT COUNT(*) FROM postings)::TEXT AS postings`,
    );
    expect(after.rows[0]).toEqual({ entries: '0', postings: '0' });
  });

  it('posts inside the caller transaction, so a caller rollback takes it with it', async () => {
    // postEntry() must never open or commit a transaction of its own. If it
    // did, the balance it read and the postings it wrote would be separate
    // units of work -- and this entry would survive the caller's abort.
    const before = await getPool().query<{ n: bigint }>(
      'SELECT COUNT(*)::BIGINT AS n FROM journal_entries',
    );

    await expect(
      withTx(async (c) => {
        await postEntry(c, {
          kind: 'deposit',
          refType: 'webhook_event',
          refId: 'evt_rolled_back',
          postings: [
            { account: 'gateway', amountMinor: -400n },
            { account: 'user:demo', amountMinor: 400n },
          ],
        });
        throw new Error('caller aborts after posting');
      }),
    ).rejects.toThrow('caller aborts after posting');

    const after = await getPool().query<{ n: bigint; p: bigint }>(
      `SELECT (SELECT COUNT(*) FROM journal_entries)::BIGINT AS n,
              (SELECT COUNT(*) FROM postings)::BIGINT AS p`,
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    expect(after.rows[0]!.p).toBe(0n);
  });

  it('holds across 200 entries posted through postEntry()', async () => {
    // A running mirror of the user balance so the test only posts entries that
    // are legitimately fundable. This is bookkeeping for the test, not an
    // assertion target -- the assertions all read the ledger back.
    let userBalance = 0n;
    const entriesPosted: bigint[] = [];

    for (let i = 0; i < 200; i += 1) {
      // Floor of 100 minor units: the three-posting branch takes a tenth as
      // commission, and a zero-amount posting is rejected by design, so the
      // generator must not be able to produce one.
      const amount = BigInt(100 + Math.floor(Math.random() * 5_000));

      await withTx(async (c) => {
        if (i % 3 === 2 && userBalance > amount) {
          // Three-posting entry: user pays, split between treasury and affiliate.
          const commission = amount / 10n;
          const toTreasury = amount - commission;
          const { entryId } = await postEntry(c, {
            kind: 'bet_settle',
            refType: 'bet',
            refId: `bet_${i}`,
            postings: [
              { account: 'user:demo', amountMinor: -amount },
              { account: 'treasury', amountMinor: toTreasury },
              { account: 'affiliate:alice', amountMinor: commission },
            ],
          });
          entriesPosted.push(entryId);
          userBalance -= amount;
        } else {
          const { entryId } = await postEntry(c, {
            kind: 'deposit',
            refType: 'webhook_event',
            refId: `evt_${i}`,
            postings: [
              { account: 'gateway', amountMinor: -amount },
              { account: 'user:demo', amountMinor: amount },
            ],
          });
          entriesPosted.push(entryId);
          userBalance += amount;
        }
      });
    }

    expect(entriesPosted).toHaveLength(200);
    expect(new Set(entriesPosted).size).toBe(200);

    // Every individual entry balances.
    const unbalanced = await getPool().query<{ entry_id: bigint; s: bigint }>(
      `SELECT entry_id, SUM(amount_minor)::BIGINT AS s
       FROM postings GROUP BY entry_id HAVING SUM(amount_minor) <> 0`,
    );
    expect(unbalanced.rows).toEqual([]);

    // And the ledger as a whole balances.
    const total = await getPool().query<{ total: bigint }>(
      'SELECT COALESCE(SUM(amount_minor), 0)::BIGINT AS total FROM postings',
    );
    expect(total.rows[0]!.total).toBe(0n);

    const counted = await getPool().query<{ entries: bigint }>(
      'SELECT COUNT(*)::BIGINT AS entries FROM journal_entries',
    );
    expect(counted.rows[0]!.entries).toBe(200n);
  });
});
