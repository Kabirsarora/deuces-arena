# Architecture

Deuces Arena is designed as a monorepo so the core systems can move from web to mobile without rewriting the game.

## Package Boundaries

- `apps/web`: Next.js frontend. It renders the table, cards, lobby, replay screens, account pages, and future coach UI.
- `apps/server`: Node.js realtime backend. It owns rooms, player sessions, server-authoritative move validation, and broadcasts.
- `packages/game-engine`: Pure TypeScript game rules, legal moves, state transitions, baseline bots, simulations, and future ML hooks.
- `packages/shared`: Shared contracts used by clients, server, engine, and scripts.
- `packages/db`: Prisma schema, migrations, database client, and seed scripts.
- `packages/ml`: Future self-play, simulation exports, model evaluation, and training experiments.

## Mobile-Ready Rule

The web app must not own gameplay logic. It should display state, collect input, and send player intentions to the backend or local engine. This keeps a future Expo / React Native app practical because it can reuse the engine, shared types, server API, replay data, and AI tooling.

## Server Authority

For online play, clients submit requested moves. The server validates those moves with `@deuces-arena/game-engine`, advances the official state, persists important events, and broadcasts the result.

## AI Roadmap

The AI system should grow in stages:

1. Correct game engine.
2. Random legal baseline bots.
3. Simple heuristic baseline bots.
4. Structured move and replay data.
5. Monte Carlo simulation evaluators.
6. Self-play data generation.
7. Policy/value model experiments.
8. AI coach grounded in legal moves, simulations, replay data, and model outputs.

The app should never hardcode "perfect strategy" and call it AI.
