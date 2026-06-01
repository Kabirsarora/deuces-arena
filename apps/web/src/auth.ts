import NextAuth, { type NextAuthResult } from "next-auth";
import Google from "next-auth/providers/google";

const authSecret =
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "deuces-arena-local-dev-secret");

const nextAuth: NextAuthResult = NextAuth({
  providers: [Google({})],
  pages: {
    signIn: "/auth/sign-in"
  },
  ...(authSecret === undefined ? {} : { secret: authSecret }),
  trustHost: true
});

export const auth: NextAuthResult["auth"] = nextAuth.auth;
export const handlers: NextAuthResult["handlers"] = nextAuth.handlers;
export const signIn: NextAuthResult["signIn"] = nextAuth.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuth.signOut;
