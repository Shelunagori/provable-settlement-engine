import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool, withTx } from '../src/db.js';
import { postEntry } from '../src/ledger/post.js';
import { getBalance } from '../src/ledger/balance.js';
import { ensureMigrated, resetLedger } from './helpers.js';

/**
 * The funds guard applies to each negative posting against a user account,
 * accumulated across the entry and measured against the balance the account
 * held when the entry began.
 *
 * Two shapes make the contract precise, and neither is hypothetical -- a
 * settlement entry naturally debits and credits the same user account, and a
 * multi-leg entry naturally debits it more than once:
 *
 *   - A credit in the same entry must not fund a debit in that entry. Money
 *     that this entry is itself creating cannot be collateral for it.
 *   - Two debits in one entry must be measured together. Checking each against
 *     the untouched starting balance would let 1000 absorb -600 twice.
 */
describe('funds guard', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await closePool();
  });

  const fund = async (amountMinor: bigint): Promise<void> => {
    await withTx((c) =>
      postEntry(c, {
        kind: 'deposit',
        refType: 'webhook_event',
        refId: `evt_fund_${amountMinor}`,
        postings: [
          { account: 'gateway', amountMinor: -amountMinor },
          { account: 'user:demo', amountMinor },
        ],
      }),
    );
  };

  const counts = async (): Promise<{ entries: bigint; postings: bigint }> => {
    const { rows } = await getPool().query<{ entries: bigint; postings: bigint }>(
      `SELECT (SELECT COUNT(*) FROM journal_entries)::BIGINT AS entries,
              (SELECT COUNT(*) FROM postings)::BIGINT AS postings`,
    );
    return rows[0]!;
  };

  it('refuses when a same-entry credit would be the only thing funding the debit', async () => {
    expect(await getBalance('user:demo')).toBe(0n);
    const before = await counts();

    await expect(
      withTx((c) =>
        postEntry(c, {
          kind: 'bet_settle',
          refType: 'bet',
          refId: 'bet_self_funded',
          postings: [
            { account: 'user:demo', amountMinor: -1000n },
            { account: 'user:demo', amountMinor: 1000n },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS', httpStatus: 409 });

    // Refused before the journal entry was created: nothing at all persisted.
    expect(await counts()).toEqual(before);
    expect(await getBalance('user:demo')).toBe(0n);
  });

  it('refuses two debits in one entry that together exceed the starting balance', async () => {
    await fund(1000n);
    expect(await getBalance('user:demo')).toBe(1000n);
    const before = await counts();

    await expect(
      withTx((c) =>
        postEntry(c, {
          kind: 'bet_lock',
          refType: 'bet',
          refId: 'bet_double_debit',
          postings: [
            { account: 'user:demo', amountMinor: -600n },
            { account: 'user:demo', amountMinor: -600n },
            { account: 'pending_bets', amountMinor: 1200n },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS', httpStatus: 409 });

    expect(await counts()).toEqual(before);
    expect(await getBalance('user:demo')).toBe(1000n);
  });

  it('allows a single debit the starting balance covers', async () => {
    await fund(1000n);
    const before = await counts();

    const { entryId } = await withTx((c) =>
      postEntry(c, {
        kind: 'bet_lock',
        refType: 'bet',
        refId: 'bet_affordable',
        postings: [
          { account: 'user:demo', amountMinor: -600n },
          { account: 'pending_bets', amountMinor: 600n },
        ],
      }),
    );

    expect(entryId).toBeGreaterThan(0n);
    expect(await getBalance('user:demo')).toBe(400n);
    expect(await getBalance('pending_bets')).toBe(600n);

    const after = await counts();
    expect(after.entries).toBe(before.entries + 1n);
    expect(after.postings).toBe(before.postings + 2n);
  });

  it('allows two debits in one entry that together fit', async () => {
    await fund(1000n);

    await withTx((c) =>
      postEntry(c, {
        kind: 'bet_lock',
        refType: 'bet',
        refId: 'bet_two_small',
        postings: [
          { account: 'user:demo', amountMinor: -400n },
          { account: 'user:demo', amountMinor: -600n },
          { account: 'pending_bets', amountMinor: 1000n },
        ],
      }),
    );

    expect(await getBalance('user:demo')).toBe(0n);
    expect(await getBalance('pending_bets')).toBe(1000n);
  });
});
