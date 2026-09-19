# Refusal table

A refusal is a deliberate, server-side "no" with a stable code, as distinct from
an unexpected error or a malformed request. Every one is enforced where the
decision can be trusted — inside the transaction, under the relevant lock —
never in the client and never in a pre-flight check a later caller could skip.

**This file is generated from [`api/src/refusals.ts`](../api/src/refusals.ts).**
Run `npm run docs:refusals` after changing the table; `npm run docs:check`
fails if it has drifted. The same object is served by `GET /refusals` and
asserted by [`api/test/refusals.test.ts`](../api/test/refusals.test.ts), so
there is one contract rather than three that can disagree.

Every refusal answers to the same shape:

```json
{
  "refused": true,
  "code": "BET_ABOVE_MAX",
  "message": "Bet 60000 exceeds max 50000",
  "limit": 50000
}
```

| Code | HTTP | When | Enforced where |
|---|---|---|---|
| `INSUFFICIENT_FUNDS` | 409 | The derived balance of the account cannot absorb this debit. | postEntry(), inside the caller transaction, under the account row lock |
| `BET_BELOW_MIN` | 422 | The stake is below the minimum of 100 minor units. | placeBet(), before any persistent write |
| `BET_ABOVE_MAX` | 422 | The stake is above the maximum of 50000 minor units. | placeBet(), before any persistent write |
| `DAILY_LOSS_LIMIT` | 429 | This stake would take the account's net loss for the current UTC day past 200000 minor units. | placeBet(), under a per-user advisory lock, computed from postings inside the transaction |
| `ROUND_CLOSED` | 409 | The round is not in the state this transition requires. | engine/round.ts, under SELECT ... FOR UPDATE on the round |
| `DUPLICATE_BET` | 409 | A bet with this id already exists; its original outcome is returned unchanged. | placeBet(), under a transaction-scoped advisory lock on the bet id |
| `INVALID_TARGET` | 422 | targetUnder must be an exact decimal between 1.00 and 98.00. | bet input parsing, before any write |
| `SEED_ROTATED` | 409 | The supplied commitment is no longer the active seed. | placeBet(), under SELECT ... FOR UPDATE on the active seed, before the nonce moves |
| `NOT_AUTHENTICATED` | 401 | No valid session: missing, malformed, unknown or expired. | auth/session.ts preHandler, against the sessions table |

`INVALID_PAYLOAD`, `NO_SUCH_ROUND` and `INTERNAL_ERROR` are deliberately not
in this table. They answer a request that never became a business decision.
