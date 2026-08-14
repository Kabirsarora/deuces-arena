"use client";

import { LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignInWithGoogleButton({
  className,
  compactOnMobile = false,
  callbackUrl = "/"
}: {
  readonly className?: string;
  readonly compactOnMobile?: boolean;
  readonly callbackUrl?: string;
}) {
  return (
    <Button
      aria-label="Sign in with Google"
      className={className}
      type="button"
      onClick={() => {
        void signIn("google", { callbackUrl });
      }}
    >
      <span className="grid size-5 place-items-center rounded-full bg-white text-xs font-black text-zinc-950">
        G
      </span>
      <span className={compactOnMobile ? "hidden min-[430px]:inline" : undefined}>
        Sign in with Google
      </span>
    </Button>
  );
}

export function SignOutButton({ className }: { readonly className?: string }) {
  return (
    <Button
      className={className}
      type="button"
      variant="secondary"
      onClick={() => {
        void signOut({ callbackUrl: "/" });
      }}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
