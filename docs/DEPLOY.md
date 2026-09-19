# Deploy

Two services: the API and its database on Railway, the console on Vercel.

## 1. Railway — API + Postgres

1. Create a new project, then **New → Database → Add PostgreSQL**. Railway
   injects `DATABASE_URL` into the project.
2. **New → GitHub Repo →** this repository. Leave the service root at the
   repository root (the build installs the workspace and builds only `api`).
3. Service → **Variables**, add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | reference the Postgres plugin variable |
   | `SESSION_SECRET` | 32+ random characters |
   | `NODE_ENV` | `production` |
   | `WEB_ORIGIN` | the Vercel URL from step 2, comma-separated if more than one |
   | `PG_POOL_MAX` | `5` |

   `PORT` is set by Railway; do not override it.
4. Service → **Settings → Config as code**, point it at `api/railway.json`.
   Health check path is `/health`; the first deploy is healthy once that
   returns `{"ok":true}`.
5. **Settings → Networking → Generate Domain**. That URL is `VITE_API_URL`.

Migrations run automatically on boot and are idempotent, so a redeploy against
an existing database applies nothing.

## 2. Vercel — console

1. **Add New → Project →** this repository.
2. Root directory: `web`. Framework preset: Vite (detected).
3. Environment variable: `VITE_API_URL` = the Railway domain from step 1.5,
   with no trailing slash.
4. Deploy. `web/vercel.json` already rewrites all paths to `/` for the SPA.

## 3. Close the loop

Set `WEB_ORIGIN` on Railway to the Vercel production URL and redeploy the API,
otherwise the browser's credentialed requests fail CORS preflight. In
production the session cookie is issued `SameSite=None; Secure`, which requires
both ends on HTTPS — they are, on both platforms.

Paste both URLs back and they get wired into the README.

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
