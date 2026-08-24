import Link from "next/link";
import type { ReactNode } from "react";

export function PolicyPage({
  title,
  summary,
  lastUpdated = "August 6, 2026",
  children
}: {
  readonly title: string;
  readonly summary: string;
  readonly lastUpdated?: string;
  readonly children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#07090c] px-5 py-10 text-white sm:px-8 sm:py-14">
      <article className="mx-auto w-full max-w-3xl">
        <header className="border-b border-white/12 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              className="text-xs font-black uppercase tracking-wide text-[var(--aqua)] transition hover:text-white"
              href="/"
            >
              Deuces Arena
            </Link>
            <Link className="text-sm font-bold text-zinc-400 transition hover:text-white" href="/">
              Back to the arena
            </Link>
          </div>
          <h1 className="mt-8 text-4xl font-black sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">{summary}</p>
          <p className="mt-4 text-xs font-bold uppercase text-zinc-500">
            Last updated {lastUpdated}
          </p>
        </header>

        <div className="policy-content">{children}</div>

        <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/12 pt-6 text-sm font-bold text-zinc-400">
          <Link className="transition hover:text-white" href="/privacy">
            Privacy
          </Link>
          <Link className="transition hover:text-white" href="/terms">
            Terms
          </Link>
          <Link className="transition hover:text-white" href="/">
            Play Deuces Arena
          </Link>
        </footer>
      </article>
    </main>
  );
}
