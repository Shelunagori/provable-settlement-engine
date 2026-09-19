import { Badge, Button, Card, Disclosure, Skeleton } from './ui.tsx';
import { WalletIcon } from './icons.tsx';
import { formatMinor, formatSignedMinor } from '../format.ts';
import type { AccountBalance, Me } from '../types.ts';

/**
 * The strongest component on the page, so it gets the primary card treatment.
 * Human wording leads; how the figure is derived is one click away rather than
 * printed under the balance.
 */
export const WalletCard = ({
  me,
  accounts,
  loading,
  depositBusy,
  onDeposit,
  onRunDemo,
}: {
  me: Me | null;
  accounts: AccountBalance[] | null;
  loading: boolean;
  depositBusy: boolean;
  onDeposit: () => void;
  onRunDemo: () => void;
}) => {
  const inPlay = accounts?.find((a) => a.accountId === 'pending_bets')?.balanceMinor ?? null;
  const ready = me !== null;

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
        <Badge tone="fairness">Demo funds</Badge>
      </div>

      <div className="mt-5">
        {ready ? (
          <p className="num text-[2.75rem] font-semibold leading-none tracking-tight">
            {formatMinor(me.balanceMinor)}
          </p>
        ) : (
          <Skeleton className="h-11 w-48" />
        )}
        <p className="mt-2 text-sm text-ink-2">Available demo balance</p>
        <Disclosure summary="How is this calculated?" className="mt-1.5">
          Your balance is the sum of ledger postings. There is no editable balance field, and no
          endpoint that writes one.
        </Disclosure>
      </div>

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

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onDeposit} busy={depositBusy} disabled={loading}>
          Add 10.00
        </Button>
        <Button variant="secondary" onClick={onRunDemo}>
          Run demo
        </Button>
      </div>
    </Card>
  );
};
