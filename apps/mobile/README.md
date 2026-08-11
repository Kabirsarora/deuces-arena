# Deuces Arena Mobile

Expo / React Native client for Deuces Arena. It reuses the monorepo game engine, Socket.IO contracts, hosted realtime server, and player profile model instead of maintaining mobile-only game rules.

## Current Milestone

- Native Play, Rooms, Ranked, and Profile tabs.
- Configurable 2-6 player bot games with Classic or Arena 6 decks.
- Server-authoritative card selection, legal move validation, passing, trick state, and match results.
- Live open-room discovery, room codes, casual room creation, and bot fill.
- Persistent on-device guest identity and profile editing.
- Secure Google account handoff through `deucesarena.com`, with the app session stored in the
  iOS Keychain or Android Keystore.
- Shared web/mobile ratings, coins, cosmetics, history, admin access, ranked matchmaking, and
  tournament queue entry.
- Moderated table chat, cosmetics shop and locker, match history, feedback, and room reconnect.

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
EXPO_PUBLIC_WEB_URL="http://localhost:3000"
```

Production uses `https://deucesarena.com/mobile-connect` for Google sign-in. The website issues a
two-minute, purpose-limited handoff; the realtime server exchanges it for a 30-day mobile session.
No Google client secret is shipped in the app. Sign-in requires a development or production build
that owns the `deucesarena://` URL scheme; guest play remains available in Expo Go.

## Verification

```bash
npm run typecheck --workspace @deuces-arena/mobile
npm run lint --workspace @deuces-arena/mobile
cd apps/mobile && npx expo-doctor
```

## Next Milestones

1. Development builds, physical-device account testing, and accessibility QA.
2. Push notifications for table invitations and matchmaking.
3. App Store and Google Play screenshots, privacy declarations, and submission.
4. Universal links to replace the custom-scheme account callback before broad distribution.
5. A separate iOS Messages extension for sharing and opening room invitations.
