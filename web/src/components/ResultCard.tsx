import { Badge, Card, HashValue, MoneyFlow } from './ui.tsx';
import { formatMinor, formatSignedMinor } from '../format.ts';
import type { JournalEntry, PlacedBet } from '../types.ts';

/**
 * The centrepiece: the number first, what it cost or paid second, and the two
 * ledger movements underneath in the order they actually happened.
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

  return (
    <Card tier="primary" className="animate-rise overflow-hidden">
      <div className="grid gap-5 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Result</p>
          <p
            className={`num text-result font-semibold ${bet.won ? 'text-accent-text' : 'text-refusal'}`}
          >
            {bet.roll.toFixed(2)}
          </p>
          <p className="mt-1">
            <Badge tone={bet.won ? 'accent' : 'refusal'}>{bet.won ? 'Win' : 'Loss'}</Badge>
          </p>
        </div>

        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:min-w-[15rem]">
          <div className="flex items-baseline justify-between gap-6">
            <dt className="text-ink-2">Stake</dt>
            <dd className="num">{formatMinor(bet.bet.amountMinor)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <dt className="text-ink-2">Payout</dt>
            <dd className="num">{formatMinor(bet.payoutMinor)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <dt className="text-ink-2">Target under</dt>
            <dd className="num">{bet.bet.targetUnder.toFixed(2)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <dt className="shrink-0 text-ink-2">Round</dt>
            <dd className="min-w-0">
              <HashValue value={bet.bet.roundId} label="round id" tone="muted" head={6} tail={4} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-line px-5 py-5 sm:px-6">
        <h3 className="text-sm font-semibold">How the money moved</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="min-w-0">
            {lock ? (
              <MoneyFlow
                title="Stake reserved"
                entryId={bet.entryIds[0]}
                postings={lock.postings}
                format={formatSignedMinor}
              />
            ) : (
              <p className="text-xs text-muted">Postings load with the journal.</p>
            )}
          </div>
          <div className="min-w-0">
            {settle ? (
              <MoneyFlow
                title="Settlement"
                entryId={bet.entryIds[1]}
                postings={settle.postings}
                format={formatSignedMinor}
              />
            ) : (
              <p className="text-xs text-muted">Postings load with the journal.</p>
            )}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          Commitment
          <HashValue value={bet.seedHash} label="commitment hash" />
          · nonce <span className="mono">{bet.nonce}</span>
        </p>
      </div>
    </Card>
  );
};
