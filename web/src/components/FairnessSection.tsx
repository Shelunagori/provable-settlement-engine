import { Badge, Button, Card, Disclosure, HashValue, SectionHeading } from './ui.tsx';
import { CheckCircleIcon } from './icons.tsx';
import { formatHundredths } from '../fairness/verify.ts';
import type { useEngine } from '../hooks/useEngine.ts';
import type { BetRow } from '../types.ts';

const STEP_LABEL: Record<string, string> = {
  revealing: 'Step 1 of 2 — revealing the previous secret…',
  verifying: 'Step 2 of 2 — recalculating the result in your browser…',
};

/**
 * Fairness is an answer to a question someone chose to ask, not a hoop on the
 * way to placing a bet. One button drives both operations it needs; the
 * cryptography is named in the progress line and shown in full underneath.
 */
export const FairnessSection = ({
  engine,
  lastBet,
}: {
  engine: ReturnType<typeof useEngine>;
  lastBet: BetRow | null;
}) => {
  const { reveal, verification, fairnessStep } = engine;
  const busy = engine.busy === 'fairness';
  const verified = verification?.state === 'done';

  return (
    <section id="fairness" className="scroll-mt-20 pt-14">
      <SectionHeading eyebrow="Fairness" title="How can I verify this bet?" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card as="div" className="p-5">
          <p className="text-sm leading-relaxed text-ink-2">
            Before your bet, the server commits to a secret. After that secret is rotated and
            revealed, your browser can independently calculate the same result.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            That means the server cannot change the committed secret after seeing your bet.
          </p>

          <div className="mt-5">
            <Button
              variant="primary"
              onClick={() => lastBet && void engine.verifyFairness(lastBet)}
              busy={busy}
              disabled={!lastBet}
            >
              Reveal &amp; verify
            </Button>
            {!lastBet && (
              <p className="mt-2 text-xs text-muted">Place a bet first, then check it here.</p>
            )}
            {busy && fairnessStep in STEP_LABEL && (
              <p className="mt-2 text-xs text-ink-2" aria-live="polite">
                {STEP_LABEL[fairnessStep]}
              </p>
            )}
          </div>

          {verification?.state === 'unrevealed' && (
            <p className="mt-4 border-l-2 border-pending bg-pending-soft py-2 pl-3 text-sm text-ink-2">
              That bet's secret is still in use, so it has not been disclosed yet. Place another
              bet and check again.
            </p>
          )}
        </Card>

        <Card as="div" tier={verified ? 'primary' : 'secondary'} className="p-5">
          {!verified && !reveal && (
            <p className="text-sm text-muted">
              Your browser's own calculation will appear here — it never asks the server what the
              answer should be.
            </p>
          )}

          {verified && (
            <div className="animate-rise">
              <p
                className={`flex items-center gap-2 text-lg font-semibold ${
                  verification.matches ? 'text-accent-text' : 'text-refusal'
                }`}
              >
                {verification.matches && <CheckCircleIcon className="h-5 w-5" />}
                {verification.matches ? 'Verified' : 'Mismatch'}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                {verification.matches
                  ? 'Your browser reproduced the result independently.'
                  : 'Your browser did not reproduce the server’s result.'}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3">
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

              <p className="mt-3 text-sm font-medium">
                {verification.matches ? 'Exact match' : 'Values differ'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={verification.commitmentOk ? 'accent' : 'refusal'} icon>
                  Commitment checked
                </Badge>
                <Badge tone={verification.matches ? 'accent' : 'refusal'} icon>
                  Result reproduced
                </Badge>
              </div>
            </div>
          )}

          {reveal && (
            <Disclosure summary="View cryptographic details" className="mt-4">
              <dl className="space-y-2">
                <div>
                  <dt className="text-muted">Revealed secret</dt>
                  <dd className="mt-0.5">
                    <HashValue value={reveal.seed} label="revealed secret" tone="muted" />
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
                {verified && (
                  <div>
                    <dt className="text-muted">HMAC-SHA256 computed in this browser</dt>
                    <dd className="mt-0.5">
                      <HashValue value={verification.hmac} label="browser HMAC" tone="muted" head={12} tail={8} />
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mt-2">
                Rotating the secret is known technically as seed rotation; the check itself is
                HMAC-SHA256 over your client seed and the bet's nonce.
              </p>
            </Disclosure>
          )}
        </Card>
      </div>
    </section>
  );
};
