# Deuces Arena Mobile

Expo / React Native client for Deuces Arena. It reuses the monorepo game engine, Socket.IO contracts, hosted realtime server, and player profile model instead of maintaining mobile-only game rules.

## Current Milestone

- Native Play, Rooms, Ranked, and Profile tabs.
- Configurable 2-6 player bot games with Classic or Arena 6 decks.
- Server-authoritative card selection, legal move validation, passing, trick state, and match results.
- Live open-room discovery, room codes, ready states, and host-controlled casual setup for 2-6
  players, card counts, bot difficulty/pace, timers, bomb behavior, Arena 6, and bot fill.
- Optional casual-only pregame card trading with the same private, server-validated limits as web;
  ranked and tournament tables never enable it.
- Persistent on-device guest identity and profile editing.
- Secure Google account handoff through `deucesarena.com`, with the app session stored in the
  iOS Keychain or Android Keystore.
- Shared web/mobile ratings, coins, cosmetics, history, admin access, ranked matchmaking, and
  tournament queue entry.
- Automatic table entry when ranked matchmaking or a tournament stage fills.
- Moderated table chat, tappable player stats, blocking/reporting, cosmetics shop and locker, match
  history, feedback, and room reconnect.
- Native system sharing and `/join/ROOMCODE` deep links with a safe browser fallback.
- Explicit, signed-account table-alert registration stored securely on-device and in PostgreSQL.
- A single immersive table surface for seats, tricks, controls, and the player hand, with exact
  opponent card counts and saved card-back/table cosmetics shared across web and mobile.

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

## Native Development Builds

The checked-in `eas.json` provides development-device, iOS Simulator, internal-preview, and
production profiles. All profiles target the hosted Deuces Arena web and realtime services. The
first EAS setup is intentionally left unlinked so no Expo account or project identifier is committed
without the owner's approval.

From `apps/mobile`, link the project once and create the build you need:

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile development-simulator --platform ios
```

For a physical device, use `--profile development` and choose `ios` or `android`. After installing
the build, run `npm run start:dev-client --workspace @deuces-arena/mobile` from the repository root.
EAS credentials and signing secrets stay in Expo's credential service and must not be added to
`.env` files or committed.

Table alerts require a development or store build; remote push notifications are not available in
Expo Go on Android. After `eas init`, the app reads the EAS project ID from the native build, asks
for notification permission only when the player taps Enable, and registers the resulting Expo push
token against that signed-in Arena account. The server can deliver ranked and tournament table
alerts, persist Expo receipt IDs, retry temporary failures, and remove devices reported as
unregistered. Delivery remains off until `PUSH_NOTIFICATIONS_ENABLED=true` is set after native
credentials and a device test.

## Verification

```bash
npm run typecheck --workspace @deuces-arena/mobile
npm run lint --workspace @deuces-arena/mobile
cd apps/mobile && npx expo-doctor
cd ../.. && npm run mobile:preflight
```

## Next Milestones

1. Link the EAS project, create development builds, and test account handoff, room links, and table-alert registration on physical devices.
2. Add the EAS Apple Team ID and Android signing-certificate fingerprint to Vercel for verified universal links.
3. Configure native push credentials, run an end-to-end device test, and enable production delivery.
4. App Store and Google Play screenshots, privacy declarations, and submission.
5. A separate iOS Messages extension for sharing and opening room invitations.

Store listing copy, screenshots, disclosure notes, reviewer guidance, and the account-bound launch
checklist live in [`docs/mobile-release.md`](../../docs/mobile-release.md).
