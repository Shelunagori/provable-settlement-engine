import { Button, Card, Disclosure, HashValue, MoneyFlow } from './ui.tsx';
import { RangeMeter } from './RangeMeter.tsx';
import { credits } from './format-credits.ts';
import { formatMinor, formatSignedMinor } from '../format.ts';
import type { JournalEntry, Me, PlacedBet } from '../types.ts';

const Figure = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
  <div>
    <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
    <dd className={`num mt-0.5 ${strong ? 'text-2xl font-semibold' : 'text-lg'}`}>{value}</dd>
  </div>
);

/**
 * Won or lost, in the largest type on the page, with the three numbers that
 * answer "what just happened to my money". Journal entries are underneath, for
 * anyone who wants them.
 */
export const ResultCard = ({
  bet,
  me,
  entries,
  onPlayAgain,
  onVerify,
}: {
  bet: PlacedBet;
  me: Me | null;
  entries: JournalEntry[] | null;
  onPlayAgain: () => void;
  onVerify: () => void;
}) => {
  const byId = (id: number) => entries?.find((e) => e.id === id) ?? null;
  const lock = byId(bet.entryIds[0]);
  const settle = byId(bet.entryIds[1]);

  return (
    <Card tier="primary" className="animate-rise overflow-hidden" as="div">
      <div className="px-5 py-6 sm:px-6">
        <p
          className={`text-lg font-semibold uppercase tracking-[0.12em] ${
            bet.won ? 'text-accent-text' : 'text-refusal'
          }`}
        >
          {bet.won ? 'You won ✓' : 'You lost'}
        </p>

        <p
          className={`num mt-3 text-result font-semibold ${
            bet.won ? 'text-accent-text' : 'text-refusal'
          }`}
        >
          {bet.roll.toFixed(2)}
        </p>
        <p className="text-sm text-ink-2">
          Result — you needed below{' '}
          <span className="mono text-ink">{bet.bet.targetUnder.toFixed(2)}</span>
        </p>

        <div className="mt-4 max-w-xl">
          <RangeMeter target={bet.bet.targetUnder} result={bet.roll} won={bet.won} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Figure label="Your bet" value={credits(bet.bet.amountMinor)} />
          <Figure label="Your target" value={bet.bet.targetUnder.toFixed(2)} />
          <Figure
            label={bet.won ? 'Payout' : 'Lost'}
            value={credits(bet.won ? bet.payoutMinor : bet.bet.amountMinor)}
          />
          <Figure
            label="New balance"
            value={me ? formatMinor(me.balanceMinor) : '—'}
            strong
          />
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={onPlayAgain}>
            Place another bet
          </Button>
          <Button variant="ghost" onClick={onVerify}>
            Verify fairness
          </Button>
        </div>
      </div>

      <Disclosure summary="Where the money went" className="border-t border-line px-5 py-4 sm:px-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="min-w-0">
            {lock ? (
              <MoneyFlow
                title="Stake reserved"
                entryId={bet.entryIds[0]}
                postings={lock.postings}
                format={formatSignedMinor}
              />
            ) : (
              <p className="text-muted">Postings load with the journal.</p>
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
              <p className="text-muted">Postings load with the journal.</p>
            )}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-muted">Round</span>
          <HashValue value={bet.bet.roundId} label="round id" tone="muted" head={6} tail={4} />
          <span className="text-muted">· nonce</span>
          <span className="mono">{bet.nonce}</span>
        </p>
      </Disclosure>
    </Card>
  );
};
