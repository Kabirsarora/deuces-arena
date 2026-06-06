# Deployment

Deuces Arena is split into separately deployable web, server, and database pieces so the same backend and engine can support a future mobile app.

## Targets

- Web app: deploy `apps/web` to Vercel or another Next.js host.
- Realtime server: deploy `apps/server` to a Node host with long-running WebSocket support.
- Database: use PostgreSQL through Neon, Supabase, or another managed provider.
- Redis: add later for cross-instance rooms, matchmaking, and presence when one server process is no longer enough.

Recommended free/low-cost path:

- Vercel for `apps/web`.
- Render, Railway, or Fly.io for `apps/server`.
- Neon or Supabase for PostgreSQL.
- Upstash Redis later, only after room state moves beyond a single server process.

## Required Environment Variables

Copy the relevant example file before local setup:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/server/.env.example apps/server/.env
```

Do not commit the copied files with real secrets.

Web:

```bash
NEXT_PUBLIC_APP_URL="https://your-web-app.example.com"
NEXT_PUBLIC_SERVER_URL="https://your-server.example.com"
AUTH_SECRET="generated-secret"
AUTH_GOOGLE_ID="google-oauth-client-id"
AUTH_GOOGLE_SECRET="google-oauth-client-secret"
```

For Google OAuth, add the deployed callback URL in Google Cloud:
`https://your-web-app.example.com/api/auth/callback/google`.

Server:

```bash
PORT="4000"
CLIENT_ORIGIN="https://your-web-app.example.com"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/deuces_arena"
DISCONNECTED_AUTO_MOVE_DELAY_MS="15000"
ADMIN_EMAILS="creator@example.com"
ADMIN_GUEST_IDS=""
```

`CLIENT_ORIGIN` also accepts a comma-separated allowlist for deploy previews:

```bash
CLIENT_ORIGIN="https://deuces-arena.vercel.app,https://deuces-arena-git-preview.vercel.app"
```

ML export scripts:

```bash
COACH_EVALUATION_EXPORT_PATH="artifacts/coach-evaluations.jsonl"
COACH_EVALUATION_EXPORT_LIMIT="1000"
```

The app can run without `DATABASE_URL`, but match history, move persistence, durable guest stats, coach-evaluation persistence, and earned cosmetic unlocks require PostgreSQL.

`GET /health` returns safe deployment metadata such as allowed origins, uptime, room counts, whether PostgreSQL/Redis are configured, and the disconnected-player grace delay. It does not expose secret connection strings.

## Build Commands

Install:

```bash
npm ci
```

Web build:

```bash
npm run build --workspace @deuces-arena/web
```

Server build:

```bash
npm run build --workspace @deuces-arena/server
```

Provider notes:

- Vercel root directory: `apps/web`.
- Vercel build command: `npm run build --workspace @deuces-arena/web`.
- Vercel install command: `npm ci`.
- Render/Railway/Fly build command: `npm ci && npm run build --workspace @deuces-arena/server`.
- Render/Railway/Fly start command: `npm run start --workspace @deuces-arena/server`.

## Start Commands

Web hosts usually run Next.js automatically after build.

Server:

```bash
npm run start --workspace @deuces-arena/server
```

## Database Migration

Run this after setting `DATABASE_URL`:

```bash
npm run db:generate --workspace @deuces-arena/db
npm run db:migrate --workspace @deuces-arena/db
npm run db:seed --workspace @deuces-arena/db
```

Run migrations from a trusted machine or CI job with database access. Do not run destructive migration resets against production.

## Production Notes

- Keep the server as the authority for all online moves.
- Set `CLIENT_ORIGIN` to the exact deployed web origin, or a tight comma-separated allowlist, before enabling public traffic.
- Use `GET /health` after every deploy to confirm the server is running with the expected origin allowlist, persistence mode, and disconnect grace setting.
- Use one server instance until Redis-backed presence and room state are added.
- Do not claim the bot or coach is AI until recommendations are grounded in simulations or model outputs.
- Enable HTTPS for both web and server origins; browsers require secure contexts for production WebSocket usage in most deployments.
- Keep `DATABASE_URL`, future auth secrets, and future Stripe keys out of client-exposed `NEXT_PUBLIC_*` variables.
- If the server provider sleeps free instances, the first connection after idle may be slow. That is acceptable for a demo but should be disclosed in the README once deployed.
