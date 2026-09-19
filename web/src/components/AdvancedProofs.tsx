import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Disclosure,
  Empty,
  HashValue,
  SectionHeading,
  Skeleton,
  StatusDot,
} from './ui.tsx';
import { LedgerView } from './LedgerView.tsx';
import { RefusalCard } from './RefusalCard.tsx';
import { RefusalTable } from './RefusalTable.tsx';
import { PROOF } from './proofs.ts';
import { formatMinor, formatTime } from '../format.ts';
import type { useEngine } from '../hooks/useEngine.ts';
import type {
  AccountBalance,
  Affiliate,
  Invariants,
  JournalEntry,
  Me,
  RefusalRow,
  RevealedSeed,
} from '../types.ts';

const TABS = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'payments', label: 'Duplicate protection' },
  { id: 'rules', label: 'Server rules' },
  { id: 'fairness', label: 'Fairness' },
  { id: 'affiliate', label: 'Affiliate' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PROBE_SEED = 'refusal-probe';

export const AdvancedProofs = ({
  engine,
  me,
  accounts,
  entries,
  entriesLoading,
  entriesError,
  refusals,
  revealed,
  affiliate,
  invariants,
  balanceProbe,
  onProbeBalance,
  probing,
  apiBase,
}: {
  engine: ReturnType<typeof useEngine>;
  me: Me | null;
  accounts: AccountBalance[] | null;
  entries: JournalEntry[] | null;
  entriesLoading: boolean;
  entriesError: Error | null;
  refusals: RefusalRow[] | null;
  revealed: RevealedSeed[] | null;
  affiliate: Affiliate | null;
  invariants: Invariants | null;
  balanceProbe: { status: number; body: unknown } | null;
  onProbeBalance: () => void;
  probing: boolean;
  apiBase: string;
}) => {
  const [tab, setTab] = useState<TabId>('ledger');
  const { storm } = engine;
  const insufficientReachable = me !== null && me.balanceMinor < 500;

  const probe = (over: { amountMinor?: number; targetUnder?: string }) =>
    void engine.placeBet({
      amountMinor: over.amountMinor ?? 500,
      targetUnder: over.targetUnder ?? '50.00',
      clientSeed: PROBE_SEED,
    });

  return (
    <section id="proofs" className="scroll-mt-20 pt-14">
      <SectionHeading
        eyebrow="For developers"
        title="Advanced proofs"
        lead="The raw evidence behind the four guarantees above: the ledger itself, the duplicate-payment test, every rule the server enforces, seed history and affiliate accrual."
      />

      <div className="mb-4 overflow-x-auto">
        <div role="tablist" aria-label="Advanced proofs" className="flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Card tier="technical" className="p-4 sm:p-6">
        {tab === 'ledger' && (
          <div role="tabpanel" id="panel-ledger" aria-labelledby="tab-ledger">
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold">Ledger health</h3>
                  {invariants ? (
                    <Badge tone={invariants.sumIsZero ? 'accent' : 'refusal'} icon={invariants.sumIsZero}>
                      {invariants.sumIsZero ? 'Healthy' : 'Broken'}
                    </Badge>
                  ) : (
                    <Skeleton className="h-5 w-16" />
                  )}
                </div>
                {invariants ? (
                  <>
                    <dl className="mt-3 space-y-1 text-xs">
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
                        <dd className={`mono ${invariants.unbalancedEntries === 0 ? 'text-accent-text' : 'text-refusal'}`}>
                          {invariants.unbalancedEntries}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2.5 text-xs text-muted">
                      <StatusDot
                        tone={invariants.sumIsZero ? 'accent' : 'refusal'}
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
                <p className="mono mt-3 text-[11px] text-muted">Proof: {PROOF.sum.test}</p>
              </div>

              <div className="min-w-0 rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold">Balance protection</h3>
                  <Badge tone="accent" icon>
                    Protected
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  There is no balance column and no endpoint that writes one. Try it:
                </p>
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
                <p className="mono mt-3 text-[11px] text-muted">Proof: {PROOF.derived.test}</p>
              </div>
            </div>

            <LedgerView
              accounts={accounts}
              entries={entries}
              loading={entriesLoading}
              error={entriesError}
              apiBase={apiBase}
            />
          </div>
        )}

        {tab === 'payments' && (
          <div role="tabpanel" id="panel-payments" aria-labelledby="tab-payments">
            <h3 className="text-base font-semibold">Duplicate payment protection</h3>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
              The same payment notification is sent 20 times at once. Only one may move money.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={() => void engine.runStorm(20)} busy={engine.busy === 'storm'}>
                Run duplicate test
              </Button>
            </div>

            {storm && (
              <div className="mt-5 animate-rise">
                <div className="grid max-w-xl gap-3 sm:grid-cols-3">
                  {[
                    { value: storm.sent, label: 'received' },
                    { value: storm.posted, label: 'settled' },
                    { value: storm.deduplicated, label: 'ignored safely' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-line bg-surface px-3 py-3 text-center">
                      <p className="num text-3xl font-semibold">{s.value}</p>
                      <p className="mt-0.5 text-xs text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm font-medium text-accent-text">
                  <StatusDot
                    tone={storm.distinctEntryIds === 1 ? 'accent' : 'refusal'}
                    label={storm.distinctEntryIds === 1 ? 'Duplicate protection held ✓' : 'Duplicate protection failed ✗'}
                  />
                </p>
                <p className="mono mt-1.5 text-xs text-muted">
                  {storm.distinctEntryIds} ledger entry · {storm.httpDeliveries} HTTP deliveries ·{' '}
                  {storm.failed} failed
                </p>
                <div className="mt-2">
                  <HashValue value={storm.eventId} label="event id" tone="muted" head={10} tail={6} />
                </div>
              </div>
            )}

            <Disclosure summary="Technical details" className="mt-5">
              {PROOF.webhooks.body}
              <p className="mono mt-2 text-muted">Proof: {PROOF.webhooks.test}</p>
            </Disclosure>
          </div>
        )}

        {tab === 'rules' && (
          <div role="tabpanel" id="panel-rules" aria-labelledby="tab-rules">
            <h3 className="text-base font-semibold">Ask for something the server will not do</h3>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
              Each button breaks one rule. The server answers with a reason, not a generic failure.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => probe({ amountMinor: 99 })} busy={engine.busy === 'bet'}>
                Stake below minimum
              </Button>
              <Button size="sm" onClick={() => probe({ amountMinor: 60_000 })} busy={engine.busy === 'bet'}>
                Stake above maximum
              </Button>
              <Button size="sm" onClick={() => probe({ targetUnder: '99.00' })} busy={engine.busy === 'bet'}>
                Target out of range
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void engine.replayLastBet({ amountMinor: 500, targetUnder: '50.00', clientSeed: PROBE_SEED })
                }
                busy={engine.busy === 'bet'}
                disabled={!engine.lastBetId}
              >
                Replay same request
              </Button>
              {insufficientReachable && (
                <Button size="sm" onClick={() => probe({ amountMinor: 500 })} busy={engine.busy === 'bet'}>
                  Spend more than balance
                </Button>
              )}
            </div>

            {!engine.lastBetId && (
              <p className="mt-2 text-xs text-muted">Replaying a request needs one to replay — run the demo first.</p>
            )}
            {!insufficientReachable && (
              <p className="mt-2 text-xs text-muted">
                Refusing for insufficient funds needs a balance below the stake. Spend down rather than
                resetting the ledger to reach it.
              </p>
            )}

            {engine.refusal && (
              <div className="mt-4 max-w-xl animate-rise">
                <RefusalCard status={engine.refusal.status} body={engine.refusal.body} />
              </div>
            )}
            {engine.failure && (
              <p className="mt-4 border-l-2 border-refusal pl-3 text-sm text-refusal">{engine.failure.message}</p>
            )}

            <div className="mt-6">{refusals && <RefusalTable rows={refusals} />}</div>
          </div>
        )}

        {tab === 'fairness' && (
          <div role="tabpanel" id="panel-fairness" aria-labelledby="tab-fairness">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Revealed secrets</h3>
                <p className="mt-1 text-sm text-ink-2">
                  Retired secrets, disclosed in full. Every result they produced can be recomputed.
                </p>
                {revealed && revealed.length === 0 && <Empty>Nothing has been revealed yet.</Empty>}
                {revealed && revealed.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {revealed.slice(0, 6).map((s) => (
                      <li key={s.seedHash} className="rounded-lg border border-line bg-surface px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs text-muted">Commitment</span>
                          <span className="mono text-xs text-muted">{formatTime(s.revealedAt)}</span>
                        </div>
                        <div className="mt-1">
                          <HashValue value={s.seedHash} label="commitment" />
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="text-xs text-muted">Secret</span>
                          <HashValue value={s.seed} label="revealed secret" tone="muted" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="text-base font-semibold">How a result is computed</h3>
                <pre className="mono mt-3 overflow-x-auto rounded-lg border border-line bg-surface px-3 py-3 text-xs">
{`hmac = HMAC_SHA256(
  key     = UTF8(serverSeed),
  message = UTF8(\`\${clientSeed}:\${nonce}\`)
)
roll = (first 8 hex of hmac as integer) % 10000 / 100
win  = roll < targetUnder        (strictly less than)`}
                </pre>
                <Disclosure summary="Why the encoding matters" className="mt-3">
                  The server seed is 64 lowercase hex characters, and it is that text which is hashed
                  and keyed — not the 32 bytes it encodes. The commitment is published before the seed
                  is used; the plaintext is disclosed only after rotation, which is what makes any of
                  this checkable.
                  <p className="mono mt-2 text-muted">Proof: {PROOF.seed.test}</p>
                </Disclosure>
              </div>
            </div>
          </div>
        )}

        {tab === 'affiliate' && (
          <div role="tabpanel" id="panel-affiliate" aria-labelledby="tab-affiliate">
            <h3 className="text-base font-semibold">Commission accrues as postings</h3>
            <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
              An affiliate's earnings are the sum of commission postings, not a counter someone
              increments — so the figure can never disagree with the ledger.
            </p>
            {affiliate ? (
              <div className="mt-4 flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted">Earned</p>
                  <p className="num mt-1 text-3xl font-semibold">{formatMinor(affiliate.earnedMinor)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted">Referred</p>
                  <p className="mono mt-1 text-sm">{affiliate.referred.join(', ') || '—'}</p>
                </div>
                <Badge tone="fairness">affiliate:alice</Badge>
              </div>
            ) : (
              <Empty>Affiliate data has not loaded.</Empty>
            )}
          </div>
        )}
      </Card>
    </section>
  );
};
