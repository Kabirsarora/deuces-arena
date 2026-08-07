# Game Engine

Pure TypeScript Deuces / Big Two engine.

This package owns card models, deck generation, hand detection, move validation, legal move generation, game state transitions, baseline bots, simulations, and future ML hooks.

It must not depend on React, Next.js, browser APIs, database clients, or server frameworks.

Current bot support is intentionally modest: `random-legal`, `lowest-legal`, and `simple-heuristic` are baseline strategies for playable games, not trained AI.

Simulation supports both random legal playouts and a mixed policy that usually follows the transparent baseline heuristic while retaining random exploration. Move evaluations report win rate, average placement, rollout completion, and a Wilson 95% win-rate interval. These results are estimates, not perfect strategy; future evaluators should be benchmarked with larger self-play datasets and learned model outputs.

## Rule Variants

The default bomb rule lets a stronger bomb answer the current bomb. Consumers can pass `{ bombEndsTrick: true }` to game-state transitions when a room should make any bomb immediately win the trick instead.

The default deck is classic Deuces with diamonds, clubs, hearts, and spades. The experimental `arena-six` deck adds placeholder Stars and Crowns suits above spades for casual 5-6 player tables and larger hands. These suits are a product/design placeholder, not final card art.

Rule variants should stay explicit inputs to the engine so web, server, replay, and future mobile clients can all reproduce the same match behavior.
