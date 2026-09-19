# provable-settlement-engine

A server-authoritative money core whose invariants are tested, not assumed.

A double-entry ledger where no balance is ever stored, payment ingestion that
is idempotent under concurrent duplicate delivery, settlement outcomes that
anyone can reproduce from published data, and an operator console that shows
each of those holding rather than claiming it.

## Status

Under construction, phase by phase. The invariant table below fills in as each
invariant gets the test that proves it.

| Invariant | Test | |
|---|---|---|
| Σ postings = 0, enforced by the database | `api/test/invariants/sum_is_zero.test.ts` | ✓ |
| Balance is derived; nothing can write it | `api/test/invariants/balance_is_derived.test.ts` | ✓ |
| Duplicate payment events post exactly once, including concurrently | `api/test/invariants/exactly_once.test.ts` | ✓ |
| A user account never goes negative under concurrency | `api/test/invariants/never_negative.test.ts` | |
| Outcomes are reproducible from revealed seeds | `api/test/invariants/deterministic_outcome.test.ts` | ✓ |
| Rounds move open → locked → resolved → settled, only | `api/test/invariants/lifecycle_is_linear.test.ts` | ✓ |

## Ledger

`postEntry()` is the only path through which money moves. It runs inside the
caller's transaction, locks every account it touches in `id` order, reads the
debited account's balance from `SUM(postings.amount_minor)` under that lock, and
refuses before writing anything if the debit would take it below zero. Whether
the postings balance is not its decision: a deferred constraint trigger rejects
the entry at `COMMIT`.

Sign convention is positive credits, negative debits. A deposit of 1000 minor
units is `gateway -1000, user:demo +1000`.

| Route | |
|---|---|
| `GET /ledger/accounts` | every account with its derived balance |
| `GET /ledger/entries?limit=50` | entries newest first, with postings and their sum |
| `GET /ledger/invariants` | live check: global sum, per-entry sums, posting count |
| `PUT /balance` | 404 `NO_SUCH_ENDPOINT` — there is nothing here to write |

## Payment ingestion

`POST /webhooks/payment` is idempotent under duplicate and concurrent delivery.
The arbiter is the unique key on `webhook_events.event_id`: the transaction
that wins `INSERT … ON CONFLICT DO NOTHING` moves the money, and the losers
return the entry id it committed. Reservation and ledger posting are one
transaction, so a failed posting takes the reservation with it and the event
can be retried.

```
POST /webhooks/payment   first    -> { "posted": true,  "entryId": 1 }
POST /webhooks/payment   repeat   -> { "posted": false, "deduplicated": true, "entryId": 1 }
POST /demo/webhook-storm          -> { "sent": 20, "posted": 1, "deduplicated": 19, "httpDeliveries": 20 }
```

`/demo/webhook-storm` fires real concurrent HTTP at this server's own port and
reports how many deliveries actually arrived, so the demonstration cannot
quietly degrade into an in-process loop.

## Seed custody and reproducible outcomes

The service commits to a seed by publishing `SHA256` of it before the seed is
ever used, and discloses the seed only on rotation. Anyone holding a revealed
seed can recompute every outcome it produced.

```
seedHash = SHA256(UTF8(serverSeed))
message  = `${clientSeed}:${nonce}`
hmac     = HMAC_SHA256(key = UTF8(serverSeed), message = UTF8(message))
roll     = (first 8 hex of hmac, as an integer) % 10000, in hundredths
win      = rollHundredths < targetUnderHundredths      (strictly less than)
```

The server seed is 64 lowercase hex characters, and it is that *text* which is
hashed and used as the HMAC key — not the 32 bytes it encodes. The two readings
give different digests, so the contract and its test vector live in
`fixtures/fairness-vectors.json` for every runtime that needs to agree.

| Route | |
|---|---|
| `GET /fairness/seed` | the active commitment: `seedHash` and `nonce`, never the seed |
| `POST /fairness/rotate` | reveals the current seed and installs its successor, in one transaction |
| `GET /fairness/seeds` | revealed history, newest first, with the seeds to check hashes against |
| `GET /fairness/verify` | recomputes an outcome; `matchesHash` is true only for a revealed commitment |

## Rounds and settlement

A bet owns one round and drives it `open → locked → resolved → settled` inside a
single transaction. Each step is recorded as a journal entry rather than
inferred from the round's current status, and each transition is asserted by the
service under a row lock *and* enforced by a database trigger.

The nonce is allocated under the active seed's row lock and incremented in the
same transaction as the bet, so a failed bet returns its nonce to the sequence
and two concurrent bets can never share one. Payout is
`floor(amountMinor × 9900 / targetUnderHundredths)`, computed entirely in
integers.

| Route | |
|---|---|
| `POST /bets` | places one bet end to end; a repeated `betId` is refused with the original outcome |
| `GET /bets?limit=20` | persisted bets, newest first, with the seed hash each was drawn against |
| `GET /rounds/:id` | the round and the steps it actually took, ordered by journal id |

## Run locally

```bash
docker compose up -d
cp .env.example .env
npm install
npm run dev     # api :8080, console :5173
npm test
```

See [docs/DEPLOY.md](docs/DEPLOY.md) for Railway and Vercel, and
[docs/DECISIONS.md](docs/DECISIONS.md) for the reasoning behind the design.
