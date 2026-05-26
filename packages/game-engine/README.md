# Game Engine

Pure TypeScript Deuces / Big Two engine.

This package owns card models, deck generation, hand detection, move validation, legal move generation, game state transitions, baseline bots, simulations, and future ML hooks.

It must not depend on React, Next.js, browser APIs, database clients, or server frameworks.

Current bot support is intentionally modest: `random-legal`, `lowest-legal`, and `simple-heuristic` are baseline strategies for playable games, not trained AI.

Current simulation support is intentionally basic: random legal rollouts can estimate one move or rank legal moves by win rate and average placement. These results are not presented as perfect strategy. Stronger bots and AI coach explanations should build on these primitives with better rollout policies, self-play data, and future model outputs.
