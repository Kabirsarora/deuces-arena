# Contributing

Deuces Arena is organized as a TypeScript monorepo. Keep changes focused, tested, and within the package that owns the behavior.

## Development workflow

1. Create a short-lived branch from `main`.
2. Install dependencies with `npm ci`.
3. Make one coherent change at a time.
4. Add or update tests for gameplay rules, shared contracts, or server behavior.
5. Run the verification suite before opening a pull request.

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

## Architecture boundaries

- Put deterministic rules, legal moves, comparisons, and state transitions in `packages/game-engine`.
- Keep React components focused on rendering state and collecting player intent.
- Treat `apps/server` as the realtime authority for rooms, timers, trades, and accepted moves.
- Define cross-package Socket.IO contracts and public DTOs in `packages/shared`.
- Put Prisma schema changes and migrations in `packages/db`.
- Do not describe baseline heuristics or random rollouts as trained AI.

## Commit style

Use concise Conventional Commit messages such as:

```text
feat: add legal move generation
fix: reject duplicate ranked accounts
test: cover bomb comparison variants
docs: update deployment checklist
```

Avoid combining unrelated refactors, features, and formatting changes in one commit.

## Gameplay changes

Rule changes should include tests and a short documentation update. Preserve the server-authoritative model, and keep casual variants disabled in ranked unless the ranked rules explicitly adopt them.
