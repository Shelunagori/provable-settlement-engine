const required = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  get isProduction() {
    return this.nodeEnv === 'production';
  },
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL', 'postgres://pse:pse@localhost:5432/pse'),
  sessionSecret: required('SESSION_SECRET', 'dev-only-secret-not-for-production-use'),
  // Comma-separated list; localhost dev origin is always allowed outside production.
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Railway's free tier gives a small connection budget; stay well inside it.
  poolMax: Number(process.env.PG_POOL_MAX ?? 5),
  /**
   * Whether POST /demo/reset exists at all.
   *
   * Deliberately its own flag rather than a NODE_ENV check: the public demo
   * runs with NODE_ENV=production and still wants the reset, while a real
   * deployment of this engine would run with the same NODE_ENV and must not
   * have it. Only the literal string 'true' enables it, so a stray '1',
   * 'yes' or empty value leaves it off.
   */
  get demoResetEnabled() {
    return process.env.DEMO_RESET_ENABLED === 'true';
  },
} as const;
