import { useCallback, useState } from 'react';
import { ApiError, api } from '../api.ts';
import { rotateAndCheck, verifyBet, type Reveal, type Verification } from '../components/journey.ts';
import type { BetRow, PlacedBet, StormResult } from '../types.ts';

export type Refusal = { status: number; body: Record<string, unknown> };
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
  onChanged: (what: 'deposit' | 'bet' | 'seed') => void;
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
    deposit,
    runStorm,
    probeBalanceWrite,
    placeBet,
    replayLastBet,
    rotate,
    verify,
    clearOutcome: () => {
      setRefusal(null);
      setFailure(null);
    },
  };
};
