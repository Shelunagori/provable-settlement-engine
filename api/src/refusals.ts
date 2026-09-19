/**
 * The refusal table.
 *
 * A refusal is a deliberate, server-side "no" with a stable code, as distinct
 * from an unexpected error or a malformed request. Every one of them is
 * enforced where the decision can actually be trusted -- inside the
 * transaction, under the relevant lock -- never in the client and never in a
 * pre-flight check a later caller could skip.
 *
 * This object is the contract. `GET /refusals` serves it, `docs/REFUSALS.md`
 * is generated from it, and the tests assert against it, so there is one table
 * rather than three that can drift apart.
 *
 * Not in this table, deliberately: INVALID_PAYLOAD, NO_SUCH_ROUND and
 * INTERNAL_ERROR. Those are transport-level answers about a request that never
 * became a business decision.
 */
export const OFFICIAL_REFUSAL_CODES = [
  'INSUFFICIENT_FUNDS',
  'BET_BELOW_MIN',
  'BET_ABOVE_MAX',
  'DAILY_LOSS_LIMIT',
  'ROUND_CLOSED',
  'DUPLICATE_BET',
  'INVALID_TARGET',
  'SEED_ROTATED',
  'NOT_AUTHENTICATED',
] as const;

export type RefusalCode = (typeof OFFICIAL_REFUSAL_CODES)[number];

export type RefusalSpec = { httpStatus: number; summary: string; enforcedIn: string };

export const REFUSALS: Record<RefusalCode, RefusalSpec> = {
  INSUFFICIENT_FUNDS: {
    httpStatus: 409,
    summary: 'The derived balance of the account cannot absorb this debit.',
    enforcedIn: 'postEntry(), inside the caller transaction, under the account row lock',
  },
  BET_BELOW_MIN: {
    httpStatus: 422,
    summary: 'The stake is below the minimum of 100 minor units.',
    enforcedIn: 'placeBet(), before any persistent write',
  },
  BET_ABOVE_MAX: {
    httpStatus: 422,
    summary: 'The stake is above the maximum of 50000 minor units.',
    enforcedIn: 'placeBet(), before any persistent write',
  },
  DAILY_LOSS_LIMIT: {
    httpStatus: 429,
    summary:
      "This stake would take the account's net loss for the current UTC day past 200000 minor units.",
    enforcedIn:
      'placeBet(), under a per-user advisory lock, computed from postings inside the transaction',
  },
  ROUND_CLOSED: {
    httpStatus: 409,
    summary: 'The round is not in the state this transition requires.',
    enforcedIn: 'engine/round.ts, under SELECT ... FOR UPDATE on the round',
  },
  DUPLICATE_BET: {
    httpStatus: 409,
    summary: 'A bet with this id already exists; its original outcome is returned unchanged.',
    enforcedIn: 'placeBet(), under a transaction-scoped advisory lock on the bet id',
  },
  INVALID_TARGET: {
    httpStatus: 422,
    summary: 'targetUnder must be an exact decimal between 1.00 and 98.00.',
    enforcedIn: 'bet input parsing, before any write',
  },
  SEED_ROTATED: {
    httpStatus: 409,
    summary: 'The supplied commitment is no longer the active seed.',
    enforcedIn: 'placeBet(), under SELECT ... FOR UPDATE on the active seed, before the nonce moves',
  },
  NOT_AUTHENTICATED: {
    httpStatus: 401,
    summary: 'No valid session: missing, malformed, unknown or expired.',
    enforcedIn: 'auth/session.ts preHandler, against the sessions table',
  },
};

export class RefusalError extends Error {
  readonly refused = true as const;
  readonly httpStatus: number;

  constructor(
    readonly code: RefusalCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'RefusalError';
    this.httpStatus = REFUSALS[code].httpStatus;
  }

  toBody(): Record<string, unknown> {
    return { refused: true, code: this.code, message: this.message, ...this.details };
  }
}

export const isRefusal = (err: unknown): err is RefusalError => err instanceof RefusalError;

/** The table as data, for GET /refusals and for generating docs/REFUSALS.md. */
export const refusalTable = (): ({ code: RefusalCode } & RefusalSpec)[] =>
  OFFICIAL_REFUSAL_CODES.map((code) => ({ code, ...REFUSALS[code] }));
