import { createMobileAuthHandoffToken } from "@deuces-arena/shared";
import { CheckCircle2, ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { SignInWithGoogleButton } from "@/components/auth-buttons";
import { createAuthProfileId } from "@/lib/auth-profile";

export const metadata: Metadata = {
  title: "Connect Mobile App | Deuces Arena",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function MobileConnectPage() {
  const session = await auth();
  const realtimeAuthSecret = process.env.REALTIME_AUTH_SECRET?.trim();

  if (session?.user === undefined) {
    return (
      <MobileConnectShell>
        <Smartphone className="mx-auto size-10 text-[var(--gold)]" />
        <p className="mt-5 text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
        <h1 className="mt-2 text-3xl font-black">Connect the mobile app</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-400">
          Sign in with the same Google account you use on the website. Your rating, coins,
          cosmetics, and match history will carry over.
        </p>
        <SignInWithGoogleButton callbackUrl="/mobile-connect" className="mt-6 h-12 w-full" />
      </MobileConnectShell>
    );
  }

  if (realtimeAuthSecret === undefined || realtimeAuthSecret === "") {
    return (
      <MobileConnectShell>
        <p className="text-xs font-black uppercase text-red-300">Temporarily unavailable</p>
        <h1 className="mt-2 text-2xl font-black">Mobile connection is not configured</h1>
        <p className="mt-3 text-sm text-zinc-400">Your website account is still safe.</p>
      </MobileConnectShell>
    );
  }

  const profileId = createAuthProfileId(session.user.email ?? session.user.name ?? "unknown");
  const handoff = createMobileAuthHandoffToken({ profileId }, realtimeAuthSecret);
  const callback = new URL("deucesarena://auth");
  callback.searchParams.set("handoff", handoff);
  if (session.user.name !== null && session.user.name !== undefined) {
    callback.searchParams.set("name", session.user.name);
  }
  if (session.user.image !== null && session.user.image !== undefined) {
    callback.searchParams.set("image", session.user.image);
  }

  return (
    <MobileConnectShell>
      <CheckCircle2 className="mx-auto size-10 text-emerald-300" />
      <p className="mt-5 text-xs font-black uppercase text-[var(--aqua)]">Account ready</p>
      <h1 className="mt-2 text-3xl font-black">Finish in Deuces Arena</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-400">
        Signed in as {session.user.email ?? session.user.name ?? "your Google account"}.
      </p>
      <a
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--gold)] px-4 text-sm font-black text-zinc-950 transition hover:brightness-105"
        href={callback.toString()}
      >
        <Smartphone className="size-4" />
        Open Deuces Arena
      </a>
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
        <ShieldCheck className="size-4" />
        This connection expires in two minutes.
      </div>
    </MobileConnectShell>
  );
}

function MobileConnectShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 text-white">
      <section className="online-panel w-full max-w-md p-6 text-center">
        {children}
        <Link
          className="mt-5 inline-flex text-xs font-bold text-zinc-500 transition hover:text-white"
          href="/"
        >
          Return to the website
        </Link>
      </section>
    </main>
  );
}
