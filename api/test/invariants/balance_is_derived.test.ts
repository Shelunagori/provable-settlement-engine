import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closePool, getPool, withTx } from '../../src/db.js';
import { postEntry } from '../../src/ledger/post.js';
import { getBalance, listAccountBalances } from '../../src/ledger/balance.js';
import { buildServer } from '../../src/server.js';
import { ensureMigrated, resetLedger } from '../helpers.js';

/**
 * INVARIANT: a balance is never stored. It is SUM(postings.amount_minor) for an
 * account, computed at read time, and there is no way -- through SQL or through
 * the API -- to set one directly.
 */
describe('balance_is_derived', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await ensureMigrated();
    app = await buildServer();
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it('has no stored balance column on any base table', async () => {
    // Views are excluded deliberately: account_balances exposes a derived
    // column called balance_minor, which is the whole point of the design. The
    // assertion is about storage, so it is scoped to BASE TABLE only.
    const { rows } = await getPool().query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
       WHERE c.table_schema = 'public'
         AND t.table_type = 'BASE TABLE'
         AND c.column_name IN ('balance', 'balance_minor')
       ORDER BY c.table_name, c.column_name`,
    );
    expect(rows).toEqual([]);
  });

  it('still exposes the derived balance through the view, proving the scope is right', async () => {
    const { rows } = await getPool().query<{ table_type: string }>(
      `SELECT table_type FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'account_balances'`,
    );
    expect(rows[0]?.table_type).toBe('VIEW');

    const cols = await getPool().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'account_balances'
       ORDER BY column_name`,
    );
    expect(cols.rows.map((r) => r.column_name)).toContain('balance_minor');
  });

  it('derives a balance from postings and moves only when postings change', async () => {
    expect(await getBalance('user:demo')).toBe(0n);

    await withTx((c) =>
      postEntry(c, {
        kind: 'deposit',
        refType: 'webhook_event',
        refId: 'evt_derived_1',
        postings: [
          { account: 'gateway', amountMinor: -1000n },
          { account: 'user:demo', amountMinor: 1000n },
        ],
      }),
    );

    expect(await getBalance('user:demo')).toBe(1000n);
    expect(await getBalance('gateway')).toBe(-1000n);

    const postingCountBefore = await getPool().query<{ n: bigint }>(
      'SELECT COUNT(*)::BIGINT AS n FROM postings',
    );
    expect(postingCountBefore.rows[0]!.n).toBe(2n);

    await withTx((c) =>
      postEntry(c, {
        kind: 'deposit',
        refType: 'webhook_event',
        refId: 'evt_derived_2',
        postings: [
          { account: 'gateway', amountMinor: -250n },
          { account: 'user:demo', amountMinor: 250n },
        ],
      }),
    );

    // The balance moved by exactly the postings that were added, and by nothing else.
    expect(await getBalance('user:demo')).toBe(1250n);
    const postingCountAfter = await getPool().query<{ n: bigint }>(
      'SELECT COUNT(*)::BIGINT AS n FROM postings',
    );
    expect(postingCountAfter.rows[0]!.n).toBe(4n);

    // The listing agrees with the per-account query, and the whole set sums to 0.
    const listed = await listAccountBalances();
    const byId = new Map(listed.map((a) => [a.accountId, a.balanceMinor]));
    expect(byId.get('user:demo')).toBe(1250n);
    expect(byId.get('gateway')).toBe(-1250n);
    expect(listed.reduce((acc, a) => acc + a.balanceMinor, 0n)).toBe(0n);
  });

  it('recomputes from scratch: deleting the derivation source is the only way to change it', async () => {
    await withTx((c) =>
      postEntry(c, {
        kind: 'deposit',
        refType: 'webhook_event',
        refId: 'evt_derived_3',
        postings: [
          { account: 'gateway', amountMinor: -777n },
          { account: 'user:demo', amountMinor: 777n },
        ],
      }),
    );
    expect(await getBalance('user:demo')).toBe(777n);

    // Postings are append-only: there is no UPDATE path to a different balance.
    await expect(
      getPool().query('UPDATE postings SET amount_minor = 999999 WHERE account_id = $1', [
        'user:demo',
      ]),
    ).rejects.toThrow(/LEDGER_IMMUTABLE/);

    expect(await getBalance('user:demo')).toBe(777n);
  });

  it('refuses a debit the derived balance cannot absorb, before writing anything', async () => {
    // Minimal coverage of the one refusal the ledger core can reach on its own.
    // The rest of the refusal table belongs to the engine that can trigger it.
    await withTx((c) =>
      postEntry(c, {
        kind: 'deposit',
        refType: 'webhook_event',
        refId: 'evt_funds',
        postings: [
          { account: 'gateway', amountMinor: -500n },
          { account: 'user:demo', amountMinor: 500n },
        ],
      }),
    );

    const before = await getPool().query<{ n: bigint }>(
      'SELECT COUNT(*)::BIGINT AS n FROM journal_entries',
    );

    await expect(
      withTx((c) =>
        postEntry(c, {
          kind: 'bet_lock',
          refType: 'bet',
          refId: 'bet_overdraw',
          postings: [
            { account: 'user:demo', amountMinor: -501n },
            { account: 'pending_bets', amountMinor: 501n },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS', httpStatus: 409 });

    // Refused before any money moved: no journal entry was even created.
    const after = await getPool().query<{ n: bigint }>(
      'SELECT COUNT(*)::BIGINT AS n FROM journal_entries',
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    expect(await getBalance('user:demo')).toBe(500n);
  });

  it('PUT /balance returns the documented 404 refusal', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/balance',
      payload: { accountId: 'user:demo', balanceMinor: 999999 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      refused: true,
      code: 'NO_SUCH_ENDPOINT',
      message: 'Balance is derived from postings and cannot be written.',
    });
  });
});
