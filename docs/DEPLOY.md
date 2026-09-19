# Deploy

Two services: the API and its database on Railway, the console on Vercel.

## 1. Railway — API + Postgres

1. Create a new project, then **New → Database → Add PostgreSQL**. Railway
   injects `DATABASE_URL` into the project.
2. **New → GitHub Repo →** this repository. Leave the service root at the
   repository root; the build compiles only `api`.
3. Service → **Variables**, add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | reference the Postgres plugin variable |
   | `SESSION_SECRET` | 32+ random characters |
   | `NODE_ENV` | `production` |
   | `WEB_ORIGIN` | the Vercel URL from step 2, comma-separated if more than one |
   | `PG_POOL_MAX` | `5` |
   | `DEMO_RESET_ENABLED` | `true` — **public demo / POC only**, see below |

   `PORT` is set by Railway; do not override it.

   `DEMO_RESET_ENABLED=true` exposes `POST /demo/reset`, which wipes the demo
   dataset. It belongs on a public POC whose whole purpose is to be reset by
   strangers. It does **not** belong on a real wagering deployment, and the flag
   is separate from `NODE_ENV` precisely so that running in production mode is
   never what enables it. Leave it unset anywhere that holds real state.
4. Service → **Settings → Config as code**, point it at `api/railway.json`.
   Health check path is `/health`; the first deploy is healthy once that
   returns `{"ok":true}`.

   The build command there is `npm --workspace api run build` with **no
   `npm ci` in front of it**. Railway's builder installs dependencies itself
   before running the build command, and a second install on top of the first
   fails against the `.vite` cache with `EBUSY`. `/health` also reports
   `features.demoReset`, so the console knows whether to offer the reset button
   without guessing.
5. **Settings → Networking → Generate Domain**. That URL is `VITE_API_URL`.

Migrations run automatically on boot and are idempotent, so a redeploy against
an existing database applies nothing.

`/health` answers `200` only when the database is reachable, and `503` when it
is not, so the platform health check removes a broken instance from service
instead of treating `{"ok": false}` with HTTP 200 as healthy. The failure
response carries no database detail — the endpoint is unauthenticated.

## 2. Vercel — console

1. **Add New → Project →** this repository.
2. Root directory: `web`. Framework preset: Vite (detected).
3. Environment variable: `VITE_API_URL` = the Railway domain from step 1.5,
   with no trailing slash. For the current deployment that is
   `https://pseapi-production.up.railway.app`.
4. Deploy. `web/vercel.json` rewrites every path to `/`, which is what makes a
   direct load or a refresh of `/review` serve the same bundle instead of a
   404. Both pages are one SPA behind a pathname switch; there is no router
   dependency to configure.

## 3. Close the loop

Set `WEB_ORIGIN` on Railway to the Vercel production URL and redeploy the API,
otherwise the browser's credentialed requests fail CORS preflight. In
production the session cookie is issued `SameSite=None; Secure`, which requires
both ends on HTTPS — they are, on both platforms.

Current deployment:

| | |
|---|---|
| Console | <https://provable-settlement-engine-api.vercel.app> |
| POC review | <https://provable-settlement-engine-api.vercel.app/review> |
| API health | <https://pseapi-production.up.railway.app/health> |

## Local

```bash
docker compose up -d          # postgres:16, creates pse and pse_test
cp .env.example .env
npm install
npm run dev                   # api on :8080, console on :5173
```

```bash
npm test                      # runs against pse_test
npm run typecheck
```
