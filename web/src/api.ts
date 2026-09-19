import type {
  Affiliate,
  AccountBalance,
  BetRow,
  Commitment,
  Health,
  Invariants,
  JournalEntry,
  Me,
  PlacedBet,
  RefusalRow,
  RevealedSeed,
  RotateResult,
  StormResult,
  WebhookResult,
} from './types.ts';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');
export const API_BASE = BASE;

/**
 * A refused request is not a failure to report generically -- the refusal body
 * is the proof. ApiError keeps it intact so the UI can render the code, the
 * message and whatever structured detail came with it.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }

  get refusal(): { code: string; message: string; [k: string]: unknown } | null {
    const b = this.body as Record<string, unknown> | null;
    if (b && typeof b === 'object' && b.refused === true && typeof b.code === 'string') {
      return b as { code: string; message: string };
    }
    return null;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE}${path}`, {
    // /bets and /me authenticate with the signed session cookie.
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
};

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => request<Health>('/health'),
  startSession: () => post<{ userId: string }>('/session'),
  me: () => request<Me>('/me'),

  accounts: () => request<AccountBalance[]>('/ledger/accounts'),
  entries: (limit = 50) => request<JournalEntry[]>(`/ledger/entries?limit=${limit}`),
  invariants: () => request<Invariants>('/ledger/invariants'),

  deposit: (body: {
    event_id: string;
    provider: string;
    type: 'deposit.succeeded';
    user_id: string;
    amount_minor: number;
  }) => post<WebhookResult>('/webhooks/payment', body),
  storm: (body: { count: number; event_id: string; user_id: string; amount_minor: number }) =>
    post<StormResult>('/demo/webhook-storm', body),
  putBalance: () => request<never>('/balance', { method: 'PUT' }),

  placeBet: (body: {
    betId: string;
    amountMinor: number;
    targetUnder: string;
    clientSeed: string;
    seedHash?: string;
  }) => post<PlacedBet>('/bets', body),
  bets: (limit = 20) => request<BetRow[]>(`/bets?limit=${limit}`),
  round: (id: string) => request<unknown>(`/rounds/${encodeURIComponent(id)}`),

  seed: () => request<Commitment>('/fairness/seed'),
  rotate: () => post<RotateResult>('/fairness/rotate'),
  revealedSeeds: () => request<RevealedSeed[]>('/fairness/seeds'),

  refusals: () => request<RefusalRow[]>('/refusals'),
  affiliate: (id: string) => request<Affiliate>(`/affiliate/${encodeURIComponent(id)}`),
};
