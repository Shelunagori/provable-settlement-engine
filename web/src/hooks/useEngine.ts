import { useCallback, useState } from 'react';
import { ApiError, api } from '../api.ts';
import { rotateAndCheck, verifyBet, type Reveal, type Verification } from '../components/journey.ts';
import type { BetRow, PlacedBet, StormResult } from '../types.ts';

export type Refusal = { status: number; body: Record<string, unknown> };
/** Where a one-click fairness check has got to, for a plain-English progress line. */
export type FairnessStep = 'idle' | 'revealing' | 'verifying' | 'done';
export type ActionError = { message: string };

export type BetInput = { amountMinor: number; targetUnder: string; clientSeed: string };

/**
 * Every server action the console can take, in one place.
 *
 * Nothing here decides anything: it sends a request and keeps whatever came
 * back, including a refusal. A refusal is not an error state to hide -- it is
 * the server exercising authority, and it is rendered as such.
 */
export const useEngine = ({
  onChanged,
  toast,
}: {
  onChanged: (what: 'deposit' | 'bet' | 'seed' | 'reset') => void;
  toast: (text: string) => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [failure, setFailure] = useState<ActionError | null>(null);

  const [bet, setBet] = useState<PlacedBet | null>(null);
  const [lastBetId, setLastBetId] = useState<string | null>(null);
  const [depositEntryId, setDepositEntryId] = useState<number | null>(null);
  const [storm, setStorm] = useState<StormResult | null>(null);
  const [balanceProbe, setBalanceProbe] = useState<{ status: number; body: unknown } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [fairnessStep, setFairnessStep] = useState<FairnessStep>('idle');

  const run = useCallback(async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setRefusal(null);
    setFailure(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.refusal) {
        setRefusal({ status: err.status, body: err.body as Record<string, unknown> });
      } else {
        setFailure({ message: (err as Error).message });
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const deposit = useCallback(
    (amountMinor = 1000) =>
      run('deposit', async () => {
        const res = await api.deposit({
          event_id: crypto.randomUUID(),
          provider: 'demo',
          type: 'deposit.succeeded',
          user_id: 'user:demo',
          amount_minor: amountMinor,
        });
        setDepositEntryId(res.entryId);
        toast(`Funds added · journal entry #${res.entryId}`);
        onChanged('deposit');
      }),
    [run, onChanged, toast],
  );

  const runStorm = useCallback(
    (count = 20) =>
      run('storm', async () => {
        const res = await api.storm({
          count,
          event_id: crypto.randomUUID(),
          user_id: 'user:demo',
          amount_minor: 1000,
        });
        setStorm(res);
        toast(`${res.sent} identical notifications · ${res.posted} posted · ${res.deduplicated} ignored`);
        onChanged('deposit');
      }),
    [run, onChanged, toast],
  );

  const probeBalanceWrite = useCallback(
    () =>
      run('balance', async () => {
        try {
          await api.putBalance();
          setBalanceProbe({ status: 200, body: { unexpected: 'the endpoint answered' } });
        } catch (err) {
          if (err instanceof ApiError) {
            setBalanceProbe({ status: err.status, body: err.body });
            return;
          }
          throw err;
        }
      }),
    [run],
  );

  const placeBet = useCallback(
    (input: BetInput, opts?: { betId?: string; seedHash?: string; remember?: boolean }) =>
      run('bet', async () => {
        const betId = opts?.betId ?? crypto.randomUUID();
        const placed = await api.placeBet({
          betId,
          amountMinor: input.amountMinor,
          targetUnder: input.targetUnder,
          clientSeed: input.clientSeed,
          ...(opts?.seedHash ? { seedHash: opts.seedHash } : {}),
        });
        setBet(placed);
        setVerification(null);
        if (opts?.remember !== false) setLastBetId(betId);
        toast(
          `Outcome settled · roll ${placed.roll.toFixed(2)} · ${placed.won ? 'won' : 'lost'} · round ${placed.bet.roundId.slice(0, 8)}…`,
        );
        onChanged('bet');
      }),
    [run, onChanged, toast],
  );

  const replayLastBet = useCallback(
    (input: BetInput) => {
      if (!lastBetId) return Promise.resolve();
      return placeBet(input, { betId: lastBetId, remember: false });
    },
    [lastBetId, placeBet],
  );

  const rotate = useCallback(
    () =>
      run('rotate', async () => {
        const res = await rotateAndCheck();
        setReveal(res);
        toast(
          res.matches
            ? 'Seed revealed · its hash matches the earlier commitment'
            : 'Seed revealed · hash does NOT match the commitment',
        );
        onChanged('seed');
      }),
    [run, onChanged, toast],
  );

  const verify = useCallback(
    (row: BetRow) =>
      run('verify', async () => {
        setVerification(await verifyBet(row));
      }),
    [run],
  );

  /**
   * One action for the person, two operations underneath.
   *
   * A bet can only be checked once the secret it used has been retired and
   * disclosed, so this reveals first and verifies second. Asking someone to
   * understand two cryptographic steps before they can see whether the result
   * was honest is a tax on the wrong people; the steps are still named and
   * reported, they just do not have to be driven by hand.
   */
  const verifyFairness = useCallback(
    (row: BetRow) =>
      run('fairness', async () => {
        setFairnessStep('revealing');
        const revealed = await rotateAndCheck();
        setReveal(revealed);
        setFairnessStep('verifying');
        setVerification(await verifyBet(row));
        setFairnessStep('done');
        onChanged('seed');
      }),
    [run, onChanged],
  );

  /**
   * Returns the whole demo to a fresh environment. This is a server-side
   * operation: the balance lives in the ledger, so clearing the browser would
   * change nothing.
   */
  const resetDemo = useCallback(
    () =>
      run('reset', async () => {
        await api.resetDemo();
        setBet(null);
        setReveal(null);
        setVerification(null);
        setFairnessStep('idle');
        setLastBetId(null);
        setDepositEntryId(null);
        setStorm(null);
        setBalanceProbe(null);
        toast('Demo reset · your wallet is back to 0 credits');
        onChanged('reset');
      }),
    [run, onChanged, toast],
  );

  return {
    busy,
    refusal,
    failure,
    bet,
    lastBetId,
    depositEntryId,
    storm,
    balanceProbe,
    reveal,
    verification,
    fairnessStep,
    deposit,
    runStorm,
    probeBalanceWrite,
    placeBet,
    replayLastBet,
    rotate,
    verify,
    verifyFairness,
    resetDemo,
    clearOutcome: () => {
      setRefusal(null);
      setFailure(null);
    },
    /**
     * Start the journey again without erasing anything the server recorded.
     * Only this page's view of "where am I" is cleared -- the ledger, the
     * journal and the revealed seed history are untouched.
     */
    restart: () => {
      setBet(null);
      setReveal(null);
      setVerification(null);
      setFairnessStep('idle');
      setRefusal(null);
      setFailure(null);
    },
  };
};
