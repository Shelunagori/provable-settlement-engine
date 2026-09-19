import { api } from '../api.ts';
import { computeBrowserOutcome, parseHundredths, sha256Text } from '../fairness/verify.ts';
import type { BetRow } from '../types.ts';

/** The reveal of a retired seed, checked here rather than taken on trust. */
export type Reveal = {
  seed: string;
  seedHash: string;
  computedHash: string;
  matches: boolean;
  nextHash: string;
};

export type Verification =
  | { state: 'unrevealed' }
  | {
      state: 'done';
      commitmentOk: boolean;
      browserHundredths: number;
      serverHundredths: number;
      matches: boolean;
      hmac: string;
      clientSeed: string;
      nonce: number;
      seed: string;
    };

/**
 * Rotate the active seed and check the disclosed plaintext against the hash the
 * server published earlier. The server's own opinion of whether they match is
 * not what makes this a proof -- the SHA-256 below runs in this browser.
 */
export const rotateAndCheck = async (): Promise<Reveal> => {
  const res = await api.rotate();
  const computedHash = await sha256Text(res.revealed.seed);
  return {
    seed: res.revealed.seed,
    seedHash: res.revealed.seedHash,
    computedHash,
    matches: computedHash === res.revealed.seedHash,
    nextHash: res.next.seedHash,
  };
};

/**
 * Recompute a settled bet from the revealed seed. Rolls are compared as
 * integer hundredths, so a difference of one hundredth cannot be rounded into
 * agreement.
 */
export const verifyBet = async (bet: BetRow): Promise<Verification> => {
  if (!bet.seedHash || bet.nonce === null || bet.roll === null) return { state: 'unrevealed' };
  const seeds = await api.revealedSeeds();
  const match = seeds.find((s) => s.seedHash === bet.seedHash);
  if (!match) return { state: 'unrevealed' };

  const commitmentOk = (await sha256Text(match.seed)) === bet.seedHash;
  const outcome = await computeBrowserOutcome(match.seed, bet.clientSeed, bet.nonce);
  const serverHundredths = parseHundredths(bet.roll.toFixed(2));

  return {
    state: 'done',
    commitmentOk,
    browserHundredths: outcome.rollHundredths,
    serverHundredths,
    matches: outcome.rollHundredths === serverHundredths,
    hmac: outcome.hmac,
    clientSeed: bet.clientSeed,
    nonce: bet.nonce,
    seed: match.seed,
  };
};
