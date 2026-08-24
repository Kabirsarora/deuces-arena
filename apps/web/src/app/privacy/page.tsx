import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Deuces Arena collects, uses, stores, and shares account and gameplay data."
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      summary="This policy explains what Deuces Arena collects, why it is needed, and the choices available to players. The project does not sell personal information or use gameplay data for advertising."
      lastUpdated="August 24, 2026"
    >
      <section>
        <h2>Information we collect</h2>
        <p>Deuces Arena may process the following information when you use the service:</p>
        <ul>
          <li>
            <strong>Google account information:</strong> name, email address, profile image, and a
            stable account identifier when you choose Google sign-in.
          </li>
          <li>
            <strong>Profile and progression:</strong> display name, avatar choice, rating, games,
            placements, wins, Arena Coins, cosmetic unlocks, and equipped cosmetics.
          </li>
          <li>
            <strong>Gameplay and replay data:</strong> rooms, seats, cards, legal-move context,
            selected moves, passes, turn history, results, replay labels, trades, and simulation
            evaluations.
          </li>
          <li>
            <strong>Feedback:</strong> report text, report category, optional contact email, room
            code, and browser user-agent information submitted with a report.
          </li>
          <li>
            <strong>Local device data:</strong> a guest identifier, hand-sort preference, and room
            recovery information stored in your browser. Authentication also uses secure session
            cookies.
          </li>
          <li>
            <strong>Mobile notification data:</strong> an Expo push token and device platform when a
            signed-in app user chooses to enable table alerts.
          </li>
          <li>
            <strong>Promotional widget data:</strong> normal network metadata, such as an IP address
            and browser information, may be processed by Ad Swap when its sandboxed lobby widget
            loads. Deuces Arena does not send account or gameplay data to the widget.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>Information is used to:</p>
        <ul>
          <li>authenticate accounts and keep profiles available across devices;</li>
          <li>run rooms, validate moves, reconnect seats, calculate results, and prevent abuse;</li>
          <li>maintain ratings, match history, replays, earned currency, and cosmetics;</li>
          <li>deliver opted-in room invitation and matchmaking alerts to the mobile app;</li>
          <li>analyze game decisions through simulations and improve future coaching tools; and</li>
          <li>investigate feedback, bugs, balance concerns, and service reliability.</li>
        </ul>
        <p>
          Google account information is used only for sign-in, account identification, profile
          display, and the account features described above. Deuces Arena does not request access to
          Google Drive, contacts, messages, or passwords.
        </p>
      </section>

      <section>
        <h2>Public and shared information</h2>
        <p>
          Display names, ratings, game statistics, equipped cosmetics, and match summaries may be
          visible to other players or on public profile pages. Email addresses are not intentionally
          displayed on public profiles. Table chat is shared with players in that room and is not
          part of the persisted match-history schema.
        </p>
        <p>
          Service providers process data only as needed to operate the app. Current infrastructure
          includes Google for authentication, Vercel for the web app, Render for realtime services,
          Neon for PostgreSQL storage, Expo for opted-in mobile notification delivery, and Ad Swap
          for the reciprocal indie-site promotion shown in the lobby. These providers may process
          normal network metadata such as IP addresses, request logs, device push tokens, and
          delivery receipts under their own policies.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          Account, match, move, replay, cosmetic, and feedback records may be retained while they
          are needed to provide the service, maintain rankings, analyze gameplay, or resolve abuse
          and reliability issues. Temporary room and chat state may disappear when a room is removed
          or the realtime service restarts.
        </p>
        <p>
          Deuces Arena uses HTTPS, server-authoritative move validation, signed realtime identity
          tokens, restricted production origins, and access controls intended to protect player
          data. No internet service can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can play casual modes as a guest, sign out of Google, clear local browser storage, or
          stop using the service. Mobile table alerts are optional and can be disabled from the
          player profile. To request access, correction, or deletion of account information, submit
          a privacy request through the in-app feedback form and include an email address that can
          be used to verify the account.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          This policy may change as Deuces Arena adds features or providers. The date at the top
          will be updated when material changes are published. Privacy questions can be submitted
          through the feedback form available from the lobby.
        </p>
      </section>
    </PolicyPage>
  );
}
