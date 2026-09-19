// Tests run against a real Postgres. There is no in-memory substitute that can
// prove a deferred constraint trigger fires at COMMIT, or that two concurrent
// transactions serialise on a row lock -- which is most of what is under test.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://pse:pse@localhost:5432/pse_test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ??= 'test-secret-not-used-outside-tests-000000';
process.env.WEB_ORIGIN ??= 'http://localhost:5173';
// Production runs a small pool to stay inside a free-tier connection budget.
// Tests want the opposite: enough live connections that concurrent requests
// actually overlap instead of queueing behind each other.
process.env.PG_POOL_MAX ??= '12';
