import { Badge, Button, Card, Disclosure, Skeleton } from './ui.tsx';
import { WalletIcon } from './icons.tsx';
import { formatMinor, formatSignedMinor } from '../format.ts';
import type { AccountBalance, Me } from '../types.ts';

/**
 * What you have, and the two things you can do about it. Nothing here explains
 * the ledger unless someone asks.
 */
export const WalletCard = ({
  me,
  accounts,
  loading,
  depositBusy,
  resetBusy,
  resetAvailable,
  onDeposit,
  onReset,
}: {
  me: Me | null;
  accounts: AccountBalance[] | null;
  loading: boolean;
  depositBusy: boolean;
  resetBusy: boolean;
  resetAvailable: boolean;
  onDeposit: () => void;
  onReset: () => void;
}) => {
  const inPlay = accounts?.find((a) => a.accountId === 'pending_bets')?.balanceMinor ?? null;
  const ready = me !== null;
  const empty = ready && me.balanceMinor === 0;

  return (
    <Card tier="primary" className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
            <WalletIcon className="h-4 w-4" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Demo wallet
          </p>
        </div>
        <Badge tone="fairness">Demo credits</Badge>
      </div>

      {empty ? (
        <div className="mt-5">
          <p className="text-lg font-semibold">Your demo wallet is empty.</p>
          <p className="mt-1 text-sm text-ink-2">Add credits to place your first bet.</p>
        </div>
      ) : (
        <div className="mt-5">
          {ready ? (
            <p className="num text-[2.75rem] font-semibold leading-none tracking-tight">
              {formatMinor(me.balanceMinor)}
            </p>
          ) : (
            <Skeleton className="h-11 w-48" />
          )}
          <p className="mt-1.5 text-sm text-ink-2">Available balance, in credits</p>
        </div>
      )}

      {!empty && (
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line bg-subtle px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wider text-muted">Today</dt>
            <dd className="num mt-0.5 text-sm">
              {ready ? formatSignedMinor(me.dailyNetMinor) : '—'}
            </dd>
          </div>
          <div className="rounded-lg border border-line bg-subtle px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wider text-muted">In play</dt>
            <dd className="num mt-0.5 text-sm">
              {inPlay === null ? '—' : formatMinor(Math.abs(inPlay))}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onDeposit} busy={depositBusy} disabled={loading}>
          Add 10 credits
        </Button>
        {resetAvailable && (
          <Button variant="secondary" onClick={onReset} busy={resetBusy}>
            Reset demo
          </Button>
        )}
      </div>

      <Disclosure summary="How is balance calculated?" className="mt-4">
        Your balance is calculated from ledger entries. It cannot be directly edited, and there is
        no endpoint that writes one.
      </Disclosure>

      <p className="mt-3 text-xs text-muted">
        Credits live on the server, so refreshing this page keeps them.
        {resetAvailable ? ' Reset demo is what clears them.' : ''}
      </p>
    </Card>
  );
};
