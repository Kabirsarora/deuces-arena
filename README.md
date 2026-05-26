# Deuces Arena

[![CI](https://github.com/jagjitarora/deuces-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/jagjitarora/deuces-arena/actions/workflows/ci.yml)

Real-time multiplayer Big Two / Deuces platform with AI bots, replay analysis, and ML-ready strategy coaching.

## Current Features

- Pure TypeScript game engine with card models, hand detection, comparison rules, legal move generation, server-safe state transitions, baseline bots, replays, ratings, and simulation-based move evaluation utilities.
- Mobile-first Next.js table for local human vs bot play, with selected-card motion, trick display, turn state, and game-over summaries.
- Socket.IO rooms with server-authoritative move validation, reconnect support, ready states, leave-room flow, invite links, bot fill, table chat, live lobby discovery, open-room counts, connected-user counts, and replay export.
- Guest profiles with match history, leaderboard data, placement-based ratings, bombs played, moves played, and cards remaining at game end.
- Move Lab analysis that ranks legal moves with random rollouts on the active player's turn, stores the analysis in replay exports, and can persist those records for future AI coach training/evaluation.
- Prisma/PostgreSQL schema and initial migration for users, matches, match players, move history, coach evaluations, replay labels, and future AI/model scores.
- Early ML package for random self-play sample generation and JSONL export of persisted coach evaluations without pretending baseline bots are trained AI.

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

## ML Data Export

After setting `DATABASE_URL`, persisted Move Lab records can be exported as JSONL for offline analysis.

```bash
COACH_EVALUATION_EXPORT_PATH=artifacts/coach-evaluations.jsonl npm run export:coach-evaluations --workspace @deuces-arena/ml
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

## Resume Targets

- Built a real-time multiplayer Big Two platform with Next.js, TypeScript, Socket.IO, PostgreSQL, Prisma, and reusable monorepo packages for game logic, shared contracts, persistence, and ML experiments.
- Developed a server-authoritative TypeScript game engine with legal move generation, replayable state transitions, baseline bots, trick validation, bomb rules, and structured move logging.
- Designed an AI-readiness pipeline with random rollout move evaluation, coach-analysis replay records, persisted evaluation data, self-play generation, and JSONL export for future model training.
