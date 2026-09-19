import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { closePool, getPool } from '../src/db.js';
import { sessionCookieOptions, SESSION_COOKIE } from '../src/auth/session.js';
import { buildServer } from '../src/server.js';
import { ensureMigrated, fundUser, resetLedger } from './helpers.js';

describe('demo sessions', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    await ensureMigrated();
    app = await buildServer();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('expected a TCP address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(async () => {
    await resetLedger();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  const login = async () => {
    const res = await fetch(`${baseUrl}/session`, { method: 'POST' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';')[0] ?? '';
    return { res, body: (await res.json()) as Record<string, unknown>, setCookie, cookie };
  };

  it('issues a signed HttpOnly cookie and stores only the token hash', async () => {
    const { res, body, setCookie, cookie } = await login();

    expect(res.status).toBe(200);
    expect(body).toEqual({ userId: 'user:demo' });
    // The token never travels in the response body.
    expect(JSON.stringify(body)).not.toContain(SESSION_COOKIE);

    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');

    const rows = await getPool().query<{ token_hash: string; user_id: string }>(
      'SELECT token_hash, user_id FROM sessions',
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.user_id).toBe('user:demo');

    // The stored value is a SHA256 digest, and the raw token is nowhere in the
    // database. A stolen database dump must not yield usable bearer tokens.
    const stored = rows.rows[0]!.token_hash;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    const rawFromCookie = decodeURIComponent(cookie.split('=')[1] ?? '');
    expect(stored).not.toBe(rawFromCookie);
    // The signed cookie carries "<token>.<signature>"; hashing the token half
    // must reproduce exactly what was stored.
    const token = rawFromCookie.split('.')[0] ?? '';
    expect(createHash('sha256').update(token).digest('hex')).toBe(stored);
  });

  it('serves /me for an authenticated caller', async () => {
    const { cookie } = await login();
    await fundUser('user:demo', 12_345n);

    const res = await fetch(`${baseUrl}/me`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: 'user:demo',
      balanceMinor: 12345,
      dailyNetMinor: 0,
    });
  });

  it('refuses a missing session on every protected route', async () => {
    for (const [method, path, body] of [
      ['GET', '/me', undefined],
      [
        'POST',
        '/bets',
        JSON.stringify({
          betId: 'no_session',
          amountMinor: 500,
          targetUnder: 50,
          clientSeed: 'c',
        }),
      ],
    ] as const) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      expect(res.status, path).toBe(401);
      expect(await res.json()).toMatchObject({ refused: true, code: 'NOT_AUTHENTICATED' });
    }

    const bets = await getPool().query<{ n: bigint }>('SELECT COUNT(*)::BIGINT AS n FROM bets');
    expect(bets.rows[0]!.n).toBe(0n);
  });

  it('refuses a tampered cookie', async () => {
    const { cookie } = await login();
    const tampered = `${cookie.slice(0, -3)}zzz`;

    const res = await fetch(`${baseUrl}/me`, { headers: { cookie: tampered } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });

  it('refuses an unknown but well-formed token', async () => {
    const { cookie } = await login();
    await getPool().query('DELETE FROM sessions');

    const res = await fetch(`${baseUrl}/me`, { headers: { cookie } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'NOT_AUTHENTICATED' });
  });

  it('refuses an expired session and writes no bet', async () => {
    const { cookie } = await login();
    await getPool().query("UPDATE sessions SET expires_at = now() - interval '1 hour'");
    await fundUser('user:demo', 10_000n);

    const me = await fetch(`${baseUrl}/me`, { headers: { cookie } });
    expect(me.status).toBe(401);

    const bet = await fetch(`${baseUrl}/bets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        betId: 'expired_session_bet',
        amountMinor: 500,
        targetUnder: 50,
        clientSeed: 'c',
      }),
    });
    expect(bet.status).toBe(401);

    const rows = await getPool().query<{ n: bigint }>('SELECT COUNT(*)::BIGINT AS n FROM bets');
    expect(rows.rows[0]!.n).toBe(0n);
  });

  it('hardens the cookie for production and stays usable locally', () => {
    const prod = sessionCookieOptions(true);
    expect(prod.sameSite).toBe('none');
    expect(prod.secure).toBe(true);
    expect(prod.httpOnly).toBe(true);
    expect(prod.signed).toBe(true);

    // SameSite=None requires Secure, which requires HTTPS; local development
    // is plain HTTP, so it gets the setting that actually works there.
    const local = sessionCookieOptions(false);
    expect(local.sameSite).toBe('lax');
    expect(local.secure).toBe(false);
    expect(local.httpOnly).toBe(true);
  });
});
