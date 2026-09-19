import { useState } from 'react';
import { Badge, Card, Empty, HashValue, SectionHeading, Skeleton } from './ui.tsx';
import { credits } from './format-credits.ts';
import { formatMinor, relativeTime } from '../format.ts';
import type { BetRow } from '../types.ts';

const Outcome = ({ won }: { won: boolean | null }) =>
  won === null ? (
    <Badge tone="pending">Open</Badge>
  ) : won ? (
    <Badge tone="accent">Win</Badge>
  ) : (
    <Badge tone="refusal">Loss</Badge>
  );

const Proof = ({ bet }: { bet: BetRow }) => (
  <dl className="grid gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5 text-xs sm:grid-cols-2">
    <div className="sm:col-span-2">
      <dt className="text-muted">Round</dt>
      <dd className="mt-0.5">
        <HashValue value={bet.roundId} label="round id" tone="muted" head={8} tail={6} />
      </dd>
    </div>
    <div>
      <dt className="text-muted">Nonce</dt>
      <dd className="mono mt-0.5">{bet.nonce ?? '—'}</dd>
    </div>
    <div>
      <dt className="text-muted">Client seed</dt>
      <dd className="mono mt-0.5 truncate" title={bet.clientSeed}>
        {bet.clientSeed}
      </dd>
    </div>
    <div className="sm:col-span-2">
      <dt className="text-muted">Commitment</dt>
      <dd className="mt-0.5">
        {bet.seedHash ? (
          <HashValue value={bet.seedHash} label="commitment" />
        ) : (
          <span className="text-muted">—</span>
        )}
      </dd>
    </div>
  </dl>
);

/** Your own bets, newest first. A table on a wide screen, cards on a phone. */
export const RecentBets = ({ bets, loading }: { bets: BetRow[] | null; loading: boolean }) => {
  const [open, setOpen] = useState<string | null>(null);
  const rows = bets?.slice(0, 10) ?? [];

  return (
    <section id="bets" className="scroll-mt-20 pt-14">
      <SectionHeading eyebrow="History" title="Recent bets" />

      <Card as="div" className="p-2 sm:p-3">
        {loading && !bets && (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {bets && rows.length === 0 && <Empty>No bets yet. Place one above.</Empty>}

        {rows.length > 0 && (
          <>
            {/* Wide screens: one row per bet. */}
            <table className="hidden w-full text-sm sm:table">
              <caption className="sr-only">Your recent bets</caption>
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-2 py-2 text-left text-xs font-medium">Bet</th>
                  <th scope="col" className="px-2 py-2 text-left text-xs font-medium">Target</th>
                  <th scope="col" className="px-2 py-2 text-left text-xs font-medium">Result</th>
                  <th scope="col" className="px-2 py-2 text-left text-xs font-medium">Outcome</th>
                  <th scope="col" className="px-2 py-2 text-right text-xs font-medium">Payout</th>
                  <th scope="col" className="px-2 py-2 text-right text-xs font-medium">When</th>
                  <th scope="col" className="px-2 py-2 text-right text-xs font-medium">
                    <span className="sr-only">Proof</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-b border-line align-middle last:border-0">
                    <td className="num px-2 py-2.5">{formatMinor(b.amountMinor)}</td>
                    <td className="mono px-2 py-2.5">&lt;{b.targetUnder.toFixed(2)}</td>
                    <td className="num px-2 py-2.5">{b.roll?.toFixed(2) ?? '—'}</td>
                    <td className="px-2 py-2.5"><Outcome won={b.won} /></td>
                    <td className="num px-2 py-2.5 text-right">
                      {formatMinor(b.payoutMinor ?? 0)}
                    </td>
                    <td className="mono px-2 py-2.5 text-right text-xs text-muted">
                      {relativeTime(b.createdAt)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setOpen(open === b.id ? null : b.id)}
                        aria-expanded={open === b.id}
                        className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
                      >
                        {open === b.id ? 'Hide proof' : 'View proof'}
                      </button>
                    </td>
                  </tr>
                ))}
                {open && (
                  <tr>
                    <td colSpan={7} className="px-2 pb-3">
                      <Proof bet={rows.find((b) => b.id === open)!} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Phones: a card per bet, nothing to scroll sideways. */}
            <ul className="divide-y divide-line sm:hidden">
              {rows.map((b) => (
                <li key={b.id} className="px-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Outcome won={b.won} />
                    <span className="num text-sm">
                      {b.won ? `+${formatMinor(b.payoutMinor ?? 0)}` : `-${formatMinor(b.amountMinor)}`}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted">Bet</dt>
                      <dd className="num">{formatMinor(b.amountMinor)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Target</dt>
                      <dd className="mono">&lt;{b.targetUnder.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Result</dt>
                      <dd className="num">{b.roll?.toFixed(2) ?? '—'}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => setOpen(open === b.id ? null : b.id)}
                    aria-expanded={open === b.id}
                    className="mt-2 text-xs text-ink-2 underline underline-offset-2"
                  >
                    {open === b.id ? 'Hide proof' : 'View proof'}
                  </button>
                  {open === b.id && (
                    <div className="mt-2">
                      <Proof bet={b} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {rows.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Showing your last {rows.length} {rows.length === 1 ? 'bet' : 'bets'} · total staked{' '}
          {credits(rows.reduce((a, b) => a + b.amountMinor, 0))}
        </p>
      )}
    </section>
  );
};
