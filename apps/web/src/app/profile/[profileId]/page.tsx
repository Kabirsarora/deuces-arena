import type {
  PublicGuestProfile,
  PublicMatchHistoryItem,
  PublicTournamentHistoryItem
} from "@deuces-arena/shared";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

export default async function PublicProfilePage({
  params
}: {
  readonly params: Promise<{ readonly profileId: string }>;
}) {
  const { profileId } = await params;
  const [profile, history, tournaments] = await Promise.all([
    fetchProfile(profileId),
    fetchMatchHistory(profileId),
    fetchTournamentHistory(profileId)
  ]);
  const displayName = profile?.displayName ?? "Arena Player";
  const winRate =
    profile === null || profile.gamesPlayed === 0
      ? null
      : Math.round((profile.wins / profile.gamesPlayed) * 100);

  return (
    <main className="min-h-screen bg-[#05070a] px-5 py-8 text-white">
      <section className="mx-auto grid w-full max-w-4xl gap-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena profile</p>
            <h1 className="mt-2 text-4xl font-black sm:text-5xl">{displayName}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Public stats card · {profile?.isAdmin === true ? "∞" : (profile?.arenaCoins ?? 0)}{" "}
              coins earned
            </p>
          </div>
          <Link
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white transition hover:bg-white/14 sm:w-auto"
            href="/"
          >
            Play Deuces
          </Link>
        </header>

        {profile === null ? (
          <section className="online-panel p-5">
            <p className="text-sm font-bold text-zinc-300">
              This public profile is unavailable until the realtime server is running.
            </p>
          </section>
        ) : (
          <section className="online-panel overflow-hidden p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <p className="text-xs font-black uppercase text-[var(--gold)]">Rating</p>
                <p className="mt-1 text-6xl font-black">{profile.rating}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-80">
                <ProfileCardMetric label="Games" value={profile.gamesPlayed} />
                <ProfileCardMetric label="Wins" value={profile.wins} />
                <ProfileCardMetric
                  label="Win rate"
                  value={winRate === null ? "-" : `${winRate}%`}
                />
                <ProfileCardMetric
                  label="Avg place"
                  value={
                    profile.averagePlacement === null ? "-" : profile.averagePlacement.toFixed(2)
                  }
                />
              </div>
            </div>

            <div className="mt-5 grid gap-2 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black">Recent match card</p>
                <span className="rounded-full bg-white/7 px-2 py-1 text-xs text-zinc-300">
                  {history.length} saved
                </span>
              </div>
              {history.length === 0 ? (
                <p className="rounded-[1rem] border border-white/10 bg-white/7 px-4 py-3 text-sm text-zinc-400">
                  No completed matches are public for this profile yet.
                </p>
              ) : (
                history.slice(0, 3).map((match) => (
                  <div
                    key={match.matchId}
                    className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/10 bg-white/7 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-black">
                        {match.placement === null ? "Unplaced" : ordinal(match.placement)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {match.movesPlayed ?? 0} moves · {match.bombsPlayed} bombs
                      </p>
                    </div>
                    <span className="rounded-full bg-black/24 px-2 py-1 text-xs font-black">
                      {formatRatingDelta(match.ratingDelta)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {profile !== null && tournaments.length > 0 ? (
          <section className="online-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-[var(--gold)]">Arena Cup</p>
                <h2 className="mt-1 text-2xl font-black">Tournament results</h2>
              </div>
              <span className="rounded-full bg-white/7 px-2 py-1 text-xs text-zinc-300">
                {tournaments.length} entered
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {tournaments.map((tournament) => (
                <PublicTournamentResult key={tournament.tournamentId} tournament={tournament} />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function PublicTournamentResult({
  tournament
}: {
  readonly tournament: PublicTournamentHistoryItem;
}) {
  const result =
    tournament.finalPlacement === 1
      ? "Champion"
      : tournament.finalPlacement !== null
        ? `${ordinal(tournament.finalPlacement)} overall`
        : tournament.advancedToFinal
          ? "Finalist"
          : tournament.semifinalPlacement === null
            ? "In progress"
            : `Semifinal ${ordinal(tournament.semifinalPlacement)}`;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/7 px-4 py-3">
      <div>
        <p className="text-sm font-black">{result}</p>
        <p className="mt-1 text-xs text-zinc-400">
          Seed {tournament.seed} · {new Date(tournament.createdAt).toLocaleDateString()}
        </p>
      </div>
      <span className="rounded-full bg-black/24 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">
        {tournament.status}
      </span>
    </div>
  );
}

function ProfileCardMetric({
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

async function fetchProfile(profileId: string): Promise<PublicGuestProfile | null> {
  return fetchJson<PublicGuestProfile>(`${SERVER_URL}/profiles/${encodeURIComponent(profileId)}`);
}

async function fetchMatchHistory(profileId: string): Promise<readonly PublicMatchHistoryItem[]> {
  return (
    (await fetchJson<readonly PublicMatchHistoryItem[]>(
      `${SERVER_URL}/profiles/${encodeURIComponent(profileId)}/history?limit=3`
    )) ?? []
  );
}

async function fetchTournamentHistory(
  profileId: string
): Promise<readonly PublicTournamentHistoryItem[]> {
  return (
    (await fetchJson<readonly PublicTournamentHistoryItem[]>(
      `${SERVER_URL}/profiles/${encodeURIComponent(profileId)}/tournaments?limit=4`
    )) ?? []
  );
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

function formatRatingDelta(delta: number | null): string {
  if (delta === null) {
    return "Unrated";
  }

  return delta >= 0 ? `+${delta}` : `${delta}`;
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
