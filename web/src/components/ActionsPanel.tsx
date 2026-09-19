import { useState } from 'react';
import { ApiError, api } from '../api.ts';
import { formatMinor, multiplierFor } from '../format.ts';
import { RefusalCard } from './RefusalCard.tsx';
import { RefusalTable } from './RefusalTable.tsx';
import { Panel } from './Panel.tsx';
import type { Commitment, Me, PlacedBet, RefusalRow, StormResult } from '../types.ts';

type Outcome =
  | { kind: 'refusal'; status: number; body: Record<string, unknown> }
  | { kind: 'error'; message: string }
  | null;

const Button = ({
  onClick,
  busy,
  children,
  tone = 'default',
}: {
  onClick: () => void;
  busy?: boolean;
  children: React.ReactNode;
  tone?: 'default' | 'primary';
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    className={`rounded border px-2.5 py-1.5 text-xs disabled:opacity-50 ${
      tone === 'primary'
        ? 'border-accent/50 text-accent hover:border-accent'
        : 'border-line text-ink hover:border-muted'
    }`}
  >
    {busy ? '…' : children}
  </button>
);

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-[11px] uppercase tracking-wide text-muted">
      {label}
    </label>
    {children}
  </div>
);

const inputClass =
  'num w-full rounded border border-line bg-bg px-2 py-1 text-xs text-ink focus-visible:border-muted';

export const ActionsPanel = ({
  me,
  commitment,
  refusals,
  onChanged,
  onStorm,
  toast,
}: {
  me: Me | null;
  commitment: Commitment | null;
  refusals: RefusalRow[] | null;
  onChanged: (what: 'deposit' | 'bet' | 'none') => void;
  onStorm: (result: StormResult) => void;
  toast: (text: string) => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [storm, setStorm] = useState<StormResult | null>(null);
  const [stormOpen, setStormOpen] = useState(false);
  const [balanceProof, setBalanceProof] = useState<{ status: number; body: unknown } | null>(null);
  const [bet, setBet] = useState<PlacedBet | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [lastBetId, setLastBetId] = useState<string | null>(null);

  const [amount, setAmount] = useState('500');
  const [target, setTarget] = useState('50.00');
  const [clientSeed, setClientSeed] = useState<string>(() => crypto.randomUUID());

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setOutcome(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.refusal) {
        setOutcome({
          kind: 'refusal',
          status: err.status,
          body: err.body as Record<string, unknown>,
        });
      } else {
        setOutcome({ kind: 'error', message: (err as Error).message });
      }
    } finally {
      setBusy(null);
    }
  };

  const deposit = () =>
    run('deposit', async () => {
      const res = await api.deposit({
        event_id: crypto.randomUUID(),
        provider: 'demo',
        type: 'deposit.succeeded',
        user_id: 'user:demo',
        amount_minor: 1000,
      });
      toast(`Deposit posted · entry ${res.entryId}`);
      onChanged('deposit');
    });

  const runStorm = () =>
    run('storm', async () => {
      const res = await api.storm({
        count: 20,
        event_id: crypto.randomUUID(),
        user_id: 'user:demo',
        amount_minor: 1000,
      });
      setStorm(res);
      onStorm(res);
      toast(`Storm complete · ${res.posted} posted / ${res.deduplicated} deduplicated`);
      onChanged('deposit');
    });

  const tryPutBalance = () =>
    run('balance', async () => {
      try {
        await api.putBalance();
        setBalanceProof({ status: 200, body: { unexpected: 'the endpoint answered' } });
      } catch (err) {
        if (err instanceof ApiError) {
          setBalanceProof({ status: err.status, body: err.body });
          return;
        }
        throw err;
      }
    });

  const placeBet = (over?: { amountMinor?: number; targetUnder?: string; betId?: string }) =>
    run('bet', async () => {
      const betId = over?.betId ?? crypto.randomUUID();
      const placed = await api.placeBet({
        betId,
        amountMinor: over?.amountMinor ?? Number(amount),
        targetUnder: over?.targetUnder ?? target,
        clientSeed,
        ...(commitment ? { seedHash: commitment.seedHash } : {}),
      });
      setBet(placed);
      if (!over?.betId) setLastBetId(betId);
      toast(
        `Bet settled · ${placed.won ? 'WIN' : 'LOSS'} · roll ${placed.roll} · round ${placed.bet.roundId.slice(0, 8)}…`,
      );
      onChanged('bet');
    });

  const replay = () => {
    if (!lastBetId) return;
    void placeBet({ betId: lastBetId });
  };

  const insufficientReachable = me !== null && me.balanceMinor < 100;

  return (
    <Panel
      label="Actions"
      description="Every action here writes a journal entry, or is refused by the server."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-line px-3 py-2 text-[11px]">
          <span className="num text-muted">{me?.userId ?? 'signing in…'}</span>
          <span className="num tabular-nums">
            balance {me ? formatMinor(me.balanceMinor) : '—'} · today{' '}
            {me ? formatMinor(me.dailyNetMinor) : '—'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={deposit} busy={busy === 'deposit'}>
            Deposit 10.00 (webhook)
          </Button>
          <Button onClick={runStorm} busy={busy === 'storm'}>
            Storm: same webhook ×20
          </Button>
        </div>

        {storm && (
          <div className="rounded border border-line px-3 py-2 text-[11px]">
            <p className="num">
              <span className="text-accent">{storm.sent} received</span> ·{' '}
              <span className="text-accent">{storm.posted} posted</span> ·{' '}
              <span className="text-muted">{storm.deduplicated} deduplicated</span>
              {storm.entryId !== null && <> · entry {storm.entryId}</>}
            </p>
            <button
              type="button"
              onClick={() => setStormOpen((v) => !v)}
              aria-expanded={stormOpen}
              className="mt-1 text-[10px] uppercase tracking-wide text-muted hover:text-ink"
            >
              details
            </button>
            {stormOpen && (
              <dl className="num mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-[11px]">
                <dt className="text-muted">httpDeliveries</dt>
                <dd>{storm.httpDeliveries}</dd>
                <dt className="text-muted">failed</dt>
                <dd>{storm.failed}</dd>
                <dt className="text-muted">distinctEntryIds</dt>
                <dd>{storm.distinctEntryIds}</dd>
                <dt className="text-muted">eventId</dt>
                <dd className="break-all">{storm.eventId}</dd>
              </dl>
            )}
          </div>
        )}

        <div>
          <Button onClick={tryPutBalance} busy={busy === 'balance'}>
            Try PUT /balance
          </Button>
          <p className="mt-1 text-[11px] text-muted">There is no endpoint for this.</p>
          {balanceProof && (
            <pre className="num mt-2 overflow-x-auto rounded border border-line bg-bg px-3 py-2 text-[11px]">
{`HTTP ${balanceProof.status}
${JSON.stringify(balanceProof.body, null, 2)}`}
            </pre>
          )}
        </div>

        <div className="space-y-2 rounded border border-line px-3 py-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Place a bet
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Field id="amount" label="Amount (minor)">
              <input
                id="amount"
                className={inputClass}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field id="target" label={`Target under · ×${multiplierFor(Number(target))}`}>
              <input
                id="target"
                className={inputClass}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
          </div>
          <Field id="targetRange" label="Target slider">
            <input
              id="targetRange"
              type="range"
              min={100}
              max={9800}
              step={1}
              value={Math.round(Number(target) * 100) || 100}
              onChange={(e) => setTarget((Number(e.target.value) / 100).toFixed(2))}
              className="w-full accent-[var(--c-accent)]"
            />
          </Field>
          <Field id="clientSeed" label="Client seed">
            <input
              id="clientSeed"
              className={inputClass}
              value={clientSeed}
              onChange={(e) => setClientSeed(e.target.value)}
            />
          </Field>
          <p className="num text-[10px] text-muted">
            against commitment {commitment ? commitment.seedHash.slice(0, 12) : '…'}… · nonce{' '}
            {commitment?.nonce ?? '—'}
          </p>
          <Button onClick={() => placeBet()} busy={busy === 'bet'} tone="primary">
            Place bet
          </Button>
        </div>

        {bet && (
          <div className="rounded border border-line px-3 py-3">
            <div className="flex items-baseline gap-3">
              <span className="num text-2xl tabular-nums">{bet.roll.toFixed(2)}</span>
              <span
                className={`num rounded px-1.5 py-0.5 text-[11px] ${
                  bet.won ? 'text-accent' : 'text-refusal'
                }`}
              >
                {bet.won ? 'WIN' : 'LOSS'}
              </span>
              <span className="num ml-auto text-[11px] tabular-nums">
                payout {formatMinor(bet.payoutMinor)}
              </span>
            </div>
            <dl className="num mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              <dt className="text-muted">lock entry</dt>
              <dd>{bet.entryIds[0]}</dd>
              <dt className="text-muted">settle entry</dt>
              <dd>{bet.entryIds[1]}</dd>
              <dt className="text-muted">seed hash</dt>
              <dd className="break-all">{bet.seedHash}</dd>
              <dt className="text-muted">nonce</dt>
              <dd>{bet.nonce}</dd>
              <dt className="text-muted">round</dt>
              <dd className="break-all">{bet.bet.roundId}</dd>
            </dl>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Refusals
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => placeBet({ amountMinor: 99 })} busy={busy === 'bet'}>
              Bet &lt; min
            </Button>
            <Button onClick={() => placeBet({ amountMinor: 60_000 })} busy={busy === 'bet'}>
              Bet &gt; max
            </Button>
            <Button onClick={() => placeBet({ targetUnder: '99.00' })} busy={busy === 'bet'}>
              Bad target
            </Button>
            <Button onClick={replay} busy={busy === 'bet'}>
              Replay same betId
            </Button>
            {insufficientReachable && (
              <Button onClick={() => placeBet({ amountMinor: 500 })} busy={busy === 'bet'}>
                Bet with no balance
              </Button>
            )}
          </div>
          {!insufficientReachable && (
            <p className="text-[11px] text-muted">
              INSUFFICIENT_FUNDS requires a balance lower than the attempted legal stake. Spend
              down rather than resetting the ledger to reach it.
            </p>
          )}
          {!lastBetId && (
            <p className="text-[11px] text-muted">
              Replay needs a bet first: place one, then replay its id.
            </p>
          )}

          {outcome?.kind === 'refusal' && (
            <RefusalCard status={outcome.status} body={outcome.body} />
          )}
          {outcome?.kind === 'error' && (
            <p className="border-l-2 border-refusal pl-3 text-[11px] text-refusal">
              {outcome.message}
            </p>
          )}

          {refusals && <RefusalTable rows={refusals} />}
        </div>
      </div>
    </Panel>
  );
};
