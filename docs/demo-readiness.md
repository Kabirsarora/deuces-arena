# Demo Readiness

Use this checklist before sharing a hosted Deuces Arena link or recording a project walkthrough.

## Local Verification

Run the same commands that GitHub Actions runs:

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

For a faster server-only smoke test while working on multiplayer behavior:

```bash
npm run test --workspace @deuces-arena/server
npm run build --workspace @deuces-arena/server
```

For a faster frontend smoke test while working on the table or lobby:

```bash
npm run typecheck --workspace @deuces-arena/web
npm run lint --workspace @deuces-arena/web
npm run build --workspace @deuces-arena/web
```

## Hosted Demo Checks

- Open the deployed web URL and confirm the lobby loads without console-breaking errors.
- Confirm the browser tab title, install metadata, and social preview text identify the app as Deuces Arena.
- Confirm the lobby shows current online users, open rooms, and active rooms.
- Create a casual bot table and start a game.
- Create a casual room, copy the invite link, and join from another browser profile or incognito window.
- Enable the casual trade window, send one human-to-human request, and confirm normal play waits until the trade phase closes.
- Send one table chat message and confirm it appears for both clients.
- Play at least one legal move and one pass.
- Sign in, join ranked from four browser sessions, and confirm one four-human table starts with no bots and a 45-second timer.
- Submit a short feedback report from the feedback panel.
- Open a profile page and confirm public stats render.
- Visit the server `/health` endpoint and verify the allowed origin, persistence mode, Redis mode, and disconnected-player grace delay.

## Demo Script

1. Start in the lobby and point out current online users, open rooms, and active rooms.
2. Create a room with bots to show the app is playable solo.
3. Open lobby settings and mention casual variants: timer, bot difficulty, player count, cards per player, bomb rule, Arena 6 deck, and the optional pregame trade window.
4. Start a hand and show server-authoritative validation by selecting cards and playing a legal move.
5. Open rules/chat only when needed so the table stays uncluttered.
6. Finish or simulate a match state, then show profile stats, match history, replay labels, and cosmetics.
7. Explain that current bots are baseline opponents, while Move Lab and ML exports are the foundation for future simulation/model-driven coaching.
8. End with the architecture: reusable TypeScript engine, Socket.IO authority, Prisma/PostgreSQL persistence, shared contracts, and ML-ready move data.

## Resume Talking Points

- Real-time Socket.IO rooms with server-authoritative move validation and reconnect/disconnect handling.
- Reusable TypeScript game engine separated from React so a future Expo app can reuse the same rules and state transitions.
- PostgreSQL/Prisma schema for users, matches, move events, coach evaluations, cosmetics, and replay labels.
- Structured move history and Move Lab evaluations designed for future ML training data.
- Non-pay-to-win cosmetics and Arena Coins modeled as presentation-only progression.
- CI-backed monorepo with linting, formatting, type checking, tests, and builds.

## Known Demo Caveats

- Free backend hosts may sleep, so the first Socket.IO connection after idle can take longer; the lobby displays a waking-server state while it reconnects.
- Redis-backed multi-instance room durability is not implemented yet; run one backend instance for the public demo.
- Move Lab uses random rollout simulations, so present it as analysis infrastructure rather than perfect AI.
- Google sign-in requires real OAuth credentials and callback URLs in the deployed environment.
- Arena 6 suit names/icons and any super-bomb variant are still product decisions.
