"use client";

import { useState } from "react";

export function CopyMatchSummaryButton({ summary }: { readonly summary: string }) {
  const [copied, setCopied] = useState(false);

  async function copySummary() {
    await navigator.clipboard?.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-[10px] font-black uppercase text-zinc-300 transition hover:border-white/20 hover:bg-white/12"
      type="button"
      onClick={() => void copySummary()}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
