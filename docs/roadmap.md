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
- Done: use random and lowest-legal bots as honest baselines, plus a bounded simulation-guided hard bot that is not presented as trained AI.
- Done: add accessible card selection labels and pressed states for the hand controls.
- Done: respect reduced-motion preferences for deal and card-selection motion.
- Done: carry equipped deck artwork onto card faces and render each opponent's exact remaining hand as a responsive face-down fan around the table.
- In progress: continue polishing table layout, card motion, and visual identity so the UI feels less generic.

## Phase 4: Online Multiplayer

- Done: add rooms, lobby, ready states, reconnects, leave-room flow, and room links.
- Done: add live lobby activity with open rooms, connected users, active tables, humans, and bots.
- Done: make public lobby activity human-centered with online users and open/active room counts.
- Done: add Socket.IO event contracts and server-authoritative move validation.
- Done: add a signed, short-lived identity bridge from Auth.js to Socket.IO so account actions and seat reconnects cannot claim another signed-in profile.
- Done: persist matches, moves, ratings, coach evaluations, and replays when a database is connected.
- Done: add in-memory rate limits for noisy realtime actions.
- Done: add disconnect grace auto-moves so active abandoned seats do not freeze a table.
- Done: add an optional casual-only Trade Phase with a 20-second pregame window, one outbound request and one accepted one-for-one trade per player, private request details, atomic server validation, replay history, and no ranked support.
- Next: add Redis-backed room durability for multi-instance hosting.

## Phase 5: Accounts, Stats, and Replays

- Done: add guest profiles.
- Done: store match history, move history, placements, bombs played, rating, cards remaining, and replay timelines.
- Done: expose profile, leaderboard, match history, and replay export in the online UI.
- Done: add full account auth, profile pages, and a richer replay review screen.
- Done: require verified signed-in identity for ranked entry when production realtime auth is configured.
- Done: add searchable match history filters.
- Done: add saved replay labels.
- Done: use verified Google account photos as the profile and table-seat fallback while allowing equipped avatar cosmetics to override them.
- Done: add persistent player blocks, local mutes, structured reports, profanity filtering, and moderation rate limits.

## Phase 6: Ranked and AI

- Done: add simple placement-based rating.
- Done: add leaderboard and match history foundations.
- Done: add simulation-based move evaluation and exportable coach-evaluation records.
- Done: add self-play data generation, JSONL exports, and future ML model hooks.
- Done: split casual rooms and ranked matchmaking, requiring four verified human accounts, no bots, a default turn timer, queue position/ETA, and duplicate-account protection.
- Done: add replay state reconstruction and on-demand mistake review that compares actual decisions with simulated alternatives.
- Done: add mixed-policy Monte Carlo playouts that combine the transparent baseline heuristic with random exploration, plus rollout completion and Wilson 95% win-rate intervals.
- Done: add Bronze through Arena Master tiers, visible tier progress, ranked coin bonuses, and earned division borders.
- Next: benchmark and tune rollout policies with larger self-play datasets, then calibrate estimates against held-out games.
- Later: add AI coach explanations only when grounded in legal moves, simulations, replay data, and model outputs.
- Requirement: keep core play and simulations free of paid model calls; future external AI must be opt-in, cached, rate-limited, protected by a kill switch, and deployed with strict provider budgets.

## Phase 7: Cosmetics and Supporter Features

- Done: add cosmetic schema, seed data, catalog API, profile unlocks, equipment validation, and public loadouts.
- Done: add earned starter cosmetics after completed matches/wins.
- Done: add Arena Coins as a non-real-money soft-currency foundation for future cosmetics.
- Done: add server-validated Arena Coin cosmetic unlocks for priced non-supporter cosmetics.
- Done: make equipped card backs and table themes visibly alter the table.
- Done: add avatar and profile-border cosmetics to player seats.
- Done: add cosmetic inventory filters and clearer owned/equipped counts.
- Done: add a compact profile details panel with stats, loadout, and latest match context.
- Done: add a dedicated signed-in profile page backed by REST profile/history endpoints.
- Done: add copyable share text for profile match summaries.
- Done: add public profile cards for sharing player stats.
- Done: add saved replay labels.
- Done: keep monetization non-pay-to-win by modeling cosmetics as presentation-only data.
- Done: add a Shop and Locker flow with earned coins, secure purchases, original Arena Cup artwork, and an original Arena 6 card back.
- Done: finalize Arena 6 as a 78-card Stars/Crowns ruleset with six-suit sets, structured legal move generation, and classic four-card bombs.
- Later: add Stripe support for optional supporter features.

## Phase 8: Tournaments

- Done: add an eight-player signed-in queue that creates two four-player semifinals.
- Done: automatically advance the top two players from each semifinal into a four-player final.
- Done: add a live bracket, fixed competitive timer, placement coin prizes, and an earned champion border.
- Done: persist tournament seeds, semifinal advancement, final placements, linked match records, and profile tournament history.
- Next: recover queues after server restarts and add scheduled events or additional formats.

## Phase 9: Mobile and Messages

- Done: build an Expo / React Native client that reuses the game engine, shared contracts, backend, persistence model, and simulation tooling.
- Done: add native room sharing, app deep-link joins, a browser fallback page, and universal/app-link configuration endpoints.
- Done: add explicit notification permission, secure Expo token registration, signed-account ownership, opt-out, and notification room routing.
- Done: add environment-gated ranked/tournament alerts, bounded Expo retries, durable receipt tracking, and invalid-device cleanup.
- Done: add native accessibility labels/states and a checked-in iOS/Android store release packet.
- Done: add bounded server-action timeouts, storage fallbacks, render recovery, and automatic
  competitive-match table routing for mobile runtime resilience.
- Done: add native player detail sheets with public stats, persistent chat blocking, and structured
  safety reports backed by the shared moderation service.
- Done: bring native casual rooms to web parity with host settings, human ready states, bot fill,
  timers, rule variants, and the optional server-authoritative pregame trade window.
- Next: link EAS, install development builds on physical devices, and finish Apple/Android domain verification with the generated signing identifiers.
- Next: configure native push credentials and test ranked/tournament delivery on physical devices before enabling production sends.
- Later: build a native iMessage extension with Apple's Messages framework so group conversations can send and join Deuces Arena games without claiming integration with GamePigeon.
