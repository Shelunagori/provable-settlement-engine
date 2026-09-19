/**
 * What each invariant claims, and the test that would fail if it stopped being
 * true. Kept in one place so the console and the proof drawers cannot drift
 * apart from each other.
 */
export type ProofKey = 'sum' | 'derived' | 'webhooks' | 'seed';

export const PROOF: Record<ProofKey, { title: string; body: string; test: string }> = {
  sum: {
    title: 'Every entry sums to zero',
    body: 'Each journal entry’s postings sum to zero, and so does the ledger as a whole. A deferred constraint trigger re-checks every entry at COMMIT and raises LEDGER_UNBALANCED, so the rule holds even for a hand-written INSERT that bypasses the application entirely. The figures shown are a live check: the global sum, and the count of entries whose own postings do not balance.',
    test: 'api/test/invariants/sum_is_zero.test.ts',
  },
  derived: {
    title: 'A balance is derived, never stored',
    body: 'A balance is SUM(postings.amount_minor) for an account, computed at read time. No table stores one and no endpoint accepts one; a write to /balance answers 404 by design. This card states the design rather than inspecting the schema live — the assertion that no base table carries a balance column runs in the test below.',
    test: 'api/test/invariants/balance_is_derived.test.ts',
  },
  webhooks: {
    title: 'A duplicate payment moves money once',
    body: 'A payment event is reserved by its id through INSERT … ON CONFLICT DO NOTHING, so concurrent duplicates block on the unique index and only one transaction moves money. The figures here are the ones the storm you ran actually returned; no cumulative webhook statistics are shown, because no endpoint reports them.',
    test: 'api/test/invariants/exactly_once.test.ts',
  },
  seed: {
    title: 'The outcome was committed in advance',
    body: 'The hash of the active server seed is published before the seed is used. The plaintext is never served while the seed is active — the query behind that endpoint does not even select the column — and is disclosed only on rotation, after which anyone can recompute every outcome it produced.',
    test: 'api/test/invariants/deterministic_outcome.test.ts',
  },
};
