import { useState, type ReactNode } from 'react';
import { Button, Card, Disclosure, HashValue } from './ui.tsx';
import { HelpTip } from './HelpTip.tsx';
import { RangeMeter } from './RangeMeter.tsx';
import { RefusalCard } from './RefusalCard.tsx';
import { credits, potentialPayoutMinor, winChance } from './format-credits.ts';
import { formatMinor } from '../format.ts';
import type { useEngine } from '../hooks/useEngine.ts';
import type { Commitment, Me } from '../types.ts';

const AMOUNT_PRESETS = [100, 500, 1000, 2500];

const Field = ({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </label>
      {help}
    </span>
    {children}
  </div>
);

const inputClass =
  'mono w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink focus-visible:border-muted';

export const BetCard = ({
  engine,
  me,
  commitment,
  amount,
  setAmount,
  target,
  setTarget,
  clientSeed,
  setClientSeed,
  onAddCredits,
}: {
  engine: ReturnType<typeof useEngine>;
  me: Me | null;
  commitment: Commitment | null;
  amount: string;
  setAmount: (v: string) => void;
  target: string;
  setTarget: (v: string) => void;
  clientSeed: string;
  setClientSeed: (v: string) => void;
  onAddCredits: () => void;
}) => {
  const [showSeed, setShowSeed] = useState(false);

  const amountMinor = Math.round(Number(amount) * 100);
  const targetUnder = Number(target);
  const balance = me?.balanceMinor ?? 0;
  const empty = me !== null && balance === 0;

  // Format checks only, so the controls are not dead while something is
  // obviously incomplete. Stake limits, funds and target range are the server's
  // to decide, and a refusal from it is shown rather than pre-empted.
  const amountValid = Number.isFinite(amountMinor) && amountMinor > 0;
  const targetValid = Number.isFinite(targetUnder) && targetUnder > 0;
  const canBet = !empty && amountValid && targetValid;

  const payout = potentialPayoutMinor(amountMinor, targetUnder);

  return (
    <Card tier="primary" className="p-5 sm:p-6" as="div">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Place a bet</h2>

      {empty ? (
        <div className="mt-5">
          <p className="text-lg font-semibold">Add credits before placing a bet.</p>
          <p className="mt-1 text-sm text-ink-2">
            Credits are free and only exist in this demo.
          </p>
          <div className="mt-4">
            <Button variant="primary" size="lg" onClick={onAddCredits} busy={engine.busy === 'deposit'}>
              Add 10 credits
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="amount" label="Bet amount">
              <input
                id="amount"
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {AMOUNT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(formatMinor(p))}
                    className={`mono rounded-md border px-2 py-1 text-xs ${
                      amountMinor === p
                        ? 'border-accent-border bg-accent-soft text-accent-text'
                        : 'border-line text-muted hover:text-ink'
                    }`}
                  >
                    {formatMinor(p)}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              id="target"
              label="Target"
              help={
                <HelpTip label="What does the target mean?">
                  The server generates a number from 0.00 to 99.99. You win when the result is
                  below your target.
                  <br />
                  <br />
                  Example: target <span className="mono">50.00</span>, result{' '}
                  <span className="mono">41.72</span> → you win.
                </HelpTip>
              }
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-ink-2">Roll under</span>
                <input
                  id="target"
                  className={inputClass}
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </div>
              <input
                id="targetRange"
                type="range"
                aria-label="Target"
                min={100}
                max={9800}
                step={1}
                value={Math.round(targetUnder * 100) || 100}
                onChange={(e) => setTarget((Number(e.target.value) / 100).toFixed(2))}
                className="w-full accent-[var(--c-accent)]"
              />
            </Field>
          </div>

          {targetValid && <RangeMeter target={targetUnder} />}

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-muted">Potential payout</dt>
              <dd className="num mt-0.5 text-lg font-semibold">{credits(payout)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
              <dt className="text-[11px] uppercase tracking-wider text-muted">Win chance</dt>
              <dd className="num mt-0.5 text-lg font-semibold">
                {winChance(targetUnder).toFixed(2)}%
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <Button
              variant="primary"
              size="lg"
              disabled={!canBet}
              busy={engine.busy === 'bet'}
              onClick={() =>
                void engine.placeBet(
                  { amountMinor, targetUnder: targetUnder.toFixed(2), clientSeed },
                  commitment ? { seedHash: commitment.seedHash } : {},
                )
              }
            >
              Place bet
            </Button>
            <p className="mt-2 text-xs text-muted">
              The server settles every bet. This page only shows what it decided.
            </p>
          </div>

          <Disclosure summary="Advanced betting details" className="mt-4">
            <div className="space-y-2">
              <div>
                <label htmlFor="clientSeed" className="text-muted">
                  Client seed
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="clientSeed"
                    className="mono w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                    onFocus={() => setShowSeed(true)}
                  />
                  <Button variant="secondary" size="sm" onClick={() => setClientSeed(crypto.randomUUID())}>
                    New
                  </Button>
                </div>
                {showSeed && (
                  <p className="mt-1 text-muted">Yours to choose — it goes into the result.</p>
                )}
              </div>
              <div>
                <p className="text-muted">Commitment (published before your bet)</p>
                <div className="mt-1">
                  {commitment ? (
                    <HashValue value={commitment.seedHash} label="commitment" />
                  ) : (
                    <span className="text-muted">…</span>
                  )}
                </div>
              </div>
              <p className="text-muted">
                Next nonce <span className="mono">{commitment?.nonce ?? '—'}</span>
              </p>
            </div>
          </Disclosure>
        </>
      )}

      {engine.refusal && (
        <div className="mt-4 animate-rise">
          <RefusalCard status={engine.refusal.status} body={engine.refusal.body} />
        </div>
      )}
      {engine.failure && (
        <p className="mt-4 border-l-2 border-refusal pl-3 text-sm text-refusal">
          {engine.failure.message}
        </p>
      )}
    </Card>
  );
};
