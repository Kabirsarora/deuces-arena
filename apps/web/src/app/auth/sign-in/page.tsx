import Link from "next/link";

import { SignInWithGoogleButton } from "@/components/auth-buttons";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 text-white">
      <section className="online-panel w-full max-w-md p-6 text-center">
        <p className="text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
        <h1 className="mt-2 text-3xl font-black">Sign in</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Use Google to keep your profile, ranked rating, match history, and cosmetics across
          devices.
        </p>

        <SignInWithGoogleButton className="mt-6 h-12 w-full" />

        <Link
          className="mt-4 inline-flex text-sm font-bold text-zinc-400 transition hover:text-white"
          href="/"
        >
          Continue as guest
        </Link>

        <p className="mt-5 text-xs leading-5 text-zinc-500">
          By signing in, you agree to the{" "}
          <Link className="font-bold underline hover:text-white" href="/terms">
            Terms
          </Link>{" "}
          and acknowledge the{" "}
          <Link className="font-bold underline hover:text-white" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
