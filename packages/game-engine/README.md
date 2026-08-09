# Game Engine

Pure TypeScript Deuces / Big Two engine.

This package owns card models, deck generation, hand detection, move validation, legal move generation, game state transitions, baseline bots, simulations, and future ML hooks.

It must not depend on React, Next.js, browser APIs, database clients, or server frameworks.

Current bot support has three transparent levels: `random-legal` explores freely, `lowest-legal` conserves bombs and plays inexpensive responses, and `simple-heuristic` preserves combinations and supplies candidates to bounded rollout evaluation. These are game-playing strategies, not trained AI.

Simulation supports both random legal playouts and a mixed policy that usually follows the transparent baseline heuristic while retaining random exploration. Move evaluations report win rate, average placement, rollout completion, and a Wilson 95% win-rate interval. These results are estimates, not perfect strategy; future evaluators should be benchmarked with larger self-play datasets and learned model outputs.

## Rule Variants

The default bomb rule lets a stronger bomb answer the current bomb. Consumers can pass `{ bombEndsTrick: true }` to game-state transitions when a room should make any bomb immediately win the trick instead.

The default deck is classic Deuces with diamonds, clubs, hearts, and spades. The `arena-six` deck contains 78 unique cards and adds Stars and Crowns above spades for casual 5-6 player tables and larger hands. Sets may use any of the six suits. Bombs stay compatible with classic rules: exactly four matching cards plus one off-rank kicker, with no five- or six-of-a-kind super bomb.

Rule variants should stay explicit inputs to the engine so web, server, replay, and future mobile clients can all reproduce the same match behavior.
