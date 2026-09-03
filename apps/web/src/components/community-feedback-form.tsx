"use client";

import { Send, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { submitCommunityFeedback, type CommunityFeedbackFormState } from "@/app/feedback/actions";
import { Button } from "@/components/ui/button";

const INITIAL_FORM_STATE: CommunityFeedbackFormState = {
  state: "idle",
  message: "",
  submissionId: null
};

const FEEDBACK_TYPES = [
  { value: "IDEA", label: "Idea" },
  { value: "BUG", label: "Bug" },
  { value: "UI", label: "Design" },
  { value: "BALANCE", label: "Balance" },
  { value: "PRAISE", label: "Something good" }
] as const;

export function CommunityFeedbackForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, formAction, pending] = useActionState(submitCommunityFeedback, INITIAL_FORM_STATE);

  useEffect(() => {
    if (result.state === "success") {
      formRef.current?.reset();
    }
  }, [result]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <label className="grid gap-2 text-sm font-black">
        Feedback type
        <select
          className="h-11 rounded-md border border-white/12 bg-[#11151b] px-3 text-sm font-semibold text-white outline-none focus:border-[var(--gold)]"
          defaultValue="IDEA"
          name="kind"
        >
          {FEEDBACK_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-black">
        What should we know?
        <textarea
          className="min-h-36 resize-y rounded-md border border-white/12 bg-black/25 px-3 py-3 text-sm font-medium leading-6 text-white outline-none placeholder:text-zinc-500 focus:border-[var(--gold)]"
          maxLength={800}
          minLength={6}
          name="body"
          placeholder="Share an idea, report a problem, or tell us what worked well."
          required
        />
      </label>

      <label className="flex items-start gap-3 rounded-md border border-white/10 bg-white/5 p-3 text-sm leading-5 text-zinc-300">
        <input
          className="mt-1 size-4 accent-[var(--gold)]"
          name="publicConsent"
          required
          type="checkbox"
        />
        <span>I understand this post and my Deuces Arena display name will be public.</span>
      </label>

      <Button className="w-full" disabled={pending} type="submit">
        <Send className="size-4" />
        {pending ? "Posting..." : "Post to community"}
      </Button>

      {result.state === "idle" ? null : (
        <p
          className={
            result.state === "success"
              ? "flex items-center gap-2 text-sm font-bold text-emerald-200"
              : "text-sm font-bold text-red-200"
          }
          role="status"
        >
          {result.state === "success" ? <ShieldCheck className="size-4" /> : null}
          {result.message}
        </p>
      )}
    </form>
  );
}
