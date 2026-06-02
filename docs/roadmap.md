# Roadmap

## Phase 1: Foundation

- Done: configure monorepo tooling.
- Done: add reusable TypeScript package boundaries.
- Done: document architecture and mobile-transfer goals.
- Done: configure formatting, linting, testing, type checking, builds, and CI.

## Phase 2: Game Engine

- Done: model cards, ranks, suits, and deck generation.
- Done: implement card comparison with diamonds < clubs < hearts < spades and 3 < ... < A < 2.
- Done: detect singles, pairs, trips, quads, full houses, straights, longer straights, and bombs.
- Done: validate first move requiring the 3 of diamonds.
- Done: implement trick state, passing, trick winners, turn rotation, legal move generation, and game winner logic.
- Done: add heavy Vitest coverage.

## Phase 3: Local Play

- Done: build mobile-first web table.
- Done: add human vs baseline bots.
- Done: use `random-legal`, `lowest-legal`, and `simple-heuristic` bots only as honest baselines, not as claimed AI.
- In progress: continue polishing table layout, card motion, and visual identity so the UI feels less generic.

## Phase 4: Online Multiplayer

- Done: add rooms, lobby, ready states, reconnects, leave-room flow, and room links.
- Done: add live lobby activity with open rooms, connected users, active tables, humans, and bots.
- Done: add Socket.IO event contracts and server-authoritative move validation.
- Done: persist matches, moves, ratings, coach evaluations, and replays when a database is connected.
- Next: add stronger disconnect/abandon handling and production rate limits.

## Phase 5: Accounts, Stats, and Replays

- Done: add guest profiles.
- Done: store match history, move history, placements, bombs played, rating, cards remaining, and replay timelines.
- Done: expose profile, leaderboard, match history, and replay export in the online UI.
- Next: add full account auth, profile pages, and a richer replay review screen.

## Phase 6: Ranked and AI

- Done: add simple placement-based rating.
- Done: add leaderboard and match history foundations.
- Done: add simulation-based move evaluation and exportable coach-evaluation records.
- Done: add self-play data generation, JSONL exports, and future ML model hooks.
- Next: split casual and ranked queues.
- Next: add stronger Monte Carlo evaluators and replay-based mistake detection.
- Later: add AI coach explanations only when grounded in legal moves, simulations, replay data, and model outputs.

## Phase 7: Cosmetics and Supporter Features

- Done: add cosmetic schema, seed data, catalog API, profile unlocks, equipment validation, and public loadouts.
- Done: add earned starter cosmetics after completed matches/wins.
- Done: add Arena Coins as a non-real-money soft-currency foundation for future cosmetics.
- Done: keep monetization non-pay-to-win by modeling cosmetics as presentation-only data.
- Next: make equipped card backs and table themes visibly alter the table.
- Later: add Stripe support for optional supporter features.
