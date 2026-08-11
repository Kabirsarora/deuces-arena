# Deuces Arena Mobile

Expo / React Native client for Deuces Arena. It reuses the monorepo game engine, Socket.IO contracts, hosted realtime server, and player profile model instead of maintaining mobile-only game rules.

## Current Milestone

- Native Play, Rooms, Ranked, and Profile tabs.
- Configurable 2-6 player bot games with Classic or Arena 6 decks.
- Server-authoritative card selection, legal move validation, passing, trick state, and match results.
- Live open-room discovery, room codes, casual room creation, and bot fill.
- Persistent on-device guest identity and profile editing.
- Live ranked and tournament queue status. Native account authentication is the next milestone before queue entry is enabled.

## Start Locally

From the repository root:

```bash
npm install
npm run build --workspace @deuces-arena/game-engine
npm run build --workspace @deuces-arena/shared
npm run start --workspace @deuces-arena/mobile
```

Scan the QR code with Expo Go, or press `i`, `a`, or `w` for an iOS simulator, Android emulator, or browser preview.

The hosted server defaults to `https://api.deucesarena.com`. To target another server, create `apps/mobile/.env.local`:

```bash
EXPO_PUBLIC_SERVER_URL="http://localhost:4000"
```

## Verification

```bash
npm run typecheck --workspace @deuces-arena/mobile
npm run lint --workspace @deuces-arena/mobile
cd apps/mobile && npx expo-doctor
```

## Next Milestones

1. Native Google sign-in and account/profile synchronization.
2. Ranked and tournament queue entry.
3. Chat, cosmetics shop/locker, match history, and reconnect persistence.
4. Development builds, push notifications, device testing, accessibility, and store assets.
5. App Store and Google Play submission.
6. A separate iOS Messages extension for sharing and opening room invitations.
