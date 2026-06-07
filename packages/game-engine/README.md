# Game Engine

Pure TypeScript Deuces / Big Two engine.

This package owns card models, deck generation, hand detection, move validation, legal move generation, game state transitions, baseline bots, simulations, and future ML hooks.

It must not depend on React, Next.js, browser APIs, database clients, or server frameworks.

Current bot support is intentionally modest: `random-legal`, `lowest-legal`, and `simple-heuristic` are baseline strategies for playable games, not trained AI.

Current simulation support is intentionally basic: random legal rollouts can estimate one move or rank legal moves by win rate and average placement. These results are not presented as perfect strategy. Stronger bots and AI coach explanations should build on these primitives with better rollout policies, self-play data, and future model outputs.

## Rule Variants

The default bomb rule lets a stronger bomb answer the current bomb. Consumers can pass `{ bombEndsTrick: true }` to game-state transitions when a room should make any bomb immediately win the trick instead.

The default deck is classic Deuces with diamonds, clubs, hearts, and spades. The experimental `arena-six` deck adds placeholder Stars and Crowns suits above spades for casual 5-6 player tables and larger hands. These suits are a product/design placeholder, not final card art.

Rule variants should stay explicit inputs to the engine so web, server, replay, and future mobile clients can all reproduce the same match behavior.
