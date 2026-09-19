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
| Duplicate payment events post exactly once, including concurrently | `api/test/invariants/exactly_once.test.ts` | |
| A user account never goes negative under concurrency | `api/test/invariants/never_negative.test.ts` | |
| Outcomes are reproducible from revealed seeds | `api/test/invariants/deterministic_outcome.test.ts` | |
| Rounds move open → locked → resolved → settled, only | `api/test/invariants/lifecycle_is_linear.test.ts` | |

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
