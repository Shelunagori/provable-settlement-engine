import { Badge, Button, Card, Skeleton, StatusDot } from './ui.tsx';
import { formatMinor, formatSignedMinor } from '../format.ts';
import type { AccountBalance, Me } from '../types.ts';

/**
 * The wallet shows what the ledger says, and says where the number came from.
 * It holds no money state of its own: every figure here is a server response.
 */
export const WalletCard = ({
  me,
  accounts,
  loading,
  depositBusy,
  onDeposit,
  onPlay,
}: {
  me: Me | null;
  accounts: AccountBalance[] | null;
  loading: boolean;
  depositBusy: boolean;
  onDeposit: () => void;
  onPlay: () => void;
}) => {
  const pending = accounts?.find((a) => a.accountId === 'pending_bets')?.balanceMinor ?? null;
  const ready = me !== null;

  return (
    <Card className="p-5 sm:p-6" raised>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Your demo wallet
          </p>
          <p className="mono mt-1 text-xs text-muted">{me?.userId ?? 'signing in…'}</p>
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
        <p className="mt-2 text-sm text-muted">
          Summed from the ledger — not stored anywhere as a balance.
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-bg/40 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Net today</dt>
          <dd className="num mt-0.5 text-sm">
            {ready ? formatSignedMinor(me.dailyNetMinor) : '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-bg/40 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted">Held in play</dt>
          <dd className="num mt-0.5 text-sm">
            {pending === null ? '—' : formatMinor(Math.abs(pending))}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onDeposit} busy={depositBusy} disabled={loading}>
          Add 10.00 funds
        </Button>
        <Button variant="secondary" onClick={onPlay}>
          Place an outcome
        </Button>
      </div>

      <p className="mt-4 text-xs text-muted">
        <StatusDot tone="accent" label="Funds arrive as a payment webhook, exactly as production would." />
      </p>
    </Card>
  );
};
