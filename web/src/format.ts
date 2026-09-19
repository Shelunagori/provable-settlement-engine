/**
 * Money arrives as integer minor units and every decision about it has already
 * been made on the server. These helpers are for display only: nothing here
 * feeds back into a request.
 */
export const formatMinor = (value: number | bigint): string => {
  const n = BigInt(value);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}.${String(frac).padStart(2, '0')}`;
};

export const formatSignedMinor = (value: number | bigint): string => {
  const n = BigInt(value);
  return n > 0n ? `+${formatMinor(n)}` : formatMinor(n);
};

/** First and last characters of a hash, for dense display. Full value stays copyable. */
export const shortHash = (hash: string, head = 6, tail = 4): string =>
  hash.length <= head + tail ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;

export const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toISOString().slice(11, 19);
};

/** Informational only. The server decides the payout. */
export const multiplierFor = (targetUnder: number): string =>
  targetUnder <= 0 ? '—' : (99 / targetUnder).toFixed(4);

/** "12s", "3m", "2h" — compact relative time for an activity stream. */
export const relativeTime = (iso: string): string => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/** Plain-language names for ledger accounts, with the raw id kept alongside. */
export const ACCOUNT_LABEL: Record<string, string> = {
  'user:demo': 'Demo user',
  treasury: 'Treasury',
  pending_bets: 'Pending',
  gateway: 'Gateway',
  'affiliate:alice': 'Affiliate',
};

export const accountLabel = (id: string): string => ACCOUNT_LABEL[id] ?? id;

/** Plain-language names for journal entry kinds. */
export const ENTRY_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  bet_lock: 'Stake held',
  round_resolved: 'Outcome computed',
  bet_settle: 'Settled',
  commission: 'Commission',
  withdrawal: 'Withdrawal',
};

export const entryLabel = (kind: string): string => ENTRY_LABEL[kind] ?? kind;
