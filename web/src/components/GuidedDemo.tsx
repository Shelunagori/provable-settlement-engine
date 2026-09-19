import { useState, type ReactNode } from 'react';
import { Badge, Button, Card, Copy, PostingRows, SectionHeading, StatusDot } from './ui.tsx';
import { RefusalCard } from './RefusalCard.tsx';
import { ResultCard } from './ResultCard.tsx';
import { formatHundredths } from '../fairness/verify.ts';
import { formatMinor, formatSignedMinor, multiplierFor, shortHash } from '../format.ts';
import type { useEngine } from '../hooks/useEngine.ts';
import type { BetRow, Commitment, JournalEntry, Me } from '../types.ts';

type StepState = 'waiting' | 'ready' | 'done';

const Step = ({
  index,
  title,
  lead,
  state,
  children,
}: {
  index: string;
  title: string;
  lead: string;
  state: StepState;
  children: ReactNode;
}) => (
  <li className="relative pl-12">
    <span
      className={`absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${
        state === 'done'
          ? 'border-accent bg-accent/15 text-accent'
          : state === 'ready'
            ? 'border-line bg-raised text-ink'
            : 'border-line bg-surface text-muted'
      }`}
      aria-hidden="true"
    >
      {state === 'done' ? '✓' : index}
    </span>
    <div className="pb-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="sr-only">
          {state === 'done' ? 'completed' : state === 'ready' ? 'current step' : 'not started'}
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">{lead}</p>
      <div className="mt-4">{children}</div>
    </div>
  </li>
);

const Field = ({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-muted">{hint}</p>}
  </div>
);

const inputClass =
  'mono w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus-visible:border-muted';

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

  const amountMinor = Number(amount);
  const input = { amountMinor, targetUnder: target, clientSeed };

  const depositEntry = entries?.find((e) => e.id === engine.depositEntryId) ?? null;
  const funded = (me?.balanceMinor ?? 0) > 0;
  const { bet, reveal, verification } = engine;

  const potential =
    Number.isFinite(amountMinor) && Number(target) > 0
      ? Math.floor((amountMinor * 9900) / Math.round(Number(target) * 100))
      : 0;

  return (
    <div id="demo" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Guided demo"
        title="Move real ledger money in five steps"
        lead="Each step calls the live API. Nothing on this page decides whether an action is allowed, what an outcome is, or what it pays — the server does, and shows its work."
      />

      <ol className="space-y-9">
        <Step
          index="01"
          title="Add funds"
          lead="Money enters the same way it would in production: a payment provider notifies the server, and the server writes a journal entry."
          state={funded ? 'done' : 'ready'}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={funded ? 'secondary' : 'primary'}
              onClick={() => void engine.deposit(1000)}
              busy={engine.busy === 'deposit'}
            >
              Add 10.00 funds
            </Button>
            <span className="text-sm text-muted">
              Balance now {me ? formatMinor(me.balanceMinor) : '—'}
            </span>
          </div>

          {depositEntry && (
            <div className="mt-4 max-w-md animate-rise">
              <p className="mb-2 text-xs text-muted">
                Journal entry #{depositEntry.id} — two postings, summing to zero.
              </p>
              <PostingRows postings={depositEntry.postings} format={formatSignedMinor} />
            </div>
          )}
        </Step>

        <Step
          index="02"
          title="Place an outcome"
          lead="Choose a stake and a target. The outcome is derived from a secret the server committed to before you clicked."
          state={bet ? 'done' : funded ? 'ready' : 'waiting'}
        >
          <Card className="max-w-2xl p-4 sm:p-5" raised>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="amount" label="Stake" hint="Minor units — 500 is 5.00.">
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
                          ? 'border-accent text-accent'
                          : 'border-line text-muted hover:text-ink'
                      }`}
                    >
                      {formatMinor(p)}
                    </button>
                  ))}
                </div>
              </Field>

              <Field id="target" label="Target under" hint="Win if the roll is strictly below this.">
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
              <Field id="clientSeed" label="Your client seed" hint="Yours to choose — it goes into the outcome.">
                <div className="flex gap-2">
                  <input
                    id="clientSeed"
                    className={inputClass}
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setClientSeed(crypto.randomUUID())}
                  >
                    New
                  </Button>
                </div>
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-bg/40 px-3 py-2 text-xs">
              <span className="text-muted">
                Multiplier ×{multiplierFor(Number(target))} · pays {formatMinor(potential)} if it
                wins
              </span>
              <span className="text-muted">Server calculates the payout, not this page.</span>
            </div>

            <p className="mt-3 text-xs text-muted">
              Settles against commitment{' '}
              <span className="mono text-fairness">
                {commitment ? shortHash(commitment.seedHash, 10, 6) : '…'}
              </span>{' '}
              · nonce <span className="mono">{commitment?.nonce ?? '—'}</span>
            </p>

            <div className="mt-4">
              <Button
                variant="primary"
                size="lg"
                onClick={() =>
                  void engine.placeBet(input, commitment ? { seedHash: commitment.seedHash } : {})
                }
                busy={engine.busy === 'bet'}
              >
                Place the outcome
              </Button>
            </div>
          </Card>

          {engine.refusal && (
            <div className="mt-4 max-w-2xl animate-rise">
              <p className="mb-2 text-sm text-muted">
                The server refused this. That is the system working, not an error:
              </p>
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
          index="03"
          title="See the money move"
          lead="The result and the two journal entries it wrote — the stake being held, and the settlement."
          state={bet ? 'done' : 'waiting'}
        >
          {bet ? (
            <ResultCard bet={bet} entries={entries} />
          ) : (
            <Card className="p-6 text-sm text-muted">
              Place an outcome above and the result, the payout and both ledger entries appear
              here.
            </Card>
          )}
        </Step>

        <Step
          index="04"
          title="Reveal the commitment"
          lead="The secret behind the commitment is disclosed only when the seed is retired. Its hash was published before any of your outcomes existed."
          state={reveal ? 'done' : bet ? 'ready' : 'waiting'}
        >
          <Button
            variant={bet && !reveal ? 'primary' : 'secondary'}
            onClick={() => void engine.rotate()}
            busy={engine.busy === 'rotate'}
          >
            Retire the seed and reveal it
          </Button>

          {reveal && (
            <Card className="mt-4 max-w-2xl animate-rise p-4">
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-muted">Revealed seed</dt>
                  <dd className="mono mt-0.5 flex items-baseline gap-2 break-all">
                    {reveal.seed}
                    <Copy value={reveal.seed} label="revealed seed" />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Hash published earlier</dt>
                  <dd className="mono mt-0.5 break-all text-fairness">{reveal.seedHash}</dd>
                </div>
                <div>
                  <dt className="text-muted">SHA-256 computed in this browser</dt>
                  <dd className="mono mt-0.5 break-all">{reveal.computedHash}</dd>
                </div>
              </dl>
              <p className={`mt-3 text-sm ${reveal.matches ? 'text-accent' : 'text-refusal'}`}>
                <StatusDot
                  tone={reveal.matches ? 'accent' : 'refusal'}
                  label={
                    reveal.matches
                      ? 'Matches the commitment — the seed was fixed before you played'
                      : 'Does not match the commitment'
                  }
                />
              </p>
              <p className="mt-2 text-xs text-muted">
                Next commitment now active:{' '}
                <span className="mono text-fairness">{shortHash(reveal.nextHash, 10, 6)}</span>
              </p>
            </Card>
          )}
        </Step>

        <Step
          index="05"
          title="Verify the result yourself"
          lead="Your browser recomputes the roll from the revealed seed, your client seed and the nonce — using Web Crypto, without asking the server what the answer should be."
          state={verification?.state === 'done' ? 'done' : reveal ? 'ready' : 'waiting'}
        >
          <Button
            variant={reveal && verification?.state !== 'done' ? 'primary' : 'secondary'}
            onClick={() => lastBet && void engine.verify(lastBet)}
            busy={engine.busy === 'verify'}
            disabled={!lastBet}
          >
            Recompute in this browser
          </Button>
          {!lastBet && (
            <p className="mt-2 text-xs text-muted">Place an outcome first.</p>
          )}

          {verification?.state === 'unrevealed' && (
            <p className="mt-4 border-l-2 border-pending pl-3 text-sm text-muted">
              That outcome's seed is still active. Retire it in step 04 first — a seed that is
              still in use is never disclosed.
            </p>
          )}

          {verification?.state === 'done' && (
            <Card className="mt-4 max-w-2xl animate-rise p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Badge tone={verification.commitmentOk ? 'accent' : 'refusal'}>
                  Commitment {verification.commitmentOk ? 'verified' : 'failed'}
                </Badge>
                <Badge tone={verification.matches ? 'accent' : 'refusal'}>
                  Roll {verification.matches ? 'matches the server' : 'differs from the server'}
                </Badge>
              </div>
              <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Recomputed here</dt>
                  <dd className="mono mt-0.5 text-lg">
                    {formatHundredths(verification.browserHundredths)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Server said</dt>
                  <dd className="mono mt-0.5 text-lg">
                    {formatHundredths(verification.serverHundredths)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted">HMAC-SHA256 computed in this browser</dt>
                  <dd className="mono mt-0.5 break-all">{verification.hmac}</dd>
                </div>
              </dl>
            </Card>
          )}
        </Step>
      </ol>
    </div>
  );
};
