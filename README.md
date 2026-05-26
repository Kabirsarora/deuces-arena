# Deuces Arena

[![CI](https://github.com/jagjitarora/deuces-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/jagjitarora/deuces-arena/actions/workflows/ci.yml)

Real-time multiplayer Big Two / Deuces platform with AI bots, replay analysis, and ML-ready strategy coaching.

## Current Features

- Pure TypeScript game engine with validation, legal move generation, bots, replays, ratings, and simulation utilities.
- Mobile-first Next.js table for local human vs bot play.
- Socket.IO rooms with server-authoritative move validation, reconnect support, ready states, leave-room flow, invite links, bot fill, guest stats, live lobby discovery, table chat, activity counts, and replay export.
- Prisma/PostgreSQL schema for users, matches, match players, move history, replay labels, and future AI scores.
- Early ML package for random self-play sample generation without pretending baseline bots are trained AI.

## Local Setup

```bash
npm install
npm run dev --workspace @deuces-arena/web
npm run dev --workspace @deuces-arena/server
```

The web app defaults to `http://localhost:3000`; the realtime server defaults to `http://localhost:4000`.

## Database Setup

The app runs without a database for local UI and engine work. To persist match history, move events, and guest profile stats, set `DATABASE_URL` in your environment using a PostgreSQL database such as Neon or Supabase.

Prisma ORM 7 keeps the database URL in `packages/db/prisma.config.ts`, while `schema.prisma` only defines the data model.

```bash
npm run db:generate --workspace @deuces-arena/db
npm run db:migrate --workspace @deuces-arena/db
```

## Verification

GitHub Actions runs the same verification suite on pushes to `main`, `codex/**` branches, and pull requests.

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for web, server, database, and environment variable deployment notes.
