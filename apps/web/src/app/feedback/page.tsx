import type {
  CommunityFeedbackStatus,
  FeedbackKind,
  PublicCommunityFeedback
} from "@deuces-arena/shared";
import { CheckCircle2, MessageCircle, MessageSquareText, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { SignInWithGoogleButton } from "@/components/auth-buttons";
import { CommunityFeedbackForm } from "@/components/community-feedback-form";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Feedback",
  description: "See player feedback, creator responses, and improvements planned for Deuces Arena."
};

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

export default async function CommunityFeedbackPage() {
  const [session, feedback] = await Promise.all([auth(), fetchCommunityFeedback()]);
  const fixedCount = feedback?.filter((item) => item.status === "FIXED").length ?? 0;
  const activeCount =
    feedback?.filter((item) => item.status === "PLANNED" || item.status === "IN_PROGRESS").length ??
    0;

  return (
    <main className="min-h-screen bg-[#05070a] px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Community Feedback</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Ideas, problems, and creator responses in one public place. Constructive criticism
              stays visible so players can follow what improves.
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/12 bg-white/8 px-4 text-sm font-semibold transition hover:bg-white/14"
            href="/"
          >
            Back to table
          </Link>
        </header>

        <section className="grid gap-3 border-b border-white/10 py-5 sm:grid-cols-3">
          <FeedbackStat label="Public posts" value={feedback?.length ?? 0} />
          <FeedbackStat label="Being worked on" value={activeCount} />
          <FeedbackStat label="Marked fixed" value={fixedCount} />
        </section>

        <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase text-[var(--gold)]">Player voices</p>
                <h2 className="mt-1 text-2xl font-black">Latest posts</h2>
              </div>
              <span className="text-xs font-semibold text-zinc-500">Newest first</span>
            </div>

            <div className="mt-4 grid gap-3">
              {feedback === null ? (
                <EmptyFeedback
                  title="Feedback is temporarily unavailable"
                  body="The realtime service may be waking up. Please check again shortly."
                />
              ) : feedback.length === 0 ? (
                <EmptyFeedback
                  title="Start the conversation"
                  body="There are no public posts yet. Share the first useful idea or observation."
                />
              ) : (
                feedback.map((item) => <CommunityFeedbackCard key={item.id} item={item} />)
              )}
            </div>
          </section>

          <aside className="border-t border-white/10 pt-6 lg:sticky lg:top-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-center gap-2">
              <MessageSquareText className="size-5 text-[var(--aqua)]" />
              <h2 className="text-xl font-black">Share feedback</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Sign-in reduces spam, but you can hide your display name by posting anonymously.
              Private reports remain available from the Arena Menu inside the lobby.
            </p>

            <div className="mt-5">
              {session?.user === undefined ? (
                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-300">
                    Sign in before adding a public post.
                  </p>
                  <SignInWithGoogleButton className="h-11 w-full" />
                </div>
              ) : (
                <CommunityFeedbackForm />
              )}
            </div>

            <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-zinc-500">
              Profanity is masked automatically. Threats and hate speech are rejected; posts are
              otherwise hidden only for spam, harassment, exposed personal information, or another
              stated policy violation.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function CommunityFeedbackCard({ item }: { readonly item: PublicCommunityFeedback }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/6 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/12 bg-black/25 text-sm font-black text-[var(--aqua)]">
            {item.isAnonymous ? "?" : item.authorName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{item.authorName}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{formatDate(item.createdAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/7 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">
            {formatKind(item.kind)}
          </span>
          <FeedbackStatusBadge status={item.status} />
        </div>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm font-medium leading-6 text-zinc-100">
        {item.body}
      </p>

      {item.creatorReply === null ? null : (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase text-[var(--gold)]">
            <Sparkles className="size-3.5" /> Creator response
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{item.creatorReply}</p>
        </div>
      )}
    </article>
  );
}

function FeedbackStatusBadge({ status }: { readonly status: CommunityFeedbackStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[10px] font-black uppercase",
        status === "FIXED"
          ? "bg-emerald-300/12 text-emerald-200"
          : status === "IN_PROGRESS"
            ? "bg-cyan-300/12 text-cyan-200"
            : status === "PLANNED"
              ? "bg-amber-300/12 text-amber-200"
              : "bg-white/8 text-zinc-300"
      )}
    >
      {status === "IN_PROGRESS" ? "In progress" : status.toLowerCase()}
    </span>
  );
}

function FeedbackStat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle2 className="size-5 text-[var(--aqua)]" />
      <div>
        <p className="text-xl font-black">{value}</p>
        <p className="text-xs font-semibold text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

function EmptyFeedback({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/12 px-5 py-10 text-center">
      <MessageCircle className="mx-auto size-7 text-zinc-600" />
      <p className="mt-3 text-sm font-black">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-zinc-500">{body}</p>
    </div>
  );
}

async function fetchCommunityFeedback(): Promise<readonly PublicCommunityFeedback[] | null> {
  try {
    const response = await fetch(`${SERVER_URL}/community-feedback?limit=50`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as readonly PublicCommunityFeedback[];
  } catch {
    return null;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatKind(kind: FeedbackKind): string {
  return kind === "UI" ? "Design" : kind.toLowerCase();
}
