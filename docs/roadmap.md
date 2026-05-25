# Roadmap

## Phase 1: Foundation

- Configure monorepo tooling.
- Add reusable TypeScript package boundaries.
- Document architecture and mobile-transfer goals.
- Configure formatting, linting, testing, and type checking.

## Phase 2: Game Engine

- Model cards, ranks, suits, and deck generation.
- Implement card comparison with diamonds < clubs < hearts < spades and 3 < ... < A < 2.
- Detect singles, pairs, trips, quads, full houses, straights, longer straights, and bombs.
- Validate first move requiring the 3 of diamonds.
- Implement trick state, passing, trick winners, turn rotation, legal move generation, and game winner logic.
- Add heavy Vitest coverage.

## Phase 3: Local Play

- Build mobile-first web table.
- Add human vs baseline bots.
- Use `random-legal` and `lowest-legal` bots only as honest baselines, not as claimed AI.
- Add polished card selection, trick display, turn indicator, and game over screen.

## Phase 4: Online Multiplayer

- Add rooms, lobby, ready states, reconnects, and room links.
- Add Socket.IO event contracts and server-authoritative move validation.
- Persist matches and moves.

## Phase 5: Accounts, Stats, and Replays

- Add user accounts and guest play.
- Store match history, move history, placements, bombs played, rating, and replay timelines.
- Build profile and replay review screens.

## Phase 6: Ranked and AI

- Add simple placement-based rating.
- Add leaderboards and ranked history.
- Add simulation-based move evaluation.
- Add self-play data generation and future ML model hooks.
- Add AI coach only when explanations can be grounded in analysis.

## Phase 7: Cosmetics and Supporter Features

- Add unlockable card backs, table themes, avatars, borders, badges, emotes, and win animations.
- Keep all monetization non-pay-to-win.
- Add Stripe support later for optional supporter features.
