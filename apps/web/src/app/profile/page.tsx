import type {
  PublicCosmetic,
  PublicGuestProfile,
  PublicMatchHistoryItem,
  PublicTournamentHistoryItem
} from "@deuces-arena/shared";
import Link from "next/link";

import { auth } from "@/auth";
import { SignInWithGoogleButton } from "@/components/auth-buttons";
import { CopyMatchSummaryButton } from "@/components/copy-match-summary-button";
import { createAuthProfileId } from "@/lib/auth-profile";

export const dynamic = "force-dynamic";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

export default async function ProfilePage() {
  const session = await auth();

  if (session?.user === undefined) {
    return (
      <main className="grid min-h-screen place-items-center px-5 py-10 text-white">
        <section className="online-panel w-full max-w-md p-6 text-center">
          <p className="text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
          <h1 className="mt-2 text-3xl font-black">Profile</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Sign in to view your rating, match history, coins, and cosmetics across devices.
          </p>
          <SignInWithGoogleButton className="mt-6 h-12 w-full" />
          <Link
            className="mt-4 inline-flex text-sm font-bold text-zinc-400 hover:text-white"
            href="/"
          >
            Back to table
          </Link>
        </section>
      </main>
    );
  }

  const profileId = createAuthProfileId(session.user.email ?? session.user.name ?? "unknown");
  const [profile, history, tournaments, cosmetics] = await Promise.all([
    fetchProfile(profileId),
    fetchMatchHistory(profileId),
    fetchTournamentHistory(profileId),
    fetchCosmetics()
  ]);
  const displayName = profile?.displayName ?? session.user.name ?? "Arena Player";
  const publicProfilePath = `/profile/${encodeURIComponent(profileId)}`;
  const unlockedIds = new Set(profile?.unlocks.map((unlock) => unlock.cosmetic.id) ?? []);
  const equippedIds = new Set(
    profile?.equippedCosmetics.map((equipped) => equipped.cosmetic.id) ?? []
  );
  const lockedCount = Math.max(0, cosmetics.length - unlockedIds.size);

  return (
    <main className="min-h-screen bg-[#05070a] px-5 py-8 text-white">
      <section className="mx-auto grid w-full max-w-6xl gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
            <h1 className="mt-2 text-4xl font-black sm:text-5xl">{displayName}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {session.user.email ?? "Signed-in profile"} ·{" "}
              {profile?.isAdmin === true ? "∞" : (profile?.arenaCoins ?? 0)} coins
            </p>
          </div>
          <Link
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white transition hover:bg-white/14 sm:w-auto"
            href="/"
          >
            Back to table
          </Link>
        </header>

        <section className="online-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">Public profile card</p>
            <p className="mt-1 break-all text-xs text-zinc-400">{publicProfilePath}</p>
          </div>
          <div className="flex gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-md border border-white/12 bg-white/8 px-3 text-sm font-semibold text-white transition hover:bg-white/14"
              href={publicProfilePath}
            >
              Open
            </Link>
            <CopyMatchSummaryButton
              copiedLabel="Copied"
              label="Copy link"
              summary={publicProfilePath}
            />
          </div>
        </section>

        {profile === null ? (
          <section className="online-panel p-5">
            <p className="text-sm font-bold text-zinc-300">
              Profile data is unavailable until the realtime server is running.
            </p>
          </section>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProfileStat label="Rating" value={profile.rating} />
            <ProfileStat label="Games" value={profile.gamesPlayed} />
            <ProfileStat label="Wins" value={profile.wins} />
            <ProfileStat
              label="Avg place"
              value={profile.averagePlacement === null ? "-" : profile.averagePlacement.toFixed(2)}
            />
          </section>
        )}

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="online-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-[var(--gold)]">Match history</p>
                <h2 className="mt-1 text-2xl font-black">Recent results</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs text-zinc-300">
                {history.length} saved
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {history.length === 0 ? (
                <p className="rounded-[1rem] border border-white/10 bg-white/7 px-4 py-3 text-sm text-zinc-400">
                  Completed online matches will appear here after the backend database is connected.
                </p>
              ) : (
                history.map((match) => <MatchHistoryRow key={match.matchId} match={match} />)
              )}
            </div>
          </section>

          <section className="online-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-[var(--aqua)]">Inventory</p>
                <h2 className="mt-1 text-2xl font-black">Cosmetics</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs text-zinc-300">
                {unlockedIds.size}/{cosmetics.length}
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              <ProfileStat label="Equipped" value={equippedIds.size} />
              <ProfileStat label="Locked" value={lockedCount} />
            </div>

            <div className="mt-4 grid gap-2">
              {cosmetics.slice(0, 8).map((cosmetic) => (
                <div
                  key={cosmetic.id}
                  className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/10 bg-white/7 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{cosmetic.name}</p>
                    <p className="text-xs text-zinc-400">{formatCosmeticKind(cosmetic.kind)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-black/24 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">
                    {equippedIds.has(cosmetic.id)
                      ? "Equipped"
                      : unlockedIds.has(cosmetic.id)
                        ? "Owned"
                        : cosmetic.coinPrice === null
                          ? "Supporter"
                          : `${cosmetic.coinPrice} coins`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section className="online-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[var(--gold)]">Arena Cup</p>
              <h2 className="mt-1 text-2xl font-black">Tournament history</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs text-zinc-300">
              {tournaments.length} entered
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {tournaments.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/7 px-4 py-3 text-sm text-zinc-400 md:col-span-2">
                Completed and active Arena Cups will appear here.
              </p>
            ) : (
              tournaments.map((tournament) => (
                <TournamentHistoryRow key={tournament.tournamentId} tournament={tournament} />
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function TournamentHistoryRow({
  tournament
}: {
  readonly tournament: PublicTournamentHistoryItem;
}) {
  const result =
    tournament.finalPlacement === null
      ? tournament.advancedToFinal
        ? "Finalist"
        : tournament.semifinalPlacement === null
          ? "In progress"
          : `Semifinal ${ordinal(tournament.semifinalPlacement)}`
      : tournament.finalPlacement === 1
        ? "Champion"
        : `${ordinal(tournament.finalPlacement)} overall`;

  return (
    <div className="rounded-lg border border-white/10 bg-white/7 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black">{result}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Seed {tournament.seed} · {tournament.semifinalStage.replace("-", " ")}
          </p>
        </div>
        <span className="rounded-full bg-black/24 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">
          {tournament.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {tournament.championName === null
          ? new Date(tournament.createdAt).toLocaleDateString()
          : `Champion: ${tournament.championName}`}
      </p>
    </div>
  );
}

function ProfileStat({
  label,
  value
}: {
  readonly label: string;
  readonly value: string | number;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/7 px-4 py-3">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function MatchHistoryRow({ match }: { readonly match: PublicMatchHistoryItem }) {
  const matchSummary = formatShareableMatchSummary(match);

  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/7 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black">
            {match.placement === null ? "Unplaced" : ordinal(match.placement)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{formatMatchMode(match.mode)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-black/24 px-2 py-1 text-xs font-black">
            {formatRatingDelta(match.ratingDelta)}
          </span>
          <CopyMatchSummaryButton summary={matchSummary} />
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-400">
        {match.movesPlayed ?? 0} moves · {match.bombsPlayed} bombs · {match.roomCode ?? "archived"}
      </p>
      <p className="mt-2 rounded-[0.8rem] border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-zinc-400">
        {matchSummary}
      </p>
    </div>
  );
}

async function fetchProfile(profileId: string): Promise<PublicGuestProfile | null> {
  return fetchJson<PublicGuestProfile>(`${SERVER_URL}/profiles/${encodeURIComponent(profileId)}`);
}

async function fetchMatchHistory(profileId: string): Promise<readonly PublicMatchHistoryItem[]> {
  return (
    (await fetchJson<readonly PublicMatchHistoryItem[]>(
      `${SERVER_URL}/profiles/${encodeURIComponent(profileId)}/history?limit=10`
    )) ?? []
  );
}

async function fetchTournamentHistory(
  profileId: string
): Promise<readonly PublicTournamentHistoryItem[]> {
  return (
    (await fetchJson<readonly PublicTournamentHistoryItem[]>(
      `${SERVER_URL}/profiles/${encodeURIComponent(profileId)}/tournaments?limit=8`
    )) ?? []
  );
}

async function fetchCosmetics(): Promise<readonly PublicCosmetic[]> {
  return (await fetchJson<readonly PublicCosmetic[]>(`${SERVER_URL}/cosmetics`)) ?? [];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatCosmeticKind(kind: PublicCosmetic["kind"]): string {
  return kind
    .toLowerCase()
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatRatingDelta(delta: number | null): string {
  if (delta === null) {
    return "Unrated";
  }

  return delta >= 0 ? `+${delta}` : `${delta}`;
}

function formatShareableMatchSummary(match: PublicMatchHistoryItem): string {
  const placement = match.placement === null ? "unplaced" : `${ordinal(match.placement)} place`;
  const rating = formatRatingDelta(match.ratingDelta);
  const moves = match.movesPlayed ?? 0;
  const room = match.roomCode ?? "archived match";

  return `Deuces Arena ${formatMatchMode(match.mode)}: ${placement}, ${rating} rating, ${moves} moves, ${match.bombsPlayed} bombs (${room}).`;
}

function formatMatchMode(mode: PublicMatchHistoryItem["mode"]): string {
  if (mode === "RANKED") {
    return "Ranked";
  }

  if (mode === "LOCAL_DEMO") {
    return "Demo";
  }

  return "Casual";
}

function ordinal(value: number): string {
  if (value === 1) {
    return "1st";
  }

  if (value === 2) {
    return "2nd";
  }

  if (value === 3) {
    return "3rd";
  }

  return `${value}th`;
}
