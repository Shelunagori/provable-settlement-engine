/**
 * A refusal is a deliberate, server-side "no" with a stable code, as distinct
 * from an unexpected error. Every refusal is enforced where the decision can
 * actually be trusted -- inside the transaction, under the relevant lock --
 * never in the client and never in a pre-flight check that a later caller
 * could skip.
 *
 * H1 introduces only the one refusal the ledger core can reach on its own.
 * The full table arrives with the engine that can trigger the rest.
 */
export type RefusalCode = 'INSUFFICIENT_FUNDS';

type RefusalSpec = { httpStatus: number; summary: string; enforcedIn: string };

export const REFUSALS: Record<RefusalCode, RefusalSpec> = {
  INSUFFICIENT_FUNDS: {
    httpStatus: 409,
    summary: 'The derived balance of the account cannot absorb this debit.',
    enforcedIn: 'postEntry(), inside the caller transaction, under the account row lock',
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
