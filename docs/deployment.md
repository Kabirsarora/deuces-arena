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
REALTIME_AUTH_SECRET="shared-realtime-secret"
```

For Google OAuth, add the deployed callback URL in Google Cloud:
`https://your-web-app.example.com/api/auth/callback/google`.

For the current hosted demo, the Google OAuth application should use:

- Homepage: `https://deuces-arena.vercel.app`
- Authorized JavaScript origin: `https://deuces-arena.vercel.app`
- Authorized redirect URI: `https://deuces-arena.vercel.app/api/auth/callback/google`
- Privacy policy: `https://deuces-arena.vercel.app/privacy`
- Terms of service: `https://deuces-arena.vercel.app/terms`

Replace all five URLs together after adding a custom domain. Keep the old callback registered until
the new domain is deployed and verified, then remove obsolete preview callbacks.

Server:

```bash
PORT="4000"
CLIENT_ORIGIN="https://your-web-app.example.com"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/deuces_arena"
DISCONNECTED_AUTO_MOVE_DELAY_MS="15000"
REALTIME_AUTH_SECRET="shared-realtime-secret"
ADMIN_EMAILS="creator@example.com"
ADMIN_GUEST_IDS=""
```

Mobile build-time public configuration:

```bash
EXPO_PUBLIC_SERVER_URL="https://api.deucesarena.com"
EXPO_PUBLIC_WEB_URL="https://deucesarena.com"
```

Mobile account sign-in starts at `/mobile-connect` on the web app. The web app creates a signed,
two-minute handoff that only `/auth/mobile/exchange` on the realtime server can accept. The server
returns a 30-day app session, which Expo SecureStore keeps in the device Keychain or Keystore. This
reuses the existing Google OAuth configuration and `REALTIME_AUTH_SECRET`; no Google secret or
additional paid authentication service is added to the mobile bundle.

Generate `REALTIME_AUTH_SECRET` once and paste the exact same value into Vercel and the realtime
server host:

```bash
openssl rand -base64 48
```

Keep it server-only: never prefix it with `NEXT_PUBLIC_`. It signs short-lived account identity
tokens so Render can verify the Google account established by Auth.js on Vercel. With the bridge
configured, guests can still play casual games, while signed-in profile mutations, seat reconnects,
and ranked entry cannot be performed by claiming another account ID.

`CLIENT_ORIGIN` also accepts a comma-separated allowlist for deploy previews:

```bash
CLIENT_ORIGIN="https://deuces-arena.vercel.app,https://deuces-arena-git-preview.vercel.app"
```

ML export scripts:

```bash
COACH_EVALUATION_EXPORT_PATH="artifacts/coach-evaluations.jsonl"
COACH_EVALUATION_EXPORT_LIMIT="1000"
```

The app can run without `DATABASE_URL`, but match history, move persistence, durable guest stats, coach-evaluation persistence, and earned cosmetic unlocks require PostgreSQL. Production should not run without `REALTIME_AUTH_SECRET` once signed-in accounts or ranked mode are public.

`GET /health` returns safe deployment metadata such as allowed origins, uptime, room counts, whether PostgreSQL/Redis are configured, and the disconnected-player grace delay. It does not expose secret connection strings.

Signed-in accounts listed in `ADMIN_EMAILS` can open the private `/admin` page on the web app. The
page uses a short-lived server-to-server token to read persisted feedback and player reports from
Render; the signing secret is never sent to the browser. Keep `ADMIN_EMAILS` limited to trusted
creator accounts and keep `REALTIME_AUTH_SECRET` identical on Vercel and Render.

Run the public production smoke test after each Vercel or Render deployment:

```bash
npm run smoke:production
```

It verifies the homepage, sign-in disclosure, privacy and terms pages, install manifest, sitemap,
app icons, social preview, web/server security headers, protected admin access, Render health,
PostgreSQL, the allowed Vercel origin, and signed realtime identity. Render's free instance may take
up to about a minute to wake. To diagnose a deployment
before the identity bridge is configured, temporarily run
`SMOKE_REQUIRE_REALTIME_AUTH=false npm run smoke:production`; do not use that override as the
public-launch acceptance check.

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

Copy the database environment template and place the provider's direct, unpooled connection string in the ignored file. Keep the pooled connection string in Render's runtime `DATABASE_URL`.

```bash
cp packages/db/.env.example packages/db/.env
```

Run this after setting `DATABASE_URL` in `packages/db/.env`:

```bash
npm run db:generate --workspace @deuces-arena/db
npm run db:migrate:deploy --workspace @deuces-arena/db
npm run db:seed --workspace @deuces-arena/db
```

Run migrations from a trusted machine or CI job with database access. Do not run destructive migration resets against production.

## Production Notes

- Keep the server as the authority for all online moves.
- Set `CLIENT_ORIGIN` to the exact deployed web origin, or a tight comma-separated allowlist, before enabling public traffic.
- Use `GET /health` after every deploy to confirm the server is running with the expected origin allowlist, persistence mode, and disconnect grace setting.
- Run through [demo-readiness.md](demo-readiness.md) before sharing the public link.
- Use one server instance until Redis-backed presence and room state are added.
- Do not claim the bot or coach is AI until recommendations are grounded in simulations or model outputs.
- Enable HTTPS for both web and server origins; browsers require secure contexts for production WebSocket usage in most deployments.
- Keep `DATABASE_URL`, future auth secrets, and future Stripe keys out of client-exposed `NEXT_PUBLIC_*` variables.
- If the server provider sleeps free instances, the first connection after idle may be slow. That is acceptable for a demo but should be disclosed in the README once deployed.

## AI Cost Controls

Core gameplay, baseline bots, Move Lab rollouts, and self-play run without a paid model API. Before
any external AI provider is enabled, require all of the following:

- AI analysis is opt-in and only runs after a match or explicit review request.
- Per-user and global request limits are enforced on the server.
- Results are cached by game state so identical positions are not billed twice.
- A server-side kill switch can disable external model calls immediately.
- Provider budgets and billing alerts are set to the smallest practical amount.

Do not put an AI provider key in a `NEXT_PUBLIC_*` variable or call a paid model once per turn.
