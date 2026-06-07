# Deuces Arena

[![CI](https://github.com/jagjitarora/deuces-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/jagjitarora/deuces-arena/actions/workflows/ci.yml)

Real-time multiplayer Big Two / Deuces platform with AI bots, replay analysis, and ML-ready strategy coaching.

## Current Features

- Pure TypeScript game engine with card models, hand detection, comparison rules, legal move generation, server-safe state transitions, random/lowest/simple-heuristic baseline bots, replays, ratings, and simulation-based move evaluation utilities.
- Mobile-first Next.js table for local human vs bot play, with selected-card motion, trick display, turn state, game-over summaries, replay review targets, and hosted-demo metadata.
- Socket.IO rooms with server-authoritative move validation, reconnect support, disconnect grace auto-moves, ready states, leave-room flow, invite links, bot fill, table chat, basic realtime rate limits, live lobby discovery, open-room counts, connected-user counts, server health indicators, and replay export.
- Guest profiles with searchable match history, leaderboard data, placement-based ratings, bombs played, moves played, and cards remaining at game end.
- Signed-in and public profile pages with account stats, recent match summaries, copyable share text, Arena Coins, and cosmetic inventory.
- Move Lab analysis that ranks legal moves with random rollouts on the active player's turn, stores the analysis in replay exports, and can persist those records for future AI coach training/evaluation.
- Cosmetics foundation with catalog APIs, earned unlock tracking, profile loadouts, equip validation, starter progression rewards, and non-pay-to-win supporter-ready data models.
- Arena Coins soft-currency foundation for earned, non-real-money progression rewards.
- Prisma/PostgreSQL schema and migrations for users, matches, match players, move history, coach evaluations, cosmetic unlocks/equipment, replay labels, and future AI/model scores.
- Early ML package for random self-play sample generation and JSONL export of persisted coach evaluations without pretending baseline bots are trained AI.

## Architecture

```text
apps/web             Next.js, React, Tailwind, Framer Motion UI
apps/server          Express + Socket.IO realtime authority
packages/game-engine Pure TypeScript rules, bots, replay, ratings, simulations
packages/shared      Socket contracts and public DTOs
packages/db          Prisma schema, migrations, seeds
packages/ml          Self-play and coach-evaluation data export scripts
```

The engine is deliberately independent from React and the server. A future Expo / React Native app should be able to reuse the rules, shared contracts, replay format, persistence model, and AI/simulation tooling while replacing the web UI.

## Game Rules

Deuces Arena currently implements classic 4-player Deuces / Big Two plus an experimental casual Arena 6 table variant:

- Each player receives 13 cards.
- Card rank order is `3 4 5 6 7 8 9 10 J Q K A 2`.
- Classic suit order is diamonds, clubs, hearts, spades.
- Arena 6 adds placeholder Stars and Crowns suits above spades, so the full order is diamonds, clubs, hearts, spades, stars, crowns.
- Casual rooms can choose 2-6 seats and custom cards per player when the selected deck has enough cards.
- The player holding 3 of diamonds starts, and the first play must include it.
- The lead player chooses the trick type: single, pair, trips, quad, full house, straight, longer straight, or bomb.
- Players must answer with the same hand type and straight length, unless they play a bomb.
- Players may pass even if they have a legal answer.
- When everyone else passes, the last valid player wins the trick and leads the next one.
- First player to empty their hand wins.

Bomb variants:

- A bomb is four of a kind plus one kicker.
- A bomb beats any non-bomb hand.
- Bomb strength is determined by the rank of the four of a kind; the kicker is ignored.
- Default room rule: once a bomb is active, only a stronger bomb can beat it.
- Optional room rule: a bomb immediately wins the trick, so no stronger bomb response is allowed.
- Arena 6 keeps bombs as four of a kind plus one kicker for now; five- or six-of-a-kind "super bomb" rules are intentionally deferred.
- These are intentionally documented as variant choices so more house rules can be added later.

## Local Setup

```bash
npm install
npm run dev --workspace @deuces-arena/web
npm run dev --workspace @deuces-arena/server
```

The web app defaults to `http://localhost:3000`; the realtime server defaults to `http://localhost:4000`.

Google sign-in is optional for local development. Without auth credentials, the app still works with
guest profiles stored by browser. To test Google sign-in, create a `.env.local` for `apps/web` with
`AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`, then configure the Google OAuth redirect
URI as `http://localhost:3000/api/auth/callback/google`.

Useful backend endpoints:

- `GET /health`: service health, safe config metadata, uptime, and active room count.
- `GET /lobby`: public room/activity snapshot.
- `GET /leaderboard`: persisted or in-memory guest leaderboard.
- `GET /cosmetics`: active cosmetic catalog.

## Database Setup

The app runs without a database for local UI and engine work. To persist match history, move events, and guest profile stats, set `DATABASE_URL` in your environment using a PostgreSQL database such as Neon or Supabase.

Prisma ORM 7 keeps the database URL in `packages/db/prisma.config.ts`, while `schema.prisma` only defines the data model.

```bash
npm run db:generate --workspace @deuces-arena/db
npm run db:migrate --workspace @deuces-arena/db
npm run db:seed --workspace @deuces-arena/db
```

The seed creates starter cosmetics used by the catalog and progression rules. In no-database mode, the server provides the same starter catalog as a safe fallback.

## Data and Progression

Move and match data are stored in a shape that can later become ML training data: selected move, hand before, current trick before, legal move count, cards remaining before/after, placement, replay events, and optional simulation/model score fields.

Current cosmetic progression is intentionally simple:

- Complete 1 persisted match: unlock `classic-red-card-back`.
- Win 1 persisted match: unlock `midnight-felt-table`.
- Supporter cosmetics are modeled separately and do not affect gameplay.
- Arena Coins are earned from completed matches and are not purchasable or bettable yet.
- Cosmetic coin purchases are server-validated and only unlock non-supporter presentation items such as card backs, table themes, avatars, and profile borders.

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

Current automated coverage includes engine rule tests, bot behavior tests, replay/rating/simulation tests, chat sanitization tests, cosmetic progression tests, and Socket.IO integration tests for room creation, lobby visibility, ready/start flow, bot fill, chat broadcast, feedback rate limits, Move Lab authorization, replay export, cosmetics catalog/profile fields, and equip validation.

The server defaults to a 15-second disconnected-player grace delay before it makes a safe lowest-legal move for the abandoned active seat. Hosted environments can tune this with `DISCONNECTED_AUTO_MOVE_DELAY_MS`, and confirm the active value through `GET /health`.

## Deployment

See [docs/deployment.md](docs/deployment.md) for web, server, database, and environment variable deployment notes.
Use [docs/demo-readiness.md](docs/demo-readiness.md) before sharing a hosted link or recording a walkthrough.

## Roadmap

- Polish online table UX, mobile layout, animations, and accessibility.
- Add production Google sign-in and account/profile persistence with deployed OAuth credentials.
- Deploy the frontend, backend, PostgreSQL database, and optional Redis layer.
- Expand ranked mode with queue health, rating history, leaderboards, and anti-abuse checks.
- Decide final Arena 6 suit art/names and whether expanded decks should add any super-bomb variant.
- Improve baseline bots, then add simulation-backed bots and self-play data generation.
- Build AI coach explanations from legal moves, replay state, rollout outcomes, and future model scores.
- Add replay timeline UI, searchable match history, and richer post-game analysis.
- Add non-pay-to-win cosmetics such as card backs, table themes, avatars, profile borders, and supporter badges.

## Known Limitations

- Current bots are baseline opponents, not trained AI.
- Move Lab uses random rollout simulation, so its recommendations are exploratory rather than perfect strategy.
- Google auth requires local or deployed OAuth environment variables.
- Database persistence is optional locally; without `DATABASE_URL`, stats and match history use safe in-memory fallbacks.
- Redis-backed scaling, matchmaking durability, anti-cheat hardening, and payment flows are future work.

## Resume Targets

- Built a real-time multiplayer Big Two platform with Next.js, TypeScript, Socket.IO, PostgreSQL, Prisma, and reusable monorepo packages for game logic, shared contracts, persistence, and ML experiments.
- Developed a server-authoritative TypeScript game engine with legal move generation, replayable state transitions, baseline bots, trick validation, bomb rules, and structured move logging.
- Designed an AI-readiness pipeline with random rollout move evaluation, coach-analysis replay records, persisted evaluation data, self-play generation, and JSONL export for future model training.
- Implemented live room discovery, guest profiles, placement-based ratings, replay exports, chat moderation, non-pay-to-win cosmetic progression, and server-validated cosmetic loadouts.
