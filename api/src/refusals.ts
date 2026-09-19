/**
 * A refusal is a deliberate, server-side "no" with a stable code, as distinct
 * from an unexpected error. Every refusal is enforced where the decision can
 * actually be trusted -- inside the transaction, under the relevant lock --
 * never in the client and never in a pre-flight check that a later caller
 * could skip.
 *
 * The table fills in as the surfaces that can reach each refusal are built.
 */
export type RefusalCode =
  | 'INSUFFICIENT_FUNDS'
  | 'ROUND_CLOSED'
  | 'DUPLICATE_BET'
  | 'INVALID_TARGET';

type RefusalSpec = { httpStatus: number; summary: string; enforcedIn: string };

export const REFUSALS: Record<RefusalCode, RefusalSpec> = {
  INSUFFICIENT_FUNDS: {
    httpStatus: 409,
    summary: 'The derived balance of the account cannot absorb this debit.',
    enforcedIn: 'postEntry(), inside the caller transaction, under the account row lock',
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
