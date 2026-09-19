import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapSession, resetBootstrapForTests } from './bootstrap.ts';
import type { Me } from '../types.ts';

const ME: Me = { userId: 'user:demo', balanceMinor: 0, dailyNetMinor: 0 };

class Unauthorized extends Error {}
const isUnauthenticated = (err: unknown) => err instanceof Unauthorized;

describe('session bootstrap', () => {
  beforeEach(() => {
    resetBootstrapForTests();
  });

  it('creates one session when two callers race, as StrictMode makes them', async () => {
    // The mock answers from session state rather than call order: /me fails
    // until a session exists. Counting calls instead would let both callers see
    // "already signed in" purely because one happened to run second, and the
    // test would pass against an implementation that does not coalesce.
    let sessionExists = false;
    const me = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      if (!sessionExists) throw new Unauthorized('401');
      return ME;
    });
    const startSession = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      sessionExists = true;
      return { userId: 'user:demo' };
    });

    const [a, b] = await Promise.all([
      bootstrapSession({ me, startSession, isUnauthenticated }),
      bootstrapSession({ me, startSession, isUnauthenticated }),
    ]);

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(a).toEqual(ME);
    expect(b).toEqual(ME);
    expect(a).toBe(b);
  });

  it('does not create a session when one already works', async () => {
    const me = vi.fn(async () => ME);
    const startSession = vi.fn(async () => ({ userId: 'user:demo' }));

    const [a, b] = await Promise.all([
      bootstrapSession({ me, startSession, isUnauthenticated }),
      bootstrapSession({ me, startSession, isUnauthenticated }),
    ]);

    expect(startSession).not.toHaveBeenCalled();
    expect(me).toHaveBeenCalledTimes(1);
    expect(a).toEqual(ME);
    expect(b).toEqual(ME);
  });

  it('lets a later caller retry after a failed bootstrap', async () => {
    let attempt = 0;
    const me = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('network down');
      return ME;
    });
    const startSession = vi.fn(async () => ({ userId: 'user:demo' }));

    await expect(
      bootstrapSession({ me, startSession, isUnauthenticated }),
    ).rejects.toThrow('network down');

    // The failure must not be cached, or the page never recovers.
    await expect(bootstrapSession({ me, startSession, isUnauthenticated })).resolves.toEqual(ME);
  });

  it('propagates a non-auth failure rather than starting a session', async () => {
    const me = vi.fn(async () => {
      throw new Error('500 from API');
    });
    const startSession = vi.fn(async () => ({ userId: 'user:demo' }));

    await expect(
      bootstrapSession({ me, startSession, isUnauthenticated }),
    ).rejects.toThrow('500 from API');
    expect(startSession).not.toHaveBeenCalled();
  });
});
