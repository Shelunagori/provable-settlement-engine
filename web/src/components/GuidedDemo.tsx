import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  Disclosure,
  HashValue,
  MoneyFlow,
  SectionHeading,
} from './ui.tsx';
import { CheckCircleIcon } from './icons.tsx';
import { DemoProgress, STEPS } from './DemoProgress.tsx';
import { RefusalCard } from './RefusalCard.tsx';
import { ResultCard } from './ResultCard.tsx';
import { formatHundredths } from '../fairness/verify.ts';
import { formatMinor, formatSignedMinor, multiplierFor } from '../format.ts';
import type { useEngine } from '../hooks/useEngine.ts';
import type { BetRow, Commitment, JournalEntry, Me } from '../types.ts';

type StepState = 'waiting' | 'ready' | 'done';

const Step = ({
  index,
  title,
  lead,
  state,
  children,
  innerRef,
}: {
  index: number;
  title: string;
  lead: string;
  state: StepState;
  children: ReactNode;
  innerRef?: React.Ref<HTMLLIElement>;
}) => (
  <li className="relative scroll-mt-24 pl-11" ref={innerRef}>
    <span
      className={`absolute left-0 top-0.5 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
        state === 'done'
          ? 'border-accent-border bg-accent-soft text-accent-text'
          : state === 'ready'
            ? 'border-accent bg-surface text-accent-text'
            : 'border-line bg-surface text-muted'
      }`}
      aria-hidden="true"
    >
      {state === 'done' ? <CheckCircleIcon className="h-4 w-4" /> : String(index).padStart(2, '0')}
    </span>
    <h3 className="text-base font-semibold">{title}</h3>
    <span className="sr-only">
      {state === 'done' ? 'completed' : state === 'ready' ? 'current step' : 'not started'}
    </span>
    <p className="mt-0.5 max-w-xl text-sm text-ink-2">{lead}</p>
    <div className="mt-3.5">{children}</div>
  </li>
);

const Field = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-muted">{hint}</p>}
  </div>
);

const inputClass =
  'mono w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:border-muted';

const AMOUNT_PRESETS = [100, 500, 1000, 2500];

export const GuidedDemo = ({
  engine,
  me,
  commitment,
  entries,
  lastBet,
}: {
  engine: ReturnType<typeof useEngine>;
  me: Me | null;
  commitment: Commitment | null;
  entries: JournalEntry[] | null;
  lastBet: BetRow | null;
}) => {
  const [amount, setAmount] = useState('500');
  const [target, setTarget] = useState('50.00');
  const [clientSeed, setClientSeed] = useState<string>(() => crypto.randomUUID());
  const [refocus, setRefocus] = useState(false);
  const outcomeRef = useRef<HTMLLIElement>(null);

  const amountMinor = Number(amount);
  const input = { amountMinor, targetUnder: target, clientSeed };

  const depositEntry = entries?.find((e) => e.id === engine.depositEntryId) ?? null;
  const funded = (me?.balanceMinor ?? 0) > 0;
  const { bet, reveal, verification } = engine;
  const verified = verification?.state === 'done';

  const current = verified ? 5 : reveal ? 5 : bet ? 4 : funded ? 2 : 1;

  // "Run another demo" puts you back at step 2 with a fresh seed, without
  // touching anything the server recorded.
  useEffect(() => {
    if (!refocus) return;
    outcomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setRefocus(false);
  }, [refocus]);

  const runAnother = () => {
    engine.restart();
    setClientSeed(crypto.randomUUID());
    setRefocus(true);
  };

  const potential =
    Number.isFinite(amountMinor) && Number(target) > 0
      ? Math.floor((amountMinor * 9900) / Math.round(Number(target) * 100))
      : 0;

  return (
    <div id="demo" className="scroll-mt-20">
      <SectionHeading
        eyebrow="Guided demo"
        title="Move real money in five steps"
        lead="Every step calls the live API. This page decides nothing."
      />

      <DemoProgress current={current} />

      <ol className="space-y-8">
        <Step index={1} title={STEPS[0]!} lead="Money arrives the way it would in production." state={funded ? 'done' : 'ready'}>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={funded ? 'secondary' : 'primary'}
              onClick={() => void engine.deposit(1000)}
              busy={engine.busy === 'deposit'}
            >
              Add 10.00
            </Button>
            <span className="text-sm text-ink-2">
              Balance {me ? formatMinor(me.balanceMinor) : '—'}
            </span>
          </div>

          {depositEntry && (
            <div className="mt-3 max-w-sm animate-rise">
              <MoneyFlow
                title="Funds added"
                entryId={depositEntry.id}
                postings={depositEntry.postings}
                format={formatSignedMinor}
              />
            </div>
          )}

          <Disclosure summary="Why this works" className="mt-3">
            A payment provider notifies the server, which writes one journal entry with postings
            that sum to zero. The database rejects an entry that does not balance.
          </Disclosure>
        </Step>

        <Step
          innerRef={outcomeRef}
          index={2}
          title={STEPS[1]!}
          lead="Pick a stake and a target. The result comes from a secret committed before you click."
          state={bet ? 'done' : funded ? 'ready' : 'waiting'}
        >
          <Card className="max-w-2xl p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="amount" label="Stake" hint="500 is 5.00.">
                <input
                  id="amount"
                  className={inputClass}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {AMOUNT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(String(p))}
                      className={`mono rounded-md border px-2 py-1 text-xs ${
                        amount === String(p)
                          ? 'border-accent-border bg-accent-soft text-accent-text'
                          : 'border-line text-muted hover:text-ink'
                      }`}
                    >
                      {formatMinor(p)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field id="target" label="Target under" hint="Wins below this number.">
                <input
                  id="target"
                  className={inputClass}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
                <input
                  id="targetRange"
                  type="range"
                  aria-label="Target under"
                  min={100}
                  max={9800}
                  step={1}
                  value={Math.round(Number(target) * 100) || 100}
                  onChange={(e) => setTarget((Number(e.target.value) / 100).toFixed(2))}
                  className="w-full accent-[var(--c-accent)]"
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field id="clientSeed" label="Your seed" hint="Yours to choose — it goes into the result.">
                <div className="flex gap-2">
                  <input
                    id="clientSeed"
                    className={inputClass}
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                  />
                  <Button variant="secondary" size="sm" onClick={() => setClientSeed(crypto.randomUUID())}>
                    New
                  </Button>
                </div>
              </Field>
            </div>

            <p className="mt-4 rounded-lg border border-line bg-subtle px-3 py-2 text-xs text-ink-2">
              Pays <span className="num">{formatMinor(potential)}</span> if it wins · the server
              calculates this, not the page.
            </p>

            <div className="mt-4">
              <Button
                variant="primary"
                size="lg"
                onClick={() => void engine.placeBet(input, commitment ? { seedHash: commitment.seedHash } : {})}
                busy={engine.busy === 'bet'}
              >
                Run demo
              </Button>
            </div>

            <Disclosure summary="Technical details" className="mt-3">
              Multiplier ×{multiplierFor(Number(target))} at a 1% margin. The outcome settles
              against commitment{' '}
              {commitment ? (
                <HashValue value={commitment.seedHash} label="active commitment" head={8} tail={6} />
              ) : (
                '…'
              )}{' '}
              at nonce <span className="mono">{commitment?.nonce ?? '—'}</span>. Stake, limits and
              payout are all decided server-side.
            </Disclosure>
          </Card>

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
        </Step>

        <Step
          index={3}
          title={STEPS[2]!}
          lead="The result, and the two ledger entries it wrote."
          state={bet ? 'done' : 'waiting'}
        >
          {bet ? (
            <ResultCard bet={bet} entries={entries} />
          ) : (
            <Card className="p-5 text-sm text-muted">
              Run the demo above and the result appears here.
            </Card>
          )}
        </Step>

        <Step
          index={4}
          title={STEPS[3]!}
          lead="The secret behind the commitment is disclosed once the seed retires."
          state={reveal ? 'done' : bet ? 'ready' : 'waiting'}
        >
          <Button
            variant={bet && !reveal ? 'primary' : 'secondary'}
            onClick={() => void engine.rotate()}
            busy={engine.busy === 'rotate'}
          >
            Reveal commitment
          </Button>
          <p className="mt-2 text-xs text-muted">
            This rotates the active secret and reveals the previous one.
          </p>

          {reveal && (
            <Card className="mt-4 max-w-2xl animate-rise p-4">
              <p className={`text-sm font-medium ${reveal.matches ? 'text-accent-text' : 'text-refusal'}`}>
                {reveal.matches ? 'Commitment verified ✓' : 'Commitment did not verify ✗'}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                {reveal.matches
                  ? 'The revealed secret hashes to the commitment published before the outcome.'
                  : 'The revealed secret does not hash to the published commitment.'}
              </p>
              <Disclosure summary="View cryptographic details" className="mt-3">
                <dl className="space-y-2">
                  <div>
                    <dt className="text-muted">Revealed seed</dt>
                    <dd className="mt-0.5">
                      <HashValue value={reveal.seed} label="revealed seed" tone="muted" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Commitment published earlier</dt>
                    <dd className="mt-0.5">
                      <HashValue value={reveal.seedHash} label="published commitment" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">SHA-256 computed in this browser</dt>
                    <dd className="mt-0.5">
                      <HashValue value={reveal.computedHash} label="computed hash" tone="muted" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Next commitment now active</dt>
                    <dd className="mt-0.5">
                      <HashValue value={reveal.nextHash} label="next commitment" />
                    </dd>
                  </div>
                </dl>
                <p className="mt-2">Known technically as seed rotation.</p>
              </Disclosure>
            </Card>
          )}
        </Step>

        <Step
          index={5}
          title={STEPS[4]!}
          lead="Your browser reproduces the result without asking the server for the answer."
          state={verified ? 'done' : reveal ? 'ready' : 'waiting'}
        >
          <Button
            variant={reveal && !verified ? 'primary' : 'secondary'}
            onClick={() => lastBet && void engine.verify(lastBet)}
            busy={engine.busy === 'verify'}
            disabled={!lastBet}
          >
            Verify in browser
          </Button>
          {!lastBet && <p className="mt-2 text-xs text-muted">Run the demo first.</p>}

          {verification?.state === 'unrevealed' && (
            <p className="mt-4 border-l-2 border-pending bg-pending-soft py-2 pl-3 text-sm text-ink-2">
              That result's seed is still active. Reveal it in step 04 first — a seed still in use
              is never disclosed.
            </p>
          )}

          {verification?.state === 'done' && (
            <Card tier="primary" className="mt-4 max-w-2xl animate-rise p-5">
              <p
                className={`text-sm font-semibold uppercase tracking-[0.14em] ${
                  verification.matches ? 'text-accent-text' : 'text-refusal'
                }`}
              >
                {verification.matches ? 'Verified ✓' : 'Mismatch ✗'}
              </p>
              <p className="mt-1.5 text-base text-ink">
                {verification.matches
                  ? 'Your browser reproduced the result independently.'
                  : 'Your browser did not reproduce the server’s result.'}
              </p>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-subtle px-3 py-2">
                  <dt className="text-xs text-muted">Browser result</dt>
                  <dd className="num mt-0.5 text-xl">
                    {formatHundredths(verification.browserHundredths)}
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-subtle px-3 py-2">
                  <dt className="text-xs text-muted">Server result</dt>
                  <dd className="num mt-0.5 text-xl">
                    {formatHundredths(verification.serverHundredths)}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-sm font-medium text-ink">
                {verification.matches ? 'Exact match' : 'Values differ'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={verification.commitmentOk ? 'accent' : 'refusal'} icon>
                  Commitment verified
                </Badge>
                <Badge tone={verification.matches ? 'accent' : 'refusal'} icon>
                  Outcome verified
                </Badge>
              </div>

              <Disclosure summary="View cryptographic details" className="mt-3">
                <p className="text-muted">HMAC-SHA256 computed in this browser</p>
                <div className="mt-1">
                  <HashValue value={verification.hmac} label="browser HMAC" tone="muted" head={12} tail={8} />
                </div>
              </Disclosure>

              <div className="mt-5 border-t border-line pt-4">
                <Button variant="primary" onClick={runAnother}>
                  Run another demo
                </Button>
              </div>
            </Card>
          )}
        </Step>
      </ol>
    </div>
  );
};
