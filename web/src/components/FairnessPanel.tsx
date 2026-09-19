import { useState } from 'react';
import { api } from '../api.ts';
import {
  computeBrowserOutcome,
  formatHundredths,
  parseHundredths,
  sha256Text,
} from '../fairness/verify.ts';
import { Copy, Empty, Panel } from './Panel.tsx';
import type { BetRow, Commitment, RevealedSeed } from '../types.ts';

type Reveal = {
  seed: string;
  seedHash: string;
  computedHash: string;
  matches: boolean;
  nextHash: string;
};

type Verification =
  | { state: 'unrevealed' }
  | { state: 'missing' }
  | {
      state: 'done';
      commitmentOk: boolean;
      browserHundredths: number;
      serverHundredths: number;
      matches: boolean;
      hmac: string;
    };

export const FairnessPanel = ({
  commitment,
  revealed,
  lastBet,
  onRotated,
  toast,
}: {
  commitment: Commitment | null;
  revealed: RevealedSeed[] | null;
  lastBet: BetRow | null;
  onRotated: () => void;
  toast: (text: string) => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const rotate = async () => {
    setBusy('rotate');
    try {
      const res = await api.rotate();
      // Recomputed here, in this browser. The server's own opinion of whether
      // the seed matches its commitment is not what makes this a proof.
      const computedHash = await sha256Text(res.revealed.seed);
      const matches = computedHash === res.revealed.seedHash;
      setReveal({
        seed: res.revealed.seed,
        seedHash: res.revealed.seedHash,
        computedHash,
        matches,
        nextHash: res.next.seedHash,
      });
      toast(`Seed rotated · old commitment ${matches ? 'verified' : 'MISMATCH'}`);
      onRotated();
    } finally {
      setBusy(null);
    }
  };

  const verifyLastBet = async () => {
    if (!lastBet?.seedHash || lastBet.nonce === null || lastBet.roll === null) return;
    setBusy('verify');
    try {
      const seeds = await api.revealedSeeds();
      const match = seeds.find((s) => s.seedHash === lastBet.seedHash);
      if (!match) {
        setVerification({ state: 'unrevealed' });
        return;
      }
      const commitmentOk = (await sha256Text(match.seed)) === lastBet.seedHash;
      const outcome = await computeBrowserOutcome(match.seed, lastBet.clientSeed, lastBet.nonce);
      const serverHundredths = parseHundredths(lastBet.roll.toFixed(2));
      setVerification({
        state: 'done',
        commitmentOk,
        browserHundredths: outcome.rollHundredths,
        serverHundredths,
        // Compared as integers, so a difference of one hundredth cannot be
        // rounded into agreement.
        matches: outcome.rollHundredths === serverHundredths,
        hmac: outcome.hmac,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel label="Fairness" description="Seed custody, commitment, and verification in this browser.">
      <div className="space-y-4">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Committed seed hash
          </h3>
          {commitment ? (
            <>
              <p className="num mt-1 break-all text-[11px] text-fairness">{commitment.seedHash}</p>
              <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <span className="num">nonce {commitment.nonce}</span>
                <Copy value={commitment.seedHash} label="committed seed hash" />
              </p>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Loading commitment…</p>
          )}
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Last bet
          </h3>
          {!lastBet && <Empty>Place a bet to create a verifiable outcome.</Empty>}
          {lastBet && (
            <dl className="num mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              <dt className="text-muted">bet</dt>
              <dd className="break-all">{lastBet.id}</dd>
              <dt className="text-muted">seed hash</dt>
              <dd className="break-all text-fairness">{lastBet.seedHash}</dd>
              <dt className="text-muted">client seed</dt>
              <dd className="break-all">{lastBet.clientSeed}</dd>
              <dt className="text-muted">nonce</dt>
              <dd>{lastBet.nonce}</dd>
              <dt className="text-muted">roll</dt>
              <dd>{lastBet.roll?.toFixed(2)}</dd>
              <dt className="text-muted">target</dt>
              <dd>{lastBet.targetUnder.toFixed(2)}</dd>
              <dt className="text-muted">result</dt>
              <dd className={lastBet.won ? 'text-accent' : 'text-refusal'}>
                {lastBet.won ? 'WIN' : 'LOSS'}
              </dd>
            </dl>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void rotate()}
            disabled={busy !== null}
            className="rounded border border-line px-2.5 py-1.5 text-xs hover:border-muted disabled:opacity-50"
          >
            {busy === 'rotate' ? '…' : 'Rotate & reveal'}
          </button>
          <button
            type="button"
            onClick={() => void verifyLastBet()}
            disabled={busy !== null || !lastBet}
            className="rounded border border-fairness/50 px-2.5 py-1.5 text-xs text-fairness hover:border-fairness disabled:opacity-50"
          >
            {busy === 'verify' ? '…' : 'Verify last bet in browser'}
          </button>
        </div>

        {reveal && (
          <div className="rounded border border-line px-3 py-2 text-[11px]">
            <h4 className="text-muted">Revealed seed</h4>
            <p className="num mt-1 break-all">{reveal.seed}</p>
            <p className="num mt-1 break-all text-muted">committed {reveal.seedHash}</p>
            <p className="num mt-1 break-all text-muted">sha256 {reveal.computedHash}</p>
            <p className={`num mt-1 ${reveal.matches ? 'text-accent' : 'text-refusal'}`}>
              {reveal.matches
                ? 'matches committed hash ✓ (computed in this browser)'
                : 'DOES NOT MATCH the committed hash'}
            </p>
            <p className="num mt-1 break-all text-muted">next active {reveal.nextHash}</p>
          </div>
        )}

        {verification?.state === 'unrevealed' && (
          <p className="border-l-2 border-pending pl-3 text-[11px] text-muted">
            This seed is still active. Rotate &amp; reveal it before independent verification.
          </p>
        )}
        {verification?.state === 'done' && (
          <div
            className={`border-l-2 pl-3 text-[11px] ${
              verification.matches && verification.commitmentOk
                ? 'border-accent'
                : 'border-refusal'
            }`}
          >
            <p className={verification.commitmentOk ? 'text-accent' : 'text-refusal'}>
              commitment {verification.commitmentOk ? '✓' : '✗'}
            </p>
            <p className={verification.matches ? 'text-accent' : 'text-refusal'}>
              roll {formatHundredths(verification.browserHundredths)}{' '}
              {verification.matches
                ? '✓ matches server'
                : `✗ server said ${formatHundredths(verification.serverHundredths)}`}
            </p>
            <p className="num mt-1 break-all text-muted">hmac {verification.hmac}</p>
          </div>
        )}

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Revealed history
          </h3>
          {revealed && revealed.length === 0 && (
            <Empty>Rotate the active seed to reveal its commitment proof.</Empty>
          )}
          {revealed && revealed.length > 0 && (
            <ul className="mt-1 space-y-1">
              {revealed.slice(0, 4).map((s) => (
                <li key={s.seedHash} className="num break-all text-[11px] text-muted">
                  {s.seedHash.slice(0, 16)}… · revealed {s.revealedAt.slice(11, 19)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setHowOpen((v) => !v)}
            aria-expanded={howOpen}
            className="text-[11px] uppercase tracking-wide text-muted hover:text-ink"
          >
            How
          </button>
          {howOpen && (
            <div className="mt-2 space-y-2 text-[11px] text-muted">
              <pre className="num overflow-x-auto rounded border border-line bg-bg px-2 py-2">
{`hmac = HMAC_SHA256(
  key     = UTF8(serverSeed),
  message = UTF8(\`\${clientSeed}:\${nonce}\`)
)
roll = (first 8 hex of hmac as integer) % 10000 / 100
win  = roll < targetUnder        (strictly less than)`}
              </pre>
              <p>
                The server seed is 64 lowercase hex characters, and it is that text which is
                hashed and keyed — not the 32 bytes it encodes.
              </p>
              <p>
                The hash was published before the seed was used. The plaintext is disclosed only
                after rotation, which is what makes any of this checkable.
              </p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};
