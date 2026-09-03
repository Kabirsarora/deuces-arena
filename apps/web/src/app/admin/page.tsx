import {
  createRealtimeAuthToken,
  type AdminFeedbackReport,
  type AdminModerationQueue,
  type AdminPlayerReport,
  type CommunityFeedbackModerationReason,
  type CommunityFeedbackStatus,
  type PlayerReportStatus
} from "@deuces-arena/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { SignInWithGoogleButton } from "@/components/auth-buttons";
import { createAuthProfileId } from "@/lib/auth-profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false
  }
};

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const REPORT_ACTIONS: readonly { readonly label: string; readonly status: PlayerReportStatus }[] = [
  { label: "Reviewed", status: "REVIEWED" },
  { label: "Actioned", status: "ACTIONED" },
  { label: "Dismiss", status: "DISMISSED" }
];
const FEEDBACK_STATUSES: readonly CommunityFeedbackStatus[] = [
  "OPEN",
  "PLANNED",
  "IN_PROGRESS",
  "FIXED"
];
const FEEDBACK_HIDE_REASONS: readonly CommunityFeedbackModerationReason[] = [
  "SPAM",
  "HARASSMENT",
  "HATE_SPEECH",
  "PERSONAL_INFORMATION",
  "OTHER_POLICY_VIOLATION"
];

type ModerationLoadResult =
  | { readonly state: "ready"; readonly queue: AdminModerationQueue }
  | { readonly state: "forbidden" | "unavailable"; readonly queue: null };

export default async function AdminPage() {
  const session = await auth();

  if (session?.user === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070a] px-5 py-10 text-white">
        <section className="online-panel w-full max-w-md p-6 text-center">
          <p className="text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
          <h1 className="mt-2 text-3xl font-black">Admin</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Sign in with the configured creator account to review reports and feedback.
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
  const result = await fetchModerationQueue(profileId);

  if (result.state !== "ready") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070a] px-5 py-10 text-white">
        <section className="online-panel w-full max-w-lg p-6 text-center">
          <p className="text-xs font-black uppercase text-red-200">Protected area</p>
          <h1 className="mt-2 text-3xl font-black">
            {result.state === "forbidden" ? "Admin access required" : "Admin data unavailable"}
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            {result.state === "forbidden"
              ? "This Google account is not listed in the server ADMIN_EMAILS setting."
              : "The realtime server or database could not load the moderation queue."}
          </p>
          <Link
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md border border-white/12 bg-white/8 px-4 text-sm font-semibold transition hover:bg-white/14"
            href="/profile"
          >
            Back to profile
          </Link>
        </section>
      </main>
    );
  }

  const openReports = result.queue.playerReports.filter(
    (report) => report.status === "OPEN"
  ).length;

  return (
    <main className="min-h-screen bg-[#05070a] px-4 py-7 text-white sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Moderation queue</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Private creator view | {openReports} open reports | {result.queue.feedback.length}{" "}
              recent feedback items
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-white/12 bg-white/8 px-4 text-sm font-semibold transition hover:bg-white/14"
              href="/profile"
            >
              Profile
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--gold)] px-4 text-sm font-semibold text-black transition hover:brightness-105"
              href="/"
            >
              Table
            </Link>
          </div>
        </header>

        <section className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-red-200">Player safety</p>
              <h2 className="mt-1 text-2xl font-black">Player reports</h2>
            </div>
            <span className="text-xs text-zinc-500">Newest first</span>
          </div>
          <div className="mt-3 grid gap-3">
            {result.queue.playerReports.length === 0 ? (
              <EmptyQueue message="No player reports have been submitted." />
            ) : (
              result.queue.playerReports.map((report) => (
                <PlayerReportRow key={report.id} report={report} />
              ))
            )}
          </div>
        </section>

        <section className="mt-9">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[var(--gold)]">Product inbox</p>
              <h2 className="mt-1 text-2xl font-black">Feedback</h2>
            </div>
            <span className="text-xs text-zinc-500">Newest first</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {result.queue.feedback.length === 0 ? (
              <EmptyQueue message="No feedback has been submitted." />
            ) : (
              result.queue.feedback.map((report) => <FeedbackRow key={report.id} report={report} />)
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function PlayerReportRow({ report }: { readonly report: AdminPlayerReport }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-300/12 px-2 py-1 text-[10px] font-black uppercase text-red-100">
              {formatEnum(report.reason)}
            </span>
            <span className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">
              {formatEnum(report.status)}
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {formatDate(report.createdAt)} · room {report.roomCode ?? "unknown"}
          </p>
        </div>
        <p className="text-right text-xs text-zinc-400">
          Reporter: {shortId(report.reporterGuestId)}
          <br />
          Reported: {shortId(report.reportedGuestId)}
        </p>
      </div>

      {report.messageBody === null ? null : (
        <blockquote className="mt-3 border-l-2 border-red-200/30 pl-3 text-sm text-zinc-200">
          &ldquo;{report.messageBody}&rdquo;
        </blockquote>
      )}
      {report.details === null ? null : (
        <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{report.details}</p>
      )}

      <form className="mt-4 flex flex-wrap gap-2" action={updateReportStatus}>
        <input name="reportId" type="hidden" value={report.id} />
        {REPORT_ACTIONS.map((action) => (
          <button
            key={action.status}
            className="h-9 rounded-md border border-white/12 bg-white/8 px-3 text-xs font-bold transition hover:bg-white/14 disabled:cursor-default disabled:opacity-40"
            disabled={report.status === action.status}
            name="status"
            type="submit"
            value={action.status}
          >
            {action.label}
          </button>
        ))}
      </form>
    </article>
  );
}

function FeedbackRow({ report }: { readonly report: AdminFeedbackReport }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase text-[var(--gold)]">
            {report.kind}
          </span>
          <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">
            {report.isPublic ? formatEnum(report.publicStatus) : "Private"}
          </span>
          {report.hiddenAt === null ? null : (
            <span className="rounded-full bg-red-300/12 px-2 py-1 text-[10px] font-black uppercase text-red-200">
              Hidden
            </span>
          )}
          {report.isAnonymous ? (
            <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">
              Publicly anonymous
            </span>
          ) : null}
        </div>
        <time className="text-xs text-zinc-500">{formatDate(report.createdAt)}</time>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{report.body}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/8 pt-3 text-xs text-zinc-500">
        <span>Room: {report.roomCode ?? "none"}</span>
        <span>Player: {report.authorName ?? shortId(report.guestId)}</span>
        <span>Contact: {report.contactEmail ?? "none"}</span>
      </div>

      {report.isPublic ? (
        <form className="mt-4 grid gap-3 border-t border-white/8 pt-4" action={updateFeedback}>
          <input name="feedbackId" type="hidden" value={report.id} />
          <label className="grid gap-1.5 text-xs font-black text-zinc-300">
            Public status
            <select
              className="h-10 rounded-md border border-white/12 bg-[#11151b] px-3 text-sm text-white"
              defaultValue={report.publicStatus}
              name="status"
            >
              {FEEDBACK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatEnum(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-zinc-300">
            Creator response
            <textarea
              className="min-h-24 resize-y rounded-md border border-white/12 bg-black/24 px-3 py-2 text-sm font-medium leading-5 text-white"
              defaultValue={report.creatorReply ?? ""}
              maxLength={800}
              name="creatorReply"
              placeholder="Thank the player and explain what changed or what is planned."
            />
          </label>
          <button
            className="h-9 rounded-md bg-[var(--gold)] px-3 text-xs font-black text-black transition hover:brightness-105"
            name="operation"
            type="submit"
            value="save"
          >
            Save public update
          </button>

          {report.hiddenAt === null ? (
            <div className="grid gap-2 border-t border-white/8 pt-3 sm:grid-cols-[1fr_auto]">
              <select
                aria-label="Reason for hiding feedback"
                className="h-9 rounded-md border border-white/12 bg-[#11151b] px-3 text-xs text-white"
                defaultValue="SPAM"
                name="hiddenReason"
              >
                {FEEDBACK_HIDE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {formatEnum(reason)}
                  </option>
                ))}
              </select>
              <button
                className="h-9 rounded-md border border-red-300/20 bg-red-300/8 px-3 text-xs font-bold text-red-100 transition hover:bg-red-300/14"
                name="operation"
                type="submit"
                value="hide"
              >
                Hide policy violation
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3">
              <p className="text-xs text-zinc-500">
                Hidden for {formatEnum(report.hiddenReason ?? "OTHER_POLICY_VIOLATION")}
              </p>
              <button
                className="h-9 rounded-md border border-white/12 bg-white/8 px-3 text-xs font-bold transition hover:bg-white/14"
                name="operation"
                type="submit"
                value="restore"
              >
                Restore post
              </button>
            </div>
          )}
        </form>
      ) : null}
    </article>
  );
}

function EmptyQueue({ message }: { readonly message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-white/12 px-4 py-8 text-center text-sm text-zinc-500">
      {message}
    </p>
  );
}

async function updateReportStatus(formData: FormData) {
  "use server";

  const reportId = formData.get("reportId");
  const status = formData.get("status");

  if (typeof reportId !== "string" || !isPlayerReportStatus(status)) {
    return;
  }

  const session = await auth();

  if (session?.user === undefined) {
    return;
  }

  const profileId = createAuthProfileId(session.user.email ?? session.user.name ?? "unknown");
  const token = createAdminToken(profileId);

  if (token === null) {
    return;
  }

  await fetch(`${SERVER_URL}/admin/player-reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ status })
  });
  revalidatePath("/admin");
}

async function updateFeedback(formData: FormData) {
  "use server";

  const feedbackId = formData.get("feedbackId");
  const status = formData.get("status");
  const creatorReply = formData.get("creatorReply");
  const operation = formData.get("operation");
  const hiddenReason = formData.get("hiddenReason");

  if (
    typeof feedbackId !== "string" ||
    !isCommunityFeedbackStatus(status) ||
    typeof creatorReply !== "string" ||
    (operation !== "save" && operation !== "hide" && operation !== "restore") ||
    (operation === "hide" && !isCommunityFeedbackModerationReason(hiddenReason))
  ) {
    return;
  }

  const session = await auth();

  if (session?.user === undefined) {
    return;
  }

  const profileId = createAuthProfileId(session.user.email ?? session.user.name ?? "unknown");
  const token = createAdminToken(profileId);

  if (token === null) {
    return;
  }

  await fetch(`${SERVER_URL}/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      status,
      creatorReply,
      visibility: operation === "save" ? "preserve" : operation,
      hiddenReason: operation === "hide" ? hiddenReason : null
    })
  });

  revalidatePath("/admin");
  revalidatePath("/feedback");
}

async function fetchModerationQueue(profileId: string): Promise<ModerationLoadResult> {
  const token = createAdminToken(profileId);

  if (token === null) {
    return { state: "unavailable", queue: null };
  }

  try {
    const response = await fetch(`${SERVER_URL}/admin/moderation?limit=50`, {
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401 || response.status === 403) {
      return { state: "forbidden", queue: null };
    }

    if (!response.ok) {
      return { state: "unavailable", queue: null };
    }

    return { state: "ready", queue: (await response.json()) as AdminModerationQueue };
  } catch {
    return { state: "unavailable", queue: null };
  }
}

function createAdminToken(profileId: string): string | null {
  const secret = process.env.REALTIME_AUTH_SECRET?.trim();

  if (secret === undefined || secret.length < 32) {
    return null;
  }

  return createRealtimeAuthToken({ profileId }, secret, new Date(), 10 * 60);
}

function isPlayerReportStatus(value: FormDataEntryValue | null): value is PlayerReportStatus {
  return value === "REVIEWED" || value === "ACTIONED" || value === "DISMISSED";
}

function isCommunityFeedbackStatus(
  value: FormDataEntryValue | null
): value is CommunityFeedbackStatus {
  return value === "OPEN" || value === "PLANNED" || value === "IN_PROGRESS" || value === "FIXED";
}

function isCommunityFeedbackModerationReason(
  value: FormDataEntryValue | null
): value is CommunityFeedbackModerationReason {
  return (
    value === "SPAM" ||
    value === "HARASSMENT" ||
    value === "HATE_SPEECH" ||
    value === "PERSONAL_INFORMATION" ||
    value === "OTHER_POLICY_VIOLATION"
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatEnum(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function shortId(value: string | null): string {
  if (value === null) {
    return "unknown";
  }

  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-5)}`;
}
