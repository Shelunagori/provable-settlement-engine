import { formatMinor } from '../format.ts';

/**
 * The product's unit is a credit. Money is still integer minor units end to
 * end -- this only decides how it is spoken about on screen.
 */
export const credits = (minor: number): string => `${formatMinor(minor)} credits`;

/**
 * What the server would pay for a winning bet: amount x 99 / target, truncated
 * to whole minor units. This mirrors `payoutFor()` in api/src/engine/bet.ts,
 * including the truncation, so the figure shown before a bet is the figure the
 * server settles -- but the server's answer is the one that counts, and it is
 * what the result card displays afterwards.
 */
export const potentialPayoutMinor = (amountMinor: number, targetUnder: number): number => {
  const targetHundredths = Math.round(targetUnder * 100);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0 || targetHundredths <= 0) return 0;
  return Math.floor((amountMinor * 9900) / targetHundredths);
};

/** A roll is one of 10,000 equally likely hundredths, and wins when below target. */
export const winChance = (targetUnder: number): number => {
  const targetHundredths = Math.round(targetUnder * 100);
  if (!Number.isFinite(targetHundredths) || targetHundredths <= 0) return 0;
  return Math.min(targetHundredths, 10_000) / 100;
};
