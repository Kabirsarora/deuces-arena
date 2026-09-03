import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Rules and conditions for using the Deuces Arena game service."
};

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      summary="These terms set basic expectations for using Deuces Arena fairly and responsibly. By using the service, you agree to follow these rules."
    >
      <section>
        <h2>The service</h2>
        <p>
          Deuces Arena is an online shedding-card game platform offering casual rooms, bot games,
          ranked matchmaking, profiles, replays, simulations, and cosmetic progression. Features may
          change as the project develops.
        </p>
      </section>

      <section>
        <h2>Accounts</h2>
        <p>
          Casual play may be available without an account. Ranked play and persistent account
          features require Google sign-in. You are responsible for activity performed through your
          account and should not share or impersonate another player&apos;s identity.
        </p>
      </section>

      <section>
        <h2>Fair play and conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>inspect, exploit, or tamper with hidden game state or realtime messages;</li>
          <li>
            use automation, collusion, multiple accounts, or intentional disconnects unfairly;
          </li>
          <li>harass players, evade chat filtering, or submit unlawful or abusive content;</li>
          <li>attack, overload, scrape, or interfere with the service or other players; or</li>
          <li>misrepresent rankings, cosmetics, replays, or account ownership.</li>
        </ul>
        <p>
          Access, ratings, rewards, or accounts may be limited when needed to protect players and
          the integrity of the game.
        </p>
      </section>

      <section>
        <h2>Community feedback</h2>
        <p>
          Signed-in players may choose to publish feedback with their display name. Constructive
          criticism is allowed and may remain visible even when it is negative. Posts may be hidden
          for spam, harassment, hate speech, exposed personal information, unlawful content, or
          another stated policy violation. Creator responses and progress labels are informational
          and do not promise that a requested change will be completed.
        </p>
      </section>

      <section>
        <h2>Rankings and game variants</h2>
        <p>
          Ratings are calculated from placement using the rules implemented by the service and may
          be adjusted if bugs or abuse affect results. Casual settings, including card trading,
          timers, expanded suits, and bomb variants, are not necessarily part of ranked rules.
        </p>
      </section>

      <section>
        <h2>Virtual currency and cosmetics</h2>
        <p>
          Arena Coins and cosmetics are game features with no cash value. They cannot currently be
          purchased with real money, redeemed for money, transferred outside supported game
          features, or used for real-money wagering. Cosmetics do not provide competitive gameplay
          advantages.
        </p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>
          The service is provided as available and may experience delays, maintenance, data loss, or
          interruptions, especially while using free hosting infrastructure. Features, rules,
          ratings, and stored data may be changed or removed to fix problems or improve the service.
        </p>
      </section>

      <section>
        <h2>Disclaimers and responsibility</h2>
        <p>
          Deuces Arena is provided without guarantees that it will always be available, error-free,
          or suitable for a particular purpose. To the extent permitted by applicable law, the
          project owner is not responsible for indirect losses caused by use of or inability to use
          the service.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          These terms may be updated as the project changes. Continued use after an update means you
          accept the revised terms. Questions or concerns can be submitted through the in-app
          feedback form.
        </p>
      </section>
    </PolicyPage>
  );
}
