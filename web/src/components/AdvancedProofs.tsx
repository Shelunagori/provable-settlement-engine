import { useState } from 'react';
import { Badge, Button, Card, Copy, Empty, SectionHeading, StatusDot } from './ui.tsx';
import { LedgerView } from './LedgerView.tsx';
import { RefusalCard } from './RefusalCard.tsx';
import { RefusalTable } from './RefusalTable.tsx';
import { PROOF } from './proofs.ts';
import { formatMinor, formatTime, shortHash } from '../format.ts';
import type { useEngine } from '../hooks/useEngine.ts';
import type {
  AccountBalance,
  Affiliate,
  JournalEntry,
  Me,
  RefusalRow,
  RevealedSeed,
} from '../types.ts';

const TABS = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'payments', label: 'Payment idempotency' },
  { id: 'refusals', label: 'Refusals' },
  { id: 'fairness', label: 'Fairness history' },
  { id: 'affiliate', label: 'Affiliate' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const REFUSAL_SEED = 'refusal-probe';

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
  apiBase: string;
}) => {
  const [tab, setTab] = useState<TabId>('ledger');
  const { storm } = engine;
  const insufficientReachable = me !== null && me.balanceMinor < 500;

  const probe = (over: { amountMinor?: number; targetUnder?: string }) =>
    void engine.placeBet({
      amountMinor: over.amountMinor ?? 500,
      targetUnder: over.targetUnder ?? '50.00',
      clientSeed: REFUSAL_SEED,
    });

  return (
    <section id="proofs" className="scroll-mt-24 pt-16">
      <SectionHeading
        eyebrow="Advanced proofs"
        title="Look underneath"
        lead="The same system, without the guided path: the raw ledger, the duplicate-payment storm, the full refusal table, seed history and affiliate accrual."
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
                tab === t.id
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4 sm:p-6">
        {tab === 'ledger' && (
          <div role="tabpanel" id="panel-ledger" aria-labelledby="tab-ledger">
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
            <h3 className="text-sm font-semibold">{PROOF.webhooks.title}</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted">{PROOF.webhooks.body}</p>
            <div className="mt-4">
              <Button
                variant="primary"
                onClick={() => void engine.runStorm(20)}
                busy={engine.busy === 'storm'}
              >
                Send the same payment 20 times
              </Button>
            </div>

            {storm && (
              <div className="mt-5 animate-rise">
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Notifications sent', value: storm.sent },
                    { label: 'HTTP deliveries', value: storm.httpDeliveries },
                    { label: 'Money moved', value: storm.posted },
                    { label: 'Ignored as duplicates', value: storm.deduplicated },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-line bg-bg/40 px-3 py-3">
                      <p className="mono text-2xl">{s.value}</p>
                      <p className="mt-1 text-xs text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-muted">Distinct journal entries</dt>
                    <dd className={`mono ${storm.distinctEntryIds === 1 ? 'text-accent' : 'text-refusal'}`}>
                      {storm.distinctEntryIds}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted">Failed</dt>
                    <dd className="mono">{storm.failed}</dd>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="text-muted">Event id</dt>
                    <dd className="mono break-all">{storm.eventId}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm">
                  <StatusDot
                    tone={storm.distinctEntryIds === 1 ? 'accent' : 'refusal'}
                    label={`${storm.sent} identical notifications produced ${storm.distinctEntryIds} journal entry`}
                  />
                </p>
              </div>
            )}
            <p className="mono mt-5 text-xs text-muted">Proof: {PROOF.webhooks.test}</p>
          </div>
        )}

        {tab === 'refusals' && (
          <div role="tabpanel" id="panel-refusals" aria-labelledby="tab-refusals">
            <h3 className="text-sm font-semibold">Ask for something the server will not do</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Each button sends a request that breaks one rule. The server answers with a named
              code and structured detail rather than a generic failure.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => probe({ amountMinor: 99 })} busy={engine.busy === 'bet'}>
                Stake below the minimum
              </Button>
              <Button size="sm" onClick={() => probe({ amountMinor: 60_000 })} busy={engine.busy === 'bet'}>
                Stake above the maximum
              </Button>
              <Button size="sm" onClick={() => probe({ targetUnder: '99.00' })} busy={engine.busy === 'bet'}>
                Target out of range
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  void engine.replayLastBet({
                    amountMinor: 500,
                    targetUnder: '50.00',
                    clientSeed: REFUSAL_SEED,
                  })
                }
                busy={engine.busy === 'bet'}
                disabled={!engine.lastBetId}
              >
                Replay the same request id
              </Button>
              {insufficientReachable && (
                <Button size="sm" onClick={() => probe({ amountMinor: 500 })} busy={engine.busy === 'bet'}>
                  Spend more than the balance
                </Button>
              )}
            </div>

            {!engine.lastBetId && (
              <p className="mt-2 text-xs text-muted">
                Replaying a request id needs an outcome to replay — place one in the demo first.
              </p>
            )}
            {!insufficientReachable && (
              <p className="mt-2 text-xs text-muted">
                Refusing for insufficient funds needs a balance below the stake. Spend down rather
                than resetting the ledger to reach it.
              </p>
            )}

            {engine.refusal && (
              <div className="mt-4 max-w-2xl animate-rise">
                <RefusalCard status={engine.refusal.status} body={engine.refusal.body} />
              </div>
            )}
            {engine.failure && (
              <p className="mt-4 border-l-2 border-refusal pl-3 text-sm text-refusal">
                {engine.failure.message}
              </p>
            )}

            <div className="mt-6">{refusals && <RefusalTable rows={refusals} />}</div>
          </div>
        )}

        {tab === 'fairness' && (
          <div role="tabpanel" id="panel-fairness" aria-labelledby="tab-fairness">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Revealed seeds</h3>
                <p className="mt-1 text-xs text-muted">
                  Retired seeds, disclosed in full. Every outcome they produced can be recomputed
                  from them.
                </p>
                {revealed && revealed.length === 0 && (
                  <Empty>No seed has been retired yet.</Empty>
                )}
                {revealed && revealed.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {revealed.slice(0, 6).map((s) => (
                      <li
                        key={s.seedHash}
                        className="rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="mono text-fairness">{shortHash(s.seedHash, 12, 8)}</span>
                          <span className="mono text-muted">{formatTime(s.revealedAt)}</span>
                        </div>
                        <div className="mono mt-1 flex items-baseline gap-2 break-all text-muted">
                          {shortHash(s.seed, 16, 8)}
                          <Copy value={s.seed} label="revealed seed" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="text-sm font-semibold">How an outcome is computed</h3>
                <pre className="mono mt-3 overflow-x-auto rounded-lg border border-line bg-bg/60 px-3 py-3 text-xs">
{`hmac = HMAC_SHA256(
  key     = UTF8(serverSeed),
  message = UTF8(\`\${clientSeed}:\${nonce}\`)
)
roll = (first 8 hex of hmac as integer) % 10000 / 100
win  = roll < targetUnder        (strictly less than)`}
                </pre>
                <p className="mt-3 text-sm text-muted">
                  The server seed is 64 lowercase hex characters, and it is that text which is
                  hashed and keyed — not the 32 bytes it encodes. The hash is published before the
                  seed is used; the plaintext is disclosed only after rotation, which is what makes
                  any of this checkable.
                </p>
                <p className="mono mt-3 text-xs text-muted">Proof: {PROOF.seed.test}</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'affiliate' && (
          <div role="tabpanel" id="panel-affiliate" aria-labelledby="tab-affiliate">
            <h3 className="text-sm font-semibold">Commission accrues as postings</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              An affiliate’s earnings are not a counter that someone increments. They are the sum
              of commission postings to that account, which is why the figure below can never
              disagree with the ledger.
            </p>
            {affiliate ? (
              <div className="mt-4 flex flex-wrap items-end gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted">Earned</p>
                  <p className="num mt-1 text-3xl font-semibold">
                    {formatMinor(affiliate.earnedMinor)}
                  </p>
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
