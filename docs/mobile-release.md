# Mobile Release Packet

This packet keeps the first iOS and Android submission consistent with the shipped app. Review the
copy immediately before submission and change any claim that no longer matches production.

## Store Listing

- App name: `Deuces Arena`
- Apple subtitle: `Online Big Two Card Game`
- Google Play short description: `Play Big Two online with friends, bots, ranked matches, and tournaments.`
- Primary category: Games / Card
- Secondary category: Games / Strategy
- Support URL: `https://deucesarena.com/`
- Privacy policy URL: `https://deucesarena.com/privacy`
- Terms URL: `https://deucesarena.com/terms`

### Full Description

Deuces Arena is a modern online home for Deuces, also known as Big Two. Play a quick bot game,
open a casual table for friends, enter four-player ranked matchmaking, or compete through an
eight-player Arena Cup bracket.

Every move is validated by a server-authoritative TypeScript game engine. Match history, ratings,
replays, earned Arena Coins, and cosmetic loadouts follow a signed-in player across web and mobile.
Casual play remains available without an account.

Features include:

- Classic four-suit Deuces and the optional six-suit Arena 6 variant
- Two-to-six player casual tables with configurable bots and timers
- Four-player ranked matchmaking with placement-based ratings
- Eight-player tournaments with semifinals and a final
- Moderated room chat, blocking, reporting, feedback, and reconnect support
- Earned card, table, avatar, and profile-border cosmetics with no gameplay advantage
- Optional table alerts for ranked and tournament matches

Arena Coins are earned through play, have no cash value, and cannot be bought or wagered. Deuces
Arena does not contain real-money gambling.

## Screenshot Set

Capture clean production data with no email address, debug overlay, placeholder art, or private room
code. Use one coherent cosmetic loadout across the set.

1. Play screen showing Classic and Arena 6 setup controls.
2. Immersive table with four seats, an active trick, and the player's hand.
3. Casual room browser with online, open, and active counts.
4. Ranked queue with rating tier, queue count, and ETA.
5. Arena Cup bracket with semifinals and final.
6. Shop and Locker with card-face/back and table previews.
7. Profile with rating, coins, cosmetics, and match history.
8. Moderated table chat or post-match result screen.

## Brand Artwork

The checked-in native icon is an original crossed-card Deuces crest built around the high `2`, four
classic suits, emerald felt, mint details, and antique gold. The opaque 1024px store icon and the
transparent Android/splash derivatives live under `apps/mobile/assets/images`; editable master and
isolated emblem sources live in `apps/mobile/assets/images/brand`. Do not restore Expo starter art or
add rounded corners to the master icon because each operating system applies its own mask. The web
install icons and Open Graph image use the same crest so shared links and installed apps retain one
identity.

## Review Notes

Provide the reviewer a normal Google test account if sign-in must be exercised. Explain that guest
bot and casual play work without an account, while ranked, tournaments, cloud progression, and push
alerts require sign-in. Never place a personal production password in this repository.

Suggested review path:

1. Open Play and start a four-player bot game.
2. Select a legal hand, play, pass, and leave the table.
3. Open Rooms and create a casual table.
4. Sign in with the review account.
5. Open Profile, view Locker and Matches, and opt in to table alerts if notification review is needed.

## Privacy Disclosures

Use the store forms' current wording and disclose behavior, not intent. The app currently processes:

- Account identity: Google name, email, stable identifier, and profile photo after opt-in sign-in.
- User content: display name, table chat, feedback, reports, replay labels, and cosmetic choices.
- Gameplay: rooms, cards, moves, legal-move context, results, ratings, replays, and simulations.
- Diagnostics: feedback user-agent and ordinary infrastructure logs/network metadata.
- Device identifiers: a local guest identifier and an Expo push token after explicit alert opt-in.

The app does not sell data, use gameplay data for advertising, request contacts/messages/passwords,
or offer real-money purchases or wagering. Recheck these answers if analytics, ads, or payments are
added later.

## Owner Checklist

These steps require the owner's Expo, Apple, or Google accounts and cannot be completed from source
code alone:

1. Run `npx eas-cli login` and `npx eas-cli init` from `apps/mobile`.
2. Create signed iOS and Android development builds with the existing `development` profile.
3. Test Google account handoff, universal/app links, reconnect, cosmetics, chat, queues, and alerts
   on physical devices.
4. Add the Apple Team ID and Android signing fingerprint to Vercel's association-file settings.
5. Configure Apple Push Notification service and Firebase Cloud Messaging credentials through EAS.
6. Set Render `PUSH_NOTIFICATIONS_ENABLED=true` only after an end-to-end alert succeeds. Add
   `EXPO_ACCESS_TOKEN` only if enhanced Expo push security is enabled.
7. Create the App Store Connect and Play Console records, complete their current privacy/age/content
   questionnaires, upload screenshots, provide review access, and submit the signed builds.

## Release Verification

Run before each store build:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run mobile:preflight
cd apps/mobile && npx expo-doctor
```

Run `npm run mobile:preflight:strict` immediately before store submission. Strict mode also fails
while notification delivery or either signed app-link association remains incomplete.

Do not commit signing files, service-account JSON, Apple keys, Google credentials, Expo access
tokens, reviewer passwords, or `.env.local` files.
