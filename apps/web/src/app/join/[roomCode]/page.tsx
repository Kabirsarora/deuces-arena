import { isValidRoomCode, normalizeRoomCode } from "@deuces-arena/shared";
import { ArrowRight, Smartphone, UsersRound } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Join a Table | Deuces Arena",
  description: "Open a shared Deuces Arena table invitation."
};

export default async function JoinTablePage({
  params
}: {
  readonly params: Promise<{ readonly roomCode: string }>;
}) {
  const { roomCode: rawRoomCode } = await params;
  const roomCode = normalizeRoomCode(rawRoomCode);
  const validRoomCode = isValidRoomCode(roomCode);

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--ink)] px-5 py-10 text-white">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full border border-emerald-200/20 bg-emerald-300/10">
          <UsersRound className="size-7 text-[var(--aqua)]" />
        </div>
        <p className="mt-6 text-xs font-black uppercase text-[var(--gold)]">Table invitation</p>
        <h1 className="mt-2 text-4xl font-black tracking-normal">
          {validRoomCode ? roomCode : "Invalid code"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-400">
          {validRoomCode
            ? "Join this Deuces Arena table in the app or continue in your browser."
            : "This invitation is incomplete. Ask the host to share a new room link."}
        </p>

        {validRoomCode ? (
          <div className="mt-8 grid gap-3">
            <a
              className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--gold)] px-5 font-black text-black transition hover:brightness-105"
              href={`deucesarena://join/${encodeURIComponent(roomCode)}`}
            >
              <Smartphone className="size-5" />
              Open the app
            </a>
            <Link
              className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/12 bg-white/7 px-5 font-black text-white transition hover:bg-white/10"
              href={`/?room=${encodeURIComponent(roomCode)}`}
            >
              Continue in browser
              <ArrowRight className="size-5" />
            </Link>
          </div>
        ) : (
          <Link
            className="mt-8 flex min-h-12 items-center justify-center rounded-md bg-[var(--gold)] px-5 font-black text-black"
            href="/"
          >
            Return to Deuces Arena
          </Link>
        )}
      </section>
    </main>
  );
}
