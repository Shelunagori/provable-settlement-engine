import { Badge, Card, Copy, PostingRows } from './ui.tsx';
import { accountLabel, formatMinor, formatSignedMinor } from '../format.ts';
import type { JournalEntry, PlacedBet } from '../types.ts';

/**
 * The moment the demo exists for: what the roll was, whether it won, what
 * changed in the ledger, and the identifiers needed to verify it later.
 */
export const ResultCard = ({
  bet,
  entries,
}: {
  bet: PlacedBet;
  entries: JournalEntry[] | null;
}) => {
  const byId = (id: number) => entries?.find((e) => e.id === id) ?? null;
  const lock = byId(bet.entryIds[0]);
  const settle = byId(bet.entryIds[1]);
  const tone = bet.won ? 'accent' : 'refusal';
  const rollTone = bet.won ? 'text-accent' : 'text-refusal';

  return (
    <Card className="animate-rise overflow-hidden" raised>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Roll (0.00 – 99.99)
          </p>
          <p className={`num text-result font-semibold ${rollTone}`}>{bet.roll.toFixed(2)}</p>
          <p className="mt-1 text-sm text-muted">
            Target was under {bet.bet.targetUnder.toFixed(2)} — the roll must be strictly
            below it.
          </p>
        </div>
        <div className="text-right">
          <Badge tone={tone}>{bet.won ? 'Won' : 'Lost'}</Badge>
          <p className="num mt-2 text-2xl font-semibold">
            {bet.won ? formatMinor(bet.payoutMinor) : formatSignedMinor(-bet.bet.amountMinor)}
          </p>
          <p className="text-xs text-muted">{bet.won ? 'paid out' : 'stake kept by treasury'}</p>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:px-6 md:grid-cols-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Money moved: stake held</h4>
          <p className="mt-1 text-xs text-muted">Entry #{bet.entryIds[0]}</p>
          <div className="mt-2">
            {lock ? (
              <PostingRows postings={lock.postings} format={formatSignedMinor} />
            ) : (
              <p className="text-xs text-muted">Postings load with the journal.</p>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Money moved: settled</h4>
          <p className="mt-1 text-xs text-muted">Entry #{bet.entryIds[1]}</p>
          <div className="mt-2">
            {settle ? (
              <PostingRows postings={settle.postings} format={formatSignedMinor} />
            ) : (
              <p className="text-xs text-muted">Postings load with the journal.</p>
            )}
          </div>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-2 border-t border-line px-5 py-4 text-xs sm:grid-cols-2 sm:px-6">
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted">Round</dt>
          <dd className="mono min-w-0 break-all">{bet.bet.roundId}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted">Nonce</dt>
          <dd className="mono">{bet.nonce}</dd>
        </div>
        <div className="flex items-baseline gap-2 sm:col-span-2">
          <dt className="w-20 shrink-0 text-muted">Commitment</dt>
          <dd className="mono flex min-w-0 items-baseline gap-2 break-all text-fairness">
            {bet.seedHash}
            <Copy value={bet.seedHash} label="commitment hash" />
          </dd>
        </div>
        <div className="flex items-baseline gap-2 sm:col-span-2">
          <dt className="w-20 shrink-0 text-muted">Accounts</dt>
          <dd className="text-muted">
            {['user:demo', 'pending_bets', 'treasury'].map(accountLabel).join(' · ')}
          </dd>
        </div>
      </dl>
    </Card>
  );
};
