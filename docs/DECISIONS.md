# Decisions

Short records of choices that a reader of the code would otherwise have to
reverse-engineer. Newest first within each phase.

---

## D1 — The database, not the application, enforces ledger balance

A deferred constraint trigger (`postings_balanced`) re-checks every touched
entry at `COMMIT` and raises `LEDGER_UNBALANCED` if its postings do not sum to
zero.

*Alternative considered:* validating the sum in `postEntry()` before insert.
Rejected because it is only as good as the discipline of every future caller.
A trigger holds even for a manual `psql` session, a migration, or a bug in the
application layer.

`postEntry()` does not check the sum at all, and that is deliberate rather than
an omission — D14 has the reasoning. One consequence is worth stating here: an
unbalanced entry is refused by `COMMIT`, so the error surfaces from `withTx()`
rather than from the `postEntry()` call that built it.

It is deferred rather than immediate because the postings of one entry are
inserted as separate rows; an immediate trigger would fire after the first row
and see an intentionally unbalanced intermediate state.

---

## D2 — Postings and journal entries are append-only

`postings_immutable` and `journal_entries_immutable` reject `UPDATE` and
`DELETE` outright. A correction is a new, balanced entry in the opposite
direction, never an edit of history.

*Cost:* tests cannot clean up with `DELETE`. They use `TRUNCATE`, which is DDL
and bypasses row triggers by design.

---

## D3 — Round transitions are enforced in the database too

`rounds_linear` rejects any status change that is not exactly one step forward
in `open → locked → resolved → settled`. Backwards moves, skips and
self-transitions all raise `ROUND_ILLEGAL_TRANSITION`. The application layer
also asserts the current status under `SELECT … FOR UPDATE`, so the invariant
is stated twice on purpose: the lock gives a clean refusal, the trigger makes
the illegal state unreachable.

---

## D4 — `BIGINT` money is parsed into `bigint`, not `number`

`pg` returns `BIGINT` as a string to avoid silent precision loss. A global type
parser converts it to a JavaScript `bigint`, so every amount inside the API is
exact integer minor units and no floating-point arithmetic touches money.

On the wire, amounts serialise as JSON numbers via `jsonSafe()`, which throws
rather than truncate if a value ever exceeded `Number.MAX_SAFE_INTEGER`. No
amount this system can produce comes close, and the guard makes that an
assertion rather than an assumption.

---

## D5 — `NUMERIC` stays a string

`target_under` and `roll` are `NUMERIC(5,2)`. They are deliberately *not* given
a type parser: the decision `roll < target_under` is made in SQL or on exact
decimal strings, never on a float that might land a boundary case on the wrong
side of a comparison.

---

## D6 — Migrations run on boot, tracked with checksums

`runMigrations()` applies any file not yet recorded in `_migrations`, each in
its own transaction, and stores a SHA-256 of the file contents. Re-running
applies nothing. Editing a file that has already been applied is a hard startup
error rather than a silent divergence between the code and the live schema.

*Alternative considered:* a migration CLI run as a separate deploy step.
Rejected for this system because a single Railway service with an
auto-migrating boot has one less way to be half-deployed. `npm run migrate`
still exists for local use.

---

## D7 — Tests run against a real Postgres, serially

There is no in-memory substitute that can prove a deferred constraint trigger
fires at `COMMIT`, or that two concurrent transactions serialise on a row lock.
Those are the properties under test, so the tests use a real database.

Test files run one at a time (`fileParallelism: false`, single fork). Several
tests commit concurrently on purpose; the concurrency under test must be the
concurrency the code creates, not incidental interleaving between unrelated
test files.

---

## D8 — At most one active seed, enforced by a partial unique index

`server_seeds_single_active` is a unique index on `(status) WHERE status =
'active'`. Rotation must therefore reveal the current seed and insert the next
one in a single transaction; there is no window in which two seeds are active
or none is.

---

## D9 — `(seed_id, nonce)` is unique across bets

A unique index guarantees no two bets ever consume the same point in a seed's
sequence. Without it, a concurrency bug in nonce allocation would produce two
bets that verify against the same HMAC — reproducible, but not distinct.

---

## D10 — Web holds no state of its own

No global state library. Everything rendered is derived from an API response,
and every action refetches. The single piece of logic in the browser is
[`web/src/fairness/verify.ts`](../web/src/fairness/verify.ts), which recomputes
outcomes locally — that one is the point, so it must not be able to fall back to
trusting the server.

---

## D11 — `postEntry()` runs inside the caller's transaction and never opens one

It takes a `PoolClient` and issues no `BEGIN` or `COMMIT`. The balance it reads
and the postings it writes have to be one unit of work: if they were not, the
refusal would be a decision about a balance that no longer exists by the time
the postings land, and a caller's rollback would leave the money behind.

This is covered by a test that posts an entry and then throws from inside
`withTx`; the entry must not survive. That test was added after the property
turned out to be unenforced — mutating `postEntry()` to commit its own work
passed the entire suite.

---

## D12 — The lock order is a property of the query plan, not an assumption

`lockAccounts()` issues one statement: `SELECT id, kind FROM accounts WHERE id =
ANY($1) ORDER BY id FOR UPDATE`. Postgres is documented to allow `ORDER BY` to
be applied *after* locking in some plans, which would make the ordering
worthless for deadlock avoidance. The plan here is:

```
LockRows
  ->  Sort
        Sort Key: id
        ->  Bitmap Heap Scan on accounts
```

`LockRows` sits above `Sort`, so rows are ordered before any lock is taken.
Checked rather than assumed, and worth re-checking if the query ever grows a
join.

---

## D13 — The funds guard is per debit, accumulated, against the starting balance

Every negative posting against a `kind='user'` account is tested. Credits in the
same entry are not netted off, and the debits are accumulated rather than tested
one at a time. The comparison is always against the balance the account held
before the entry began, read once under the row lock.

Both halves of that matter, and each is held by its own test:

- **Credits do not fund debits.** `user -1000, user +1000` against a balance of 0
  nets to nothing, but the money the credit supplies is money this same entry is
  creating. It cannot be collateral for the debit that creates it. Refused.
- **Debits accumulate.** A balance of 1000 with `-600, -600` in one entry must be
  refused. Measuring each debit against an untouched 1000 would pass both.

An earlier version of this decision netted positive and negative postings per
account and compared the net movement. That allowed the first shape above. It
was a reading of the requirement rather than the requirement, and it was wrong.

## D14 — `postEntry()` does not check that postings sum to zero

Deliberately. That check is the deferred constraint trigger's job, and
duplicating it in TypeScript would move the apparent authority into application
code and mask a trigger that had silently stopped working.

The `sum_is_zero` test depends on this: it writes unbalanced postings through
raw SQL, asserts the INSERTs succeed, and asserts that `COMMIT` is what refuses.
Dropping the trigger turns that test red while the rest of the suite stays
green, which is the evidence that Postgres — not this codebase — is enforcing it.

---

## D15 — `/ledger/invariants` checks per entry as well as globally

A global `SUM(amount_minor) = 0` can hide two entries whose errors cancel out.
The endpoint therefore also counts entries whose own postings do not sum to
zero, and `sumIsZero` is true only when both are clean. Every field is read from
the database on each request; nothing is cached and nothing is hard-coded.

---

## D16 — Money crosses the API boundary as a JSON number, once

Internally every amount is `bigint`. Route handlers pass their result through
`jsonSafe()`, which converts `bigint` to `number` at the single point where the
response is serialised and throws rather than truncate if a value ever left the
safe integer range. Handlers never convert money themselves.

---

## D17 — The unique index on `webhook_events.event_id` is the idempotency arbiter

`ingestPaymentEvent()` opens with `INSERT … ON CONFLICT (event_id) DO NOTHING
RETURNING event_id`. The transaction that gets a row back owns the event and
moves the money; a transaction that gets nothing back is a duplicate and
returns the committed entry id.

`ON CONFLICT DO NOTHING` is a speculative insertion: when another transaction
holds the same key uncommitted, Postgres makes this statement *wait* on that
transaction rather than guess. If the other side commits, the conflict resolves
and this statement returns no row; if it rolls back, this statement inserts and
wins instead. The database picks the winner, under a constraint no future
caller can forget to consult.

*Rejected:* `SELECT` whether the event exists, then `INSERT` if it does not.
Two deliveries can both read "absent" before either writes, and both then post.
The window is milliseconds and the consequence is a customer credited twice —
the class of bug that only appears under the load that makes it expensive.

*Rejected:* an application mutex, an in-memory set of seen ids, or an external
lock. All of them are per-process state and stop working the moment a second
instance of the service starts.

---

## D18 — Reservation and money movement are one transaction

The `webhook_events` insert, the `postEntry()` call and the `entry_id` update
share the caller's single transaction. A failure anywhere rolls back all three.

The state being avoided is a row where `event_id` exists and `entry_id` is
NULL: every later retry of that event would be told "duplicate" for money that
was never credited, and no amount of retrying would fix it. The duplicate path
therefore treats a NULL `entry_id` as unreachable and throws rather than
returning it, so that if the two ever are split apart the failure is loud
instead of silent.

---

## D19 — `/demo/webhook-storm` sends real HTTP to its own port, and proves it

The endpoint discovers its own listening port and fires `count` concurrent
`fetch()` calls at `/webhooks/payment`. Calling the handler in a loop would
demonstrate only that a function is deterministic; what is worth showing is
that N simultaneous connections, N pooled database sessions and N transactions
contending on one unique index still produce one journal entry.

It reports `httpDeliveries`, the number of requests that actually arrived at
the webhook route during the run. That makes "these were real HTTP requests" a
checkable claim: an in-process implementation reports 0 while still getting
`posted` and `deduplicated` right, and the test fails on it. Bounded at 100 so
a demo endpoint cannot become an unbounded self-request amplifier.

---

## D20 — Concurrency tests warm the connection pool first

A burst of requests against a cold pool does not overlap. Establishing a
Postgres connection costs more than one of these transactions takes, so the
first request commits and returns its client to the pool before the second has
finished connecting, and the requests serialise.

This was not theoretical. The first version of `exactly_once` passed six runs
out of six against an implementation with a deliberate read-then-write race:
instrumentation showed exactly one transaction of twenty ever saw the event as
absent. The test asserted all the right outcomes and had no power to detect the
bug it exists to catch.

`warmPool()` opens and releases the connections before the burst, and tests run
with a larger `PG_POOL_MAX` than production, which keeps a free-tier connection
budget. With the pool warm the same mutation fails six runs out of six.

---

## D21 — Payload validation refuses with `INVALID_PAYLOAD`, not a refusal-table code

Schema violations and an unknown or non-user `user_id` return 422 with
`code: 'INVALID_PAYLOAD'`. These are malformed requests rather than business
decisions, so they deliberately do not claim a place in the refusal table. If
the table later wants a code for "no such account", this is the call site to
revisit.

---

## D22 — The server seed is hashed and keyed as text, not as the bytes it encodes

A server seed is 32 random bytes rendered as 64 lowercase hex characters, and
everything downstream operates on the UTF-8 bytes of those 64 characters:

```
seedText = randomBytes(32).toString('hex')
seedHash = SHA256(UTF8(seedText))
hmac     = HMAC_SHA256(key = UTF8(seedText), message = UTF8(`${clientSeed}:${nonce}`))
```

The alternative — hex-decoding back to 32 bytes and keying the HMAC with those
— is equally defensible in isolation and produces a completely different
digest. For the same fixed vector: `78c3773b…` with the text key, `fd9fa715…`
with the decoded key.

That difference is invisible inside any one runtime and fatal across two. A
browser verifier that picks the other reading disagrees with the server on
every outcome, and a verifier that disagrees with the server is worse than no
verifier at all: it tells users the service is cheating when it is not. The
contract is therefore pinned in
[`fixtures/fairness-vectors.json`](../fixtures/fairness-vectors.json), which the
server tests, the browser verifier and the property oracle all consume
unchanged.

---

## D23 — The roll is integer hundredths until the last possible moment

`rollHundredths` is an integer in 0..9999 and `targetUnderHundredths` likewise;
the win comparison is between those integers. Decimal text is parsed to exact
hundredths by string, not by `parseFloat`, and rendered back by string.

`59.63` has no exact binary representation. `59.63 * 100` evaluates to
`5962.999999999999`, which truncates to 5962 — one hundredth low, and enough to
flip a boundary case from loss to win. The only floating-point value in the
whole path is the `roll` field of the JSON response, produced at the
serialisation boundary and never compared against anything.

---

## D24 — Exactly one active seed, decided by the database

`ensureActiveSeed()` inserts a new seed with `ON CONFLICT DO NOTHING` and falls
back to reading the existing commitment. The partial unique index from
migration 001 (`WHERE status = 'active'`) is what makes the second inserter
lose, so two service instances booting together cannot produce two active
seeds. An in-memory "already initialised" flag would be per-process and would
not survive a second instance.

A restart never replaces an existing active seed. The hash published before a
bet is placed has to remain the hash that bet is verified against; silently
rotating on boot would break every outstanding commitment.

Rotation reveals and replaces in one transaction, and in that order — the
outgoing seed must stop being active before the incoming one can be inserted,
or the partial index rejects it. So there is no instant with zero active seeds
and none with two, and a failure anywhere leaves the old seed active and
unrevealed, which is the safe direction to fail in.

Seed initialisation happens in `buildServer()` rather than in the process
entrypoint, so the boot path exercised by the tests is the boot path that runs
in production.

*Superseded.* This decision originally recorded a known limitation: two
simultaneous rotations serialised on the `FOR UPDATE`, and the loser found no
active row and errored rather than rotating the seed its rival had just
installed. The one-active invariant held, but the error was misleading. D38
replaced that behaviour with a fresh-statement retry, and a concurrency
regression test now covers it.

---

## D25 — `matchesHash` vouches only for revealed commitments

`GET /fairness/verify` recomputes the outcome from whatever the caller supplies
and always returns the roll: the arithmetic belongs to whoever holds the
inputs. `matchesHash` answers the narrower question of whether this service
published a commitment to that seed *and has since disclosed it*.

An active seed returns `false` even though the service knows it perfectly well.
Confirming it would amount to acknowledging a seed whose plaintext nobody
outside the service should hold yet, which is the whole point of committing to
a hash in advance.

The endpoint takes no `seedHash` parameter; it derives the hash from the seed
it was given and looks that up in revealed history.

---

## D26 — `round_resolved` is a journal entry with no postings

Two of the three lifecycle steps coincide with money moving: `bet_lock` marks
open → locked, `bet_settle` marks resolved → settled. Computing an outcome
moves nothing, so locked → resolved had no record at all, and `GET /rounds/:id`
would have had to infer it from the round's current status — which is not
history, it is a guess that happens to be right until something goes wrong.

Migration 004 extends the `kind` CHECK with `round_resolved`, written as an
entry carrying zero postings. That is not money movement, so `postEntry()`
remains the only path by which money moves; the deferred balance trigger fires
per posting and is simply never reached by an entry with none. The entry is
also kept out of the `entryIds` a bet returns, which name the two money
entries.

History is ordered by journal id, never by timestamp. Every one of these
entries is written inside one transaction, so `now()` returns the same value
for all of them and sorting by time would be arbitrary.

---

## D27 — The nonce is allocated under the active seed's row lock

`placeBet()` takes `SELECT … FOR UPDATE` on the active seed, uses the nonce it
finds, and increments it — all inside the bet's transaction. The lock is held
until commit, so bets serialise on the seed row and two of them cannot read the
same nonce.

Because the increment shares the bet's transaction, a bet that fails gives its
nonce back: the next bet reuses it rather than leaving a hole in the sequence.
A hole would not be fatal, but it would mean a published nonce sequence with
gaps that nobody could account for.

*Rejected:* `MAX(nonce) + 1`, which is a read-then-write race; a counter in this
process, which stops working when a second instance starts; and a separate
transaction for the increment, which would survive a rolled-back bet.

The unique index on `(seed_id, nonce)` is the final guard. Removing the row
lock makes the concurrency test fail on exactly that index, which is the
database catching what the application let through.

A rotation committing between the statement starting and the row being locked
leaves the query with no row, because Postgres rechecks the locked tuple
against `status = 'active'` and the old seed no longer matches. That is a lost
race rather than an error, so the selection is retried once against the seed
the rotation installed.

---

## D28 — Duplicate bets are serialised by a transaction-scoped advisory lock

`placeBet()` takes `pg_advisory_xact_lock(hashtext(betId))` before reading or
writing anything. Two concurrent deliveries of the same bet id would otherwise
both find no row and both proceed; the primary key would stop the second from
persisting, but only after it had consumed a nonce and moved money.

The refusal echoes the original persisted bet with `idempotent: true`, so a
retry after a dropped response gets the first outcome rather than a second one.
There is never more than one outcome for a bet id.

Removing this makes the sequential duplicate surface as Postgres error 23505
and the concurrent pair deadlock with 40P01 — which is what "the primary key is
enough" actually looks like.

---

## D29 — Payout is integer arithmetic, floor, in BigInt

`multiplier = 99 / targetUnder` at a 1% margin. Since the target is already
integer hundredths, the whole expression is `amountMinor * 9900n /
BigInt(targetUnderHundredths)`: no decimal appears anywhere. BigInt division
truncates toward zero and both operands are positive, so this is the floor the
specification asks for, and no rounding can invent a fraction of a minor unit
the ledger cannot represent.

On a win the treasury funds the difference between the stake already in escrow
and the payout. When the payout happens to equal the stake — possible at a
target near 98.00 for a tiny stake — that leg is zero, and a posting of zero is
not a movement, so it is dropped rather than offered to a schema that rejects
it.

---

## D30 — One refusal table, generated rather than transcribed

`api/src/refusals.ts` holds the nine official business refusals. `GET /refusals`
serves that object, the tests assert against it, and
[`docs/REFUSALS.md`](REFUSALS.md) is genuinely generated from it by
[`scripts/generate-refusals-doc.ts`](../scripts/generate-refusals-doc.ts):
`npm run docs:refusals` writes the file and `npm run docs:check` fails the build
when the committed copy has drifted. A hand-maintained markdown table next to a hand-maintained
code table is two tables that will disagree, and the one people read is the one
that will be wrong.

`INVALID_PAYLOAD`, `NO_SUCH_ROUND` and `INTERNAL_ERROR` are deliberately not in
it. They answer a request that never became a business decision, and putting
them in the table would blur what a refusal is.

---

## D31 — Daily loss is UTC, bet-only, and not clamped

The figure is the sum of the user's own postings on `bet_lock` and `bet_settle`
entries in the current UTC day. Deposits, withdrawals and affiliate commission
are excluded: none of them is the user losing at the table, and counting a
deposit as a gain would hand back allowance the user never earned.

The day boundary is `date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE
'UTC'` in SQL, so it does not move with the database's or session's timezone.
Changing it to a rolling window turns the previous-day test red.

The value is deliberately not clamped at zero. A user who is up on the day
legitimately has more headroom than one who is level, and clamping would quietly
take that away.

---

## D32 — The limit decision is serialised per user by an advisory lock

`placeBet()` takes `pg_advisory_xact_lock(2, hashtext(userId))` before reading
the daily figure, and holds it to commit. Without it two requests read the same
remaining allowance and both pass: 150000 + 50000 twice is 250000 against a
limit of 200000. Removing the lock turns the race test red on every run.

Advisory locks are keyed by (namespace, hash), and two namespaces are used so a
bet id and a user id can never hash onto the same key and serialise each other
by accident. A hash collision within a namespace over-serialises unrelated
users, which is slower but never wrong; under-protecting one user would be.

---

## D33 — Session tokens are stored only as SHA256

`POST /session` generates 32 bytes from the OS CSPRNG, returns the raw token
once in a signed `HttpOnly` cookie, and stores only `SHA256(token)`. A database
dump therefore yields no usable bearer tokens.

Missing, malformed, badly signed, unknown and expired sessions all return the
same `NOT_AUTHENTICATED`. Distinguishing them tells someone probing which half
of a guess was right.

The cookie is `SameSite=None; Secure` in production, because the console is
served from a different origin; browsers only accept `None` together with
`Secure`, which requires HTTPS. Local development is plain HTTP, so it gets
`Lax` — `None; Secure` there would simply never be stored. The option object is
built by a function taking the environment as an argument, so the difference is
testable without booting a second server.

---

## D34 — Commission is 1% of the treasury's take, inside the bet transaction

A losing bet hands the stake to the treasury; the referring affiliate is paid
1% of that, floored, as its own `commission` journal entry against the round.
Nothing is paid on a win (the treasury took nothing), for a user with no
referrer, or when 1% floors to zero.

It runs inside the same transaction as the settlement. A second transaction
would leave a settled round whose commission silently never happened — and in
practice would not even get that far: the outer transaction still holds the
treasury account's row lock, so a separate connection deadlocks against itself.

The commission is not the user's money and is excluded from the daily-loss
figure: a losing bet of 500 moves the user's daily net by -500, not -505.

---

## D35 — The browser verifier is a second implementation, not a second call

`web/src/fairness/verify.ts` recomputes outcomes with Web Crypto. It does not
import the API's `outcome.ts` and it never calls `GET /fairness/verify`: a check
that asks the party being checked for the answer proves nothing. Rotation
verification likewise recomputes `SHA256(revealedSeed)` locally and ignores the
server's own `matchesHash` field.

It consumes `fixtures/fairness-vectors.json` — the same file the API tests
consume — rather than a copy of its numbers, so the two implementations cannot
drift apart quietly. Mutating the verifier to key the HMAC with the hex-decoded
seed produces `fd9fa715…` instead of `78c3773b…` and the fixture test fails,
which is the encoding contract from D22 holding on the client side too.

Rolls are compared as integer hundredths on both sides, so a server reporting
59.64 against a computed 59.63 is reported as a mismatch rather than rounded
into agreement.

---

## D36 — The console displays; it does not decide

The frontend formats values, computes the informational multiplier, sums the
postings it was given for a visible Σ badge, and verifies fairness
cryptographically. It decides nothing: sufficiency of funds, daily limits, bet
validity, payout, commission, nonce allocation, round transitions and
idempotency are all server answers, and the UI renders whatever comes back —
including refusals, which are proof rather than errors to be swallowed.

The one place this is visible in the design is the refusal quick actions. There
is no `/demo/refuse/*` endpoint and no state reset to manufacture an
`INSUFFICIENT_FUNDS`: codes that cannot be triggered safely and deterministically
from the UI are shown in the refusal table, served by `GET /refusals`, with a
note about what reaching them requires.

Each proof card states what it actually knows. The derived-balance card
describes the design and names the test that asserts it, rather than implying it
inspected the schema live, and the payment-idempotency panel shows the figures
the storm you ran returned rather than inventing cumulative statistics no
endpoint reports.

---

## D37 — The property test judges outcomes with its own oracle

`api/test/property/random_ops.test.ts` runs 100–500 randomly generated
operations — deposit, bet, rotate, duplicate webhook — against the real service
and real Postgres, re-checking every invariant after each one.

The oracle that judges settled bets is implemented in the test file from the
specification, using `node:crypto`, and shares no code with the implementation.
Importing `computeOutcome()` or `payoutFor()` would make the property
tautological: a mutation to production would move the expected answer with it
and the test would stay green while the system broke. Changing the payout
numerator from 9900 to 10000 fails the property on the first generated bet;
so does changing the HMAC message separator.

Every operation is derived from generated values and its index, never from
`Math.random()`, `crypto.randomUUID()` or the clock, so fast-check's reported
seed and path replay a failure exactly. One webhook slot always means one
payload, so an idempotency key can never refer to two different amounts.

Expected business refusals — `INSUFFICIENT_FUNDS`, `DAILY_LOSS_LIMIT` and the
rest — are counted and carried on from; they are decisions the system is
entitled to make. Anything else aborts the sequence.

Slot amounts are spread across 1,000–50,000 rather than being the slot number.
An earlier version derived them as `1 + (slot % 50_000)` over a small slot
range, which produced deposits of a few minor units; the sequence degenerated
into several hundred `INSUFFICIENT_FUNDS` refusals and never reached the daily
limit at all.

---

## D38 — Concurrent rotation retries instead of reporting a phantom absence

Two rotations starting together contend on the active seed row. The loser's
`SELECT … FOR UPDATE` returns nothing once it acquires the lock, because
Postgres rechecks the locked tuple against `status = 'active'` and the seed it
waited for is now revealed. That was reported as `No active seed to rotate`,
which is misleading — nothing was wrong, it had simply lost a race.

It now re-runs the select once, the same shape nonce allocation already uses when
taking the active seed, and picks up the successor the winner installed. Two simultaneous
operator rotations therefore serialise into two legitimate rotations. Removing
the retry turns the concurrency test red on every run.

The partial unique index remains the guard; nothing here is an application lock.

---

## D39 — Session bootstrap is coalesced, because StrictMode mounts twice

React StrictMode runs effects twice in development. Cancelling the second
caller's state update is not enough: both mounts still reach the network, both
see 401, and both `POST /session` — one browser boot, two live session rows,
observed in a browser walkthrough as two 401s.

`web/src/auth/bootstrap.ts` coalesces simultaneous callers onto a single
in-flight promise. A real dev browser boot now issues one `POST /session` and
`GET /me` returns `[401, 200]` instead of `[401, 401, 200, 200]`. The promise is
cleared on failure so a transient error does not poison the page permanently.

The test mock answers from session state rather than call order. An earlier
version counted calls, which let the second caller see "already signed in"
merely because it ran second — it passed against an implementation that did not
coalesce at all.

---

## D40 — The console leads with one path, and keeps every proof

The first version of the console was three technical panels of equal weight:
ledger, actions, fairness. Everything was reachable and nothing was first. A
visitor who had not read the README could not tell what to click, and the
interface read as an inspector for someone who already understood the system.

The layout now states the claim, shows the balance, and then walks one path —
add funds, place an outcome, watch the money move, reveal the commitment,
recompute the result — with a live proof rail beside it so a claim and the
action that exercises it are on screen together. Every panel the old console had
is still present, under *Advanced proofs*: the raw ledger and journal, the
webhook storm, the full refusal table, seed history and affiliate accrual.

This is presentation only. No endpoint changed, no request shape changed, and
the boundary in D36 is unchanged: the interface still decides nothing. The
guided steps are the same API calls the old buttons made, and a refusal is still
rendered as a named code with its structured detail rather than swallowed.

Two constraints shaped the surface rather than the layout. Status is never
carried by colour alone — every indicator ships with its label — and the palette
is defined once as CSS custom properties with a light-mode remap, including a
separate `--c-on-accent` so filled buttons stay legible in both schemes. Measured
in a real browser after the full journey, in both colour schemes and with the
refusal, table and drawer states open, no rendered text falls below its WCAG AA
contrast threshold.

---

## D41 — Light is the default, and the palette carries two greens

The redesign in D40 proved the system but still read as an inspector: dark,
dense, and technical before it was useful. The console now opens light, and a
Light / Dark / System control in the header remembers the choice in
`localStorage`. There is no endpoint that stores a theme, and adding one would
mean the interface holding state the server does not know about.

Absence of a stored choice resolves to light, not to the operating system's
preference. "System" is something a person opts into, so a first visit is the
light experience on every machine. `src/theme.ts` sets `data-theme` before the
first render, which is also what stops a dark-theme visitor seeing a light
flash.

Each hue is defined twice: a text-safe value and a vivid one. The vivid value
paints dots, progress bars and fills that carry no text; the text-safe value is
used for anything a person reads. That split is what lets the palette stay
bright and still clear WCAG AA — the requested `#16b981` is 2.53:1 against white
and fails as a button fill, so `#16b981` became the vivid marker and `#0b8256`
the filled-button green, with white text at 4.84:1. Amber, blue and red are
split the same way for the same reason. Measured in a real browser after the
full journey in both themes, with refusals, the rule table, the mobile menu and
every disclosure open, no rendered text falls below its AA threshold.

Language changed alongside colour. "Place an outcome" was never something a
person says, so the primary action is *Run demo* throughout; the reveal step
asks to *Reveal commitment* rather than to retire a seed; accounts are named
(Demo wallet, Pending, Treasury, Payment gateway, Affiliate) with the raw id on
hover; journal kinds read as events with the raw kind on a second line; and a
refusal leads with "Request refused" and the server's own message, keeping the
code and HTTP status as a quiet footer. Hashes truncate to head and tail with
Copy and View full, so proof stays one click away without setting the visual
weight of the card it sits in.

Measured against D40's layout: the hero block is 17.3% shorter (713px → 590px at
1440×900) and rendered prose is down 42.9% (727 → 415 words). Total on-screen
text is slightly higher, because the raw journal kinds, entry ids and account
ids that used to *be* the copy are now kept as secondary evidence beside it.

None of this reaches the server. No endpoint, request shape or business rule
changed, and the boundary in D36 still holds: the interface decides nothing.
