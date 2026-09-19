import { useState } from 'react';
import { Badge, Button, Card, Skeleton, StatusDot } from './ui.tsx';
import { Drawer } from './Drawer.tsx';
import { PROOF, type ProofKey } from './proofs.ts';
import { shortHash } from '../format.ts';
import type { Verification } from './journey.ts';
import type { Commitment, Invariants } from '../types.ts';

const WhyLink = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-3 text-xs font-medium text-muted underline underline-offset-2 hover:text-ink"
  >
    Why this is true
  </button>
);

/**
 * Three claims, each showing live state rather than a slogan. The rail sits
 * beside the demo so a claim and the action that exercises it are on screen at
 * the same time.
 */
export const ProofRail = ({
  invariants,
  invariantsLoading,
  commitment,
  verification,
  balanceProbe,
  onProbeBalance,
  probing,
}: {
  invariants: Invariants | null;
  invariantsLoading: boolean;
  commitment: Commitment | null;
  verification: Verification | null;
  balanceProbe: { status: number; body: unknown } | null;
  onProbeBalance: () => void;
  probing: boolean;
}) => {
  const [open, setOpen] = useState<ProofKey | null>(null);
  const balanced = invariants?.sumIsZero === true;

  return (
    <aside aria-label="Live proof" className="lg:sticky lg:top-24">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Live proof
      </h2>

      <div className="space-y-3">
        <Card className="p-4" raised>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">Ledger balanced</h3>
            {invariants ? (
              <Badge tone={balanced ? 'accent' : 'refusal'}>{balanced ? 'Holding' : 'Broken'}</Badge>
            ) : (
              <Skeleton className="h-5 w-16" />
            )}
          </div>

          {invariants ? (
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Sum of all postings</dt>
                <dd className="mono">{invariants.totalAmountMinor}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Postings checked</dt>
                <dd className="mono">{invariants.totalPostings}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Unbalanced entries</dt>
                <dd className={`mono ${invariants.unbalancedEntries === 0 ? 'text-accent' : 'text-refusal'}`}>
                  {invariants.unbalancedEntries}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="mt-3 space-y-2" aria-hidden="true">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          )}
          <p className="mt-3 text-xs">
            <StatusDot
              tone={invariantsLoading && !invariants ? 'pending' : balanced ? 'accent' : 'refusal'}
              label={
                invariantsLoading && !invariants
                  ? 'Checking the ledger'
                  : balanced
                    ? 'Checked just now against the live database'
                    : 'The database reports an imbalance'
              }
            />
          </p>
          <WhyLink onClick={() => setOpen('sum')} />
        </Card>

        <Card className="p-4" raised>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">Balance is derived</h3>
            <Badge tone="accent">By design</Badge>
          </div>
          <p className="mt-2 text-xs text-muted">
            There is no balance column and no endpoint that writes one. Try it:
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onProbeBalance} busy={probing}>
              Attempt to write a balance
            </Button>
          </div>
          {balanceProbe && (
            <pre className="mono mt-3 max-h-40 animate-rise overflow-auto rounded-lg border border-line bg-bg/60 px-3 py-2 text-[11px]">
{`HTTP ${balanceProbe.status}
${JSON.stringify(balanceProbe.body, null, 2)}`}
            </pre>
          )}
          <WhyLink onClick={() => setOpen('derived')} />
        </Card>

        <Card className="p-4" raised>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">Outcome commitment</h3>
            {verification?.state === 'done' ? (
              <Badge tone={verification.matches && verification.commitmentOk ? 'accent' : 'refusal'}>
                {verification.matches && verification.commitmentOk ? 'Verified here' : 'Mismatch'}
              </Badge>
            ) : (
              <Badge tone="fairness">Published</Badge>
            )}
          </div>
          {commitment ? (
            <dl className="mt-3 space-y-1.5 text-xs">
              <div>
                <dt className="text-muted">Active commitment</dt>
                <dd className="mono mt-0.5 text-fairness">{shortHash(commitment.seedHash, 12, 8)}</dd>
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
          <p className="mt-3 text-xs">
            <StatusDot
              tone={verification?.state === 'done' ? (verification.matches ? 'accent' : 'refusal') : 'fairness'}
              label={
                verification?.state === 'done'
                  ? verification.matches
                    ? 'Your browser recomputed the roll and agreed'
                    : 'Your browser disagreed with the server'
                  : 'Published before any outcome existed'
              }
            />
          </p>
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
