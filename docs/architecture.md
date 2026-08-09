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

Realtime state is intentionally shaped for resume-visible systems work:

- Public lobby activity exposes connected users, open rooms, active tables, seated humans, seated bots, and joinable room metadata.
- Room state includes public players, current trick, placements, recent replay events, recent chat, and the current player's private hand.
- Player state includes profile stats and equipped cosmetic loadouts, while the server remains responsible for validating equipment.
- Match completion updates ratings, match history, move history, replay state, and earned cosmetic unlocks when persistence is enabled.

## Data Model

The Prisma schema separates gameplay, identity, and future AI data:

- `User`: guest/account identity, stats, rating, supporter status, cosmetics.
- `Match` and `MatchPlayer`: match-level metadata, placements, ratings, cards remaining, bombs played, move counts.
- `MoveEvent`: structured move timeline with hand-before, trick-before, legal-move summary, game result, and future score columns.
- `CoachEvaluation`: persisted Move Lab output for later analysis/model training.
- `Cosmetic`, `UserCosmeticUnlock`, `UserEquippedCosmetic`: non-pay-to-win progression and supporter-ready appearance data.

The database is optional in local development. Without `DATABASE_URL`, the app still runs playable rooms, in-memory guest stats, lobby activity, chat, bots, replays, and simulation analysis.

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

## Cosmetics and Monetization

Cosmetics are modeled as presentation-only data. They can unlock from play, supporter status, promotions, or admin grants, but never change rules, legal moves, rating changes, matchmaking, or bot behavior.

Current progression rules:

- Complete one persisted match to unlock the starter card back.
- Win one persisted match to unlock the starter table theme.
- Supporter cosmetics are represented in the catalog but are not gameplay advantages.

## Initial Rule Choices

- Bombs are four of a kind plus one extra kicker card.
- A bomb beats any non-bomb hand during a trick.
- Bomb strength is currently determined by the rank of the four of a kind. The kicker is ignored.
- Default rooms allow an active bomb to be beaten only by a stronger bomb.
- Room settings can instead enable the `bombEndsTrick` variant, where any bomb immediately wins the trick and starts a new one.
- Casual rooms can use the experimental `arena-six` deck, which adds Stars and Crowns above spades for up to six players.
- Arena 6 uses the finalized four-of-a-kind plus off-rank kicker bomb. Five- and six-of-a-kind super bombs are intentionally not part of the variant.
- Straights must be at least five cards and must match exact length when answered.
- The default straight rules do not allow `2` inside a straight. This is documented as a variant point for later.
