import { useState } from 'react';
import { Badge, Button, Card, Skeleton, StatusDot } from './ui.tsx';
import { Drawer } from './Drawer.tsx';
import { PROOF, type ProofKey } from './proofs.ts';
import { ScalesIcon, ShieldCheckIcon, FingerprintIcon } from './icons.tsx';
import { shortHash } from '../format.ts';
import type { Verification } from './journey.ts';
import type { Commitment, Invariants } from '../types.ts';

const WhyLink = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-3 text-xs font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
  >
    Why this is true
  </button>
);

const Head = ({
  icon: Icon,
  title,
  badge,
}: {
  icon: (p: { className?: string }) => JSX.Element;
  title: string;
  badge: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted" />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    {badge}
  </div>
);

/**
 * Three claims, each leading with the state a person cares about and keeping
 * the raw figures as a compact second line.
 */
export const ProofRail = ({
  invariants,
  commitment,
  verification,
  balanceProbe,
  onProbeBalance,
  probing,
}: {
  invariants: Invariants | null;
  commitment: Commitment | null;
  verification: Verification | null;
  balanceProbe: { status: number; body: unknown } | null;
  onProbeBalance: () => void;
  probing: boolean;
}) => {
  const [open, setOpen] = useState<ProofKey | null>(null);
  const balanced = invariants?.sumIsZero === true;
  const verified = verification?.state === 'done';

  return (
    <aside aria-label="Live proof" className="lg:sticky lg:top-24">
      <h2 className="mb-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Live proof
      </h2>

      <div className="space-y-3">
        <Card className="p-4">
          <Head
            icon={ScalesIcon}
            title="Ledger"
            badge={
              invariants ? (
                <Badge tone={balanced ? 'accent' : 'refusal'} icon={balanced}>
                  {balanced ? 'Healthy' : 'Broken'}
                </Badge>
              ) : (
                <Skeleton className="h-5 w-16" />
              )
            }
          />

          {invariants ? (
            <>
              <p className="mt-2 text-sm text-ink">
                {balanced ? 'Every entry balances to zero.' : 'The database reports an imbalance.'}
              </p>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Sum</dt>
                  <dd className="mono">{invariants.totalAmountMinor}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Entries</dt>
                  <dd className="mono">{invariants.totalPostings}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Unbalanced</dt>
                  <dd className={`mono ${invariants.unbalancedEntries === 0 ? 'text-accent-text' : 'text-refusal'}`}>
                    {invariants.unbalancedEntries}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 text-xs text-muted">
                <StatusDot
                  tone={balanced ? 'accent' : 'refusal'}
                  label="Checked just now against the live database"
                />
              </p>
            </>
          ) : (
            <div className="mt-3 space-y-2" aria-hidden="true">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          )}
          <WhyLink onClick={() => setOpen('sum')} />
        </Card>

        <Card className="p-4">
          <Head icon={ShieldCheckIcon} title="Balance" badge={<Badge tone="accent" icon>Protected</Badge>} />
          <p className="mt-2 text-sm text-ink">Your balance cannot be written to.</p>
          <p className="mt-1 text-xs text-muted">There is no balance column and no endpoint for it.</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onProbeBalance} busy={probing}>
              Attempt balance write
            </Button>
          </div>
          {balanceProbe && (
            <pre className="mono mt-3 max-h-40 animate-rise overflow-auto rounded-lg border border-line bg-subtle px-3 py-2 text-[11px]">
{`HTTP ${balanceProbe.status}
${JSON.stringify(balanceProbe.body, null, 2)}`}
            </pre>
          )}
          <WhyLink onClick={() => setOpen('derived')} />
        </Card>

        <Card className="p-4">
          <Head
            icon={FingerprintIcon}
            title="Outcome"
            badge={
              verified ? (
                <Badge tone={verification.matches && verification.commitmentOk ? 'accent' : 'refusal'} icon={verification.matches}>
                  {verification.matches && verification.commitmentOk ? 'Verified' : 'Mismatch'}
                </Badge>
              ) : (
                <Badge tone="fairness">Committed</Badge>
              )
            }
          />
          <p className="mt-2 text-sm text-ink">
            {verified
              ? verification.matches
                ? 'Your browser reproduced the result.'
                : 'Your browser disagreed with the server.'
              : 'Published before any outcome existed.'}
          </p>
          {commitment ? (
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Commitment</dt>
                <dd className="mono text-fairness">{shortHash(commitment.seedHash, 8, 6)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Next nonce</dt>
                <dd className="mono">{commitment.nonce}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-3 space-y-2" aria-hidden="true">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          )}
          <WhyLink onClick={() => setOpen('seed')} />
        </Card>
      </div>

      <Drawer open={open !== null} title={open ? PROOF[open].title : ''} onClose={() => setOpen(null)}>
        {open && (
          <>
            <p>{PROOF[open].body}</p>
            <p className="mono text-xs text-muted">Proof: {PROOF[open].test}</p>
          </>
        )}
      </Drawer>
    </aside>
  );
};
