import type { Me } from '../types.ts';

export type BootstrapDeps = {
  me: () => Promise<Me>;
  startSession: () => Promise<unknown>;
  isUnauthenticated: (err: unknown) => boolean;
};

/**
 * Establishes a demo session exactly once, however many callers ask at the
 * same moment.
 *
 * React StrictMode mounts effects twice in development. Cancelling the second
 * caller's state update is not enough: both mounts still reach the network, both
 * see 401, and both POST /session, leaving two live session rows for one browser
 * boot. Coalescing around a single in-flight promise means the second caller
 * waits for the first rather than starting its own.
 *
 * The promise is cleared when bootstrap fails, so a transient error does not
 * poison the page permanently -- the next caller retries rather than being
 * handed the same rejection forever.
 */
let inFlight: Promise<Me> | null = null;

export const bootstrapSession = (deps: BootstrapDeps): Promise<Me> => {
  if (inFlight) return inFlight;

  const attempt = (async (): Promise<Me> => {
    try {
      return await deps.me();
    } catch (err) {
      if (!deps.isUnauthenticated(err)) throw err;
      await deps.startSession();
      return await deps.me();
    }
  })();

  inFlight = attempt;
  attempt.catch(() => {
    if (inFlight === attempt) inFlight = null;
  });

  return attempt;
};

/** Test-only: forget any established bootstrap. */
export const resetBootstrapForTests = (): void => {
  inFlight = null;
};
