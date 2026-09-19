# Invariants

This system makes six promises about money. Each one is enforced at a layer that
cannot be bypassed by a future caller, proven by a named test, and — because a
test that cannot fail proves nothing — accompanied by the mutation that turns
that test red.

The pattern throughout: **the database is the authority, the application is a
convenience.** Application checks exist so callers get clean refusals instead of
constraint violations, not because they are what makes the rule true.

---

## 1. Σ postings = 0

**Invariant.** Every journal entry's postings sum to zero, and so does the
ledger as a whole.

**Why it matters.** Double-entry only means anything if it is impossible to
write one side of a movement. If money can be created by a bug, an exploit, or a
careless `psql` session, every other number in the system is a rumour.

**Authority.** A deferred constraint trigger, `postings_balanced`, re-checks
every touched entry at `COMMIT` and raises `LEDGER_UNBALANCED`. It is deferred
because an entry's postings are inserted as separate rows; an immediate trigger
would fire on an intentionally unbalanced intermediate state. `postEntry()`
deliberately does **not** duplicate this check — see
[D14](DECISIONS.md) — so the authority cannot silently move into application
code.

**Proof.** [`api/test/invariants/sum_is_zero.test.ts`](../api/test/invariants/sum_is_zero.test.ts)
writes unbalanced postings through raw SQL, asserts the `INSERT`s succeed, and
asserts that `COMMIT` is what refuses.

**Mutation.** Dropping the trigger turns that test red (`expected undefined to
be defined` — no commit error was raised) while everything else stays green.

---

## 2. Balance is derived

**Invariant.** No table stores a balance. A balance is
`SUM(postings.amount_minor)` for an account, computed at read time.

**Why it matters.** A stored balance is a second source of truth that drifts
from the first. Once it exists, something eventually writes it directly, and the
ledger stops being the ledger.

**Authority.** `account_balances` is a view over `postings`. No base table has a
balance column, and `PUT /balance` returns a documented 404 rather than a route
that happens not to exist.

**Proof.** [`api/test/invariants/balance_is_derived.test.ts`](../api/test/invariants/balance_is_derived.test.ts)
asserts from `information_schema` that no **base table** carries a `balance` or
`balance_minor` column, scoped so the view's derived column does not create a
false pass, and separately asserts that the view genuinely exposes it.

**Mutation.** `ALTER TABLE accounts ADD COLUMN balance_minor` turns it red,
which is what makes the assertion non-vacuous.

---

## 3. Exactly once

**Invariant.** The same payment event, delivered any number of times and at any
degree of concurrency, moves money exactly once.

**Why it matters.** Payment providers retry. A duplicate that credits twice is
a direct, silent loss, and it appears only under the load that makes it
expensive.

**Authority.** The primary key on `webhook_events.event_id`.
`INSERT … ON CONFLICT (event_id) DO NOTHING` performs a speculative insertion:
a concurrent duplicate **waits** on the first transaction rather than guessing,
then finds the committed row and returns its entry id. Reservation and ledger
posting share one transaction, so a failed posting releases the event id instead
of poisoning it.

**Concurrency mechanism.** The unique index itself. No application mutex, no
in-memory set of seen ids — both are per-process state that stops working the
moment a second instance starts.

**Proof.** [`api/test/invariants/exactly_once.test.ts`](../api/test/invariants/exactly_once.test.ts)
fires 20 concurrent deliveries over **real HTTP** against a listening server —
not `app.inject()` — and asserts 1 posted, 19 deduplicated, one entry, two
postings, one credit.
[`api/test/webhook_storm.test.ts`](../api/test/webhook_storm.test.ts) covers the
demo endpoint and asserts `httpDeliveries`, so the demonstration cannot degrade
into an in-process loop.

**Mutation.** Replacing the reservation with `SELECT`-then-`INSERT` turns it red
on every run — *provided the connection pool is warm*. See
[D20](DECISIONS.md): the first version of this test passed six runs out of six
against that very bug, because a cold pool serialised the requests and the race
window never opened.

---

## 4. Never negative

**Invariant.** A user account cannot go below zero, however many requests
arrive at once.

**Why it matters.** An overdraft here is money the system invented.

**Authority.** `postEntry()` locks every account the entry touches in `id` order
(one statement, `LockRows` above `Sort` in the plan, so the ordering is a
property of the plan rather than a hope), reads the derived balance **under that
lock**, and refuses before writing anything. Debits are accumulated across the
entry and measured against the balance held before it began; credits in the same
entry never fund a debit.

**Proof.** [`api/test/invariants/never_negative.test.ts`](../api/test/invariants/never_negative.test.ts)
fires 50 concurrent bets of 600 against a balance of 1000: exactly one succeeds,
49 are refused `INSUFFICIENT_FUNDS`, and no user account anywhere is negative.
[`api/test/funds_guard.test.ts`](../api/test/funds_guard.test.ts) pins the
per-debit, cumulative reading.

**Mutation.** Removing the funds guard turns `never_negative` red. Reverting to
netting credits against debits turns the funds-guard test red.

---

## 5. Deterministic outcome

**Invariant.** An outcome is a pure function of (server seed, client seed,
nonce), and anyone holding those three values reproduces it exactly.

**Why it matters.** "Trust us" is not a fairness model. The hash is published
before the seed is used, so the service commits to an outcome it cannot yet know
and cannot later change.

**Authority.** The commitment lifecycle — `SHA256` published before use,
plaintext disclosed only on rotation — plus one exactly specified encoding:

```
seedHash = SHA256(UTF8(serverSeedText))
hmac     = HMAC_SHA256(key = UTF8(serverSeedText), message = UTF8(`${clientSeed}:${nonce}`))
roll     = parseInt(first 8 hex, 16) % 10000, in hundredths
win      = rollHundredths < targetUnderHundredths        (strictly less than)
```

The server seed is 64 lowercase hex characters, and it is that **text** that is
hashed and keyed — never the 32 bytes it encodes. The two readings produce
completely different digests (`78c3773b…` vs `fd9fa715…` for the shared vector),
which is invisible in one runtime and fatal across two.

**Concurrency mechanism.** The nonce is read and incremented under the active
seed's row lock, inside the bet's transaction, so two bets cannot share one and
a failed bet returns its nonce to the sequence. The unique index on
`(seed_id, nonce)` is the final guard.

**Proof — three independent implementations agreeing on one fixture,
[`fixtures/fairness-vectors.json`](../fixtures/fairness-vectors.json):**

- server: [`api/test/invariants/deterministic_outcome.test.ts`](../api/test/invariants/deterministic_outcome.test.ts)
- browser: [`web/src/fairness/verify.test.ts`](../web/src/fairness/verify.test.ts) — Web Crypto, does not import the server implementation and does not call `GET /fairness/verify`
- property oracle: [`api/test/property/random_ops.test.ts`](../api/test/property/random_ops.test.ts) — written from this specification with `node:crypto`

Seed custody itself is covered by
[`api/test/fairness_custody.test.ts`](../api/test/fairness_custody.test.ts):
one active seed, never replaced on restart, plaintext never served while active,
rotation atomic.

**Mutation.** Changing the message separator, or keying the HMAC with the
hex-decoded seed, turns all three red. Changing `<` to `<=` turns the boundary
case red.

---

## 6. Lifecycle is linear

**Invariant.** A round moves `open → locked → resolved → settled`, one step at a
time, and every step it took is recorded rather than inferred.

**Why it matters.** A settlement that can happen twice, or before a lock, is a
double payout. And a history reconstructed from current status is a guess that
happens to be right until something goes wrong.

**Authority — stated twice, on purpose.** The service asserts the expected
status under `SELECT … FOR UPDATE` so a caller gets a `ROUND_CLOSED` refusal
rather than a constraint violation; the `rounds_linear` trigger makes the
illegal state unreachable even for a hand-written `UPDATE`.

History is journal entries, not status: `bet_lock` marks locked,
`round_resolved` marks resolved, `bet_settle` marks settled. `round_resolved`
carries **zero postings**, because computing an outcome moves no money — which
is why `postEntry()` remains the only path money moves. Ordering is by journal
id, never timestamp: all of these are written in one transaction and `now()`
returns the same value for all of them.

**Proof.** [`api/test/invariants/lifecycle_is_linear.test.ts`](../api/test/invariants/lifecycle_is_linear.test.ts)
covers a refused out-of-state transition, a direct `UPDATE` rejected by the
trigger, and a complete recorded lifecycle.

**Mutation.** Allowing `open → settled` in the service turns the first case red;
dropping the trigger turns the second red — which is how each half is shown to
be carrying its own weight.

---

## Cross-cutting: property testing

[`api/test/property/random_ops.test.ts`](../api/test/property/random_ops.test.ts)
runs 5 property cases of **100–500 randomly generated operations** — `deposit`,
`bet`, `rotate`, `duplicateWebhook` — against the real service and real
PostgreSQL. After **every single operation** it re-checks:

| Check | |
|---|---|
| `Σ postings = 0` | and no individual entry sums to anything else |
| user accounts | none negative |
| webhook events | exactly one deposit entry with two postings per event id |
| seed custody | exactly one active seed, nonce non-negative |
| nonce uniqueness | no duplicate `(seed_id, nonce)` |
| settled bets | roll, win and payout match an **independent oracle** |

That oracle is implemented inside the test from the specification above, using
`node:crypto`. It deliberately does not import `computeOutcome()` or
`payoutFor()`: doing so would make the property tautological, since a mutation
to production would move the expected answer with it.

Expected business refusals — `INSUFFICIENT_FUNDS`, `DAILY_LOSS_LIMIT` — are
valid parts of a generated history and are counted, not failed. Anything else
aborts the sequence. Nothing is derived from `Math.random()`, `randomUUID()` or
the clock, so fast-check's reported seed and path replay a failure exactly.

**Mutation.** `9900 → 10000` in the payout fails on the first generated bet.
So does changing the HMAC message. Bypassing the webhook reservation fails on
`duplicateWebhook`. Short-changing a settlement leg is caught by the deferred
trigger before the property's own assertion runs.

---

## Refusals

The nine business refusals, what each means and where each is enforced, are in
[docs/REFUSALS.md](REFUSALS.md) — generated from
[`api/src/refusals.ts`](../api/src/refusals.ts), served by `GET /refusals`, and
asserted by [`api/test/refusals.test.ts`](../api/test/refusals.test.ts).
