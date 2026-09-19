import { useState } from 'react';
import { Drawer } from './Drawer.tsx';
import { shortHash } from '../format.ts';
import type { Commitment, Invariants, StormResult } from '../types.ts';

type PillKey = 'sum' | 'derived' | 'webhooks' | 'seed';

const PROOF: Record<PillKey, { title: string; body: string; test: string }> = {
  sum: {
    title: 'Σ postings = 0',
    body: 'Every journal entry’s postings sum to zero, and so does the ledger as a whole. A deferred constraint trigger re-checks each entry at COMMIT and raises LEDGER_UNBALANCED, so the rule holds even for a hand-written INSERT. This pill polls the live check, which counts the global sum and any entry whose own postings do not balance.',
    test: 'api/test/invariants/sum_is_zero.test.ts',
  },
  derived: {
    title: 'Balance is derived',
    body: 'A balance is SUM(postings.amount_minor) for an account, computed at read time. No table stores one and no endpoint accepts one; PUT /balance answers 404 by design. This pill states the design rather than inspecting the schema live — the assertion that no base table carries a balance column runs in the test below.',
    test: 'api/test/invariants/balance_is_derived.test.ts',
  },
  webhooks: {
    title: 'Duplicate payment events',
    body: 'A payment event is reserved by its id through INSERT … ON CONFLICT DO NOTHING, so concurrent duplicates block on the unique index and only one transaction moves money. The figures here are the ones the storm you ran actually returned; no cumulative webhook statistics are shown, because no endpoint reports them.',
    test: 'api/test/invariants/exactly_once.test.ts',
  },
  seed: {
    title: 'Seed commitment',
    body: 'The hash of the active server seed is published before the seed is used. The plaintext is never served while the seed is active — the query that answers this endpoint does not even select that column — and is disclosed only on rotation, after which anyone can recompute every outcome it produced.',
    test: 'api/test/invariants/deterministic_outcome.test.ts',
  },
};

const Pill = ({
  onOpen,
  tone,
  children,
}: {
  onOpen: () => void;
  tone: 'ok' | 'bad' | 'idle' | 'info';
  children: React.ReactNode;
}) => {
  const dot =
    tone === 'ok' ? 'bg-accent' : tone === 'bad' ? 'bg-refusal' : tone === 'info' ? 'bg-fairness' : 'bg-pending';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-left hover:border-muted"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="num text-[11px]">{children}</span>
    </button>
  );
};

export const InvariantsStrip = ({
  invariants,
  commitment,
  storm,
}: {
  invariants: Invariants | null;
  commitment: Commitment | null;
  storm: StormResult | null;
}) => {
  const [open, setOpen] = useState<PillKey | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Pill onOpen={() => setOpen('sum')} tone={invariants ? (invariants.sumIsZero ? 'ok' : 'bad') : 'idle'}>
          {invariants
            ? invariants.sumIsZero
              ? 'Σ postings = 0 ✓'
              : `Σ postings ≠ 0 · ${invariants.unbalancedEntries} bad`
            : 'Σ postings …'}
        </Pill>

        <Pill onOpen={() => setOpen('derived')} tone="ok">
          balance: derived (no column) ✓
        </Pill>

        <Pill onOpen={() => setOpen('webhooks')} tone={storm ? 'ok' : 'idle'}>
          {storm
            ? `webhooks: ${storm.sent} received / ${storm.posted} posted / ${storm.deduplicated} deduped`
            : 'webhooks: run storm'}
        </Pill>

        <Pill onOpen={() => setOpen('seed')} tone="info">
          {commitment
            ? `seed: ${shortHash(commitment.seedHash)} · nonce ${commitment.nonce}`
            : 'seed: …'}
        </Pill>
      </div>

      <Drawer
        open={open !== null}
        title={open ? PROOF[open].title : ''}
        onClose={() => setOpen(null)}
      >
        {open && (
          <>
            <p>{PROOF[open].body}</p>
            <p className="num text-[11px] text-muted">Proof: {PROOF[open].test}</p>
          </>
        )}
      </Drawer>
    </>
  );
};
