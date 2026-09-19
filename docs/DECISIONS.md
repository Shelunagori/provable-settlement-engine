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
application layer. `postEntry()` still validates early so callers get a clean
error, but the trigger is the authority.

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
`lib/verify.ts`, which recomputes outcomes locally — that one is the point, so
it must not be able to fall back to trusting the server.
