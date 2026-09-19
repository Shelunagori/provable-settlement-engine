import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getPool } from '../db.js';
import { RefusalError } from '../refusals.js';

export const SESSION_COOKIE = 'ledgerproof_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type CookieOptions = {
  httpOnly: boolean;
  path: string;
  signed: boolean;
  sameSite: 'none' | 'lax';
  secure: boolean;
  maxAge: number;
};

/**
 * The console is served from a different origin to the API, so in production
 * the cookie has to be SameSite=None -- which browsers only accept together
 * with Secure, which requires HTTPS. Local development is plain HTTP, so it
 * gets Lax instead; None+Secure there would simply never be stored.
 *
 * Taken as an argument rather than read from the environment so the difference
 * is testable without booting a second server.
 */
export const sessionCookieOptions = (isProduction: boolean): CookieOptions => ({
  httpOnly: true,
  path: '/',
  signed: true,
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction,
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
});

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Issues a session. The raw token is returned to the caller once, to be put in
 * a signed cookie, and only its SHA256 is stored. A database dump therefore
 * yields no usable bearer tokens.
 */
export const createSession = async (
  userId: string,
): Promise<{ token: string; expiresAt: Date }> => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await getPool().query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, expiresAt.toISOString()],
  );

  return { token, expiresAt };
};

/** The user this token belongs to, or null if it is unknown or expired. */
export const resolveSession = async (token: string): Promise<string | null> => {
  const { rows } = await getPool().query<{ user_id: string }>(
    'SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()',
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
};

export const destroySession = async (token: string): Promise<void> => {
  await getPool().query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
};

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

/**
 * Rejects anything that is not a live session, without saying which way it
 * failed. Missing, malformed, badly signed, unknown and expired all return the
 * same refusal: telling a caller that a token was well-formed but unknown, or
 * valid but expired, is free information for someone probing.
 */
export const requireSession = async (
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) throw new RefusalError('NOT_AUTHENTICATED', 'No session');

  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) {
    throw new RefusalError('NOT_AUTHENTICATED', 'No session');
  }

  const userId = await resolveSession(unsigned.value);
  if (!userId) throw new RefusalError('NOT_AUTHENTICATED', 'No session');

  req.userId = userId;
};

export const isProduction = (): boolean => config.isProduction;
