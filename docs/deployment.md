# Deployment

Deuces Arena is split into separately deployable web, server, and database pieces so the same backend and engine can support a future mobile app.

## Targets

- Web app: deploy `apps/web` to Vercel or another Next.js host.
- Realtime server: deploy `apps/server` to a Node host with long-running WebSocket support.
- Database: use PostgreSQL through Neon, Supabase, or another managed provider.
- Redis: add later for cross-instance rooms, matchmaking, and presence when one server process is no longer enough.

## Required Environment Variables

Web:

```bash
NEXT_PUBLIC_SERVER_URL="https://your-server.example.com"
```

Server:

```bash
PORT="4000"
CLIENT_ORIGIN="https://your-web-app.example.com"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/deuces_arena"
```

The app can run without `DATABASE_URL`, but match history, move persistence, and durable guest stats require PostgreSQL.

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

## Start Commands

Web hosts usually run Next.js automatically after build.

Server:

```bash
node apps/server/dist/index.js
```

## Database Migration

Run this after setting `DATABASE_URL`:

```bash
npm run db:generate --workspace @deuces-arena/db
npm run db:migrate --workspace @deuces-arena/db
```

## Production Notes

- Keep the server as the authority for all online moves.
- Set `CLIENT_ORIGIN` to the exact deployed web origin before enabling public traffic.
- Use one server instance until Redis-backed presence and room state are added.
- Do not claim the bot or coach is AI until recommendations are grounded in simulations or model outputs.
