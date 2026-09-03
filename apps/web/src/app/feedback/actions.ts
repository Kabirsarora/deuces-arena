"use server";

import { createRealtimeAuthToken, type FeedbackKind } from "@deuces-arena/shared";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { createAuthProfileId } from "@/lib/auth-profile";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

export type CommunityFeedbackFormState = {
  readonly state: "idle" | "success" | "error";
  readonly message: string;
  readonly submissionId: string | null;
};

export async function submitCommunityFeedback(
  _previousState: CommunityFeedbackFormState,
  formData: FormData
): Promise<CommunityFeedbackFormState> {
  const session = await auth();

  if (session?.user === undefined) {
    return formError("Sign in with Google before posting publicly.");
  }

  const kind = normalizeFeedbackKind(formData.get("kind"));
  const body = formData.get("body");

  if (kind === null || typeof body !== "string" || body.trim().length < 6) {
    return formError("Write at least 6 characters and choose a feedback type.");
  }

  if (body.trim().length > 800) {
    return formError("Keep feedback under 800 characters.");
  }

  if (formData.get("publicConsent") !== "on") {
    return formError("Confirm that you understand this post will be public.");
  }

  const secret = process.env.REALTIME_AUTH_SECRET?.trim();

  if (secret === undefined || secret.length < 32) {
    return formError("Community feedback is temporarily unavailable.");
  }

  const profileId = createAuthProfileId(session.user.email ?? session.user.name ?? "unknown");
  const token = createRealtimeAuthToken({ profileId }, secret, new Date(), 5 * 60);

  try {
    const response = await fetch(`${SERVER_URL}/community-feedback`, {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ kind, body: body.trim() })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        readonly error?: string;
      } | null;
      return formError(payload?.error ?? "Community feedback could not be posted right now.");
    }

    const receipt = (await response.json()) as { readonly id: string };
    revalidatePath("/feedback");

    return {
      state: "success",
      message: "Your feedback is now on the community board.",
      submissionId: receipt.id
    };
  } catch {
    return formError("The realtime service could not be reached. Please try again shortly.");
  }
}

function normalizeFeedbackKind(value: FormDataEntryValue | null): FeedbackKind | null {
  if (
    value === "BUG" ||
    value === "IDEA" ||
    value === "BALANCE" ||
    value === "UI" ||
    value === "PRAISE"
  ) {
    return value;
  }

  return null;
}

function formError(message: string): CommunityFeedbackFormState {
  return {
    state: "error",
    message,
    submissionId: null
  };
}
