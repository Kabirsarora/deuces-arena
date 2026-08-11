import { createRealtimeAuthToken, verifyMobileAuthHandoffToken } from "@deuces-arena/shared";

const MOBILE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_HANDOFF_TOKEN_LENGTH = 4_096;

export type MobileAccountSession = {
  readonly token: string;
  readonly expiresAt: string;
  readonly profileId: string;
};

export type MobileAuthResult =
  | { readonly ok: true; readonly session: MobileAccountSession }
  | {
      readonly ok: false;
      readonly reason: "not-configured" | "invalid-request" | "invalid-token";
      readonly message: string;
    };

export function createMobileAuthService(realtimeAuthSecret: string | null) {
  return {
    exchange(handoffToken: unknown, now = new Date()): MobileAuthResult {
      if (realtimeAuthSecret === null) {
        return {
          ok: false,
          reason: "not-configured",
          message: "Mobile account sign-in is not configured on this server."
        };
      }

      if (
        typeof handoffToken !== "string" ||
        handoffToken.trim() === "" ||
        handoffToken.length > MAX_HANDOFF_TOKEN_LENGTH
      ) {
        return {
          ok: false,
          reason: "invalid-request",
          message: "A valid account handoff is required."
        };
      }

      const identity = verifyMobileAuthHandoffToken(handoffToken, realtimeAuthSecret, now);

      if (identity === null) {
        return {
          ok: false,
          reason: "invalid-token",
          message: "This account handoff is invalid or expired."
        };
      }

      const expiresAt = new Date(now.getTime() + MOBILE_SESSION_TTL_SECONDS * 1_000);
      return {
        ok: true,
        session: {
          token: createRealtimeAuthToken(
            identity,
            realtimeAuthSecret,
            now,
            MOBILE_SESSION_TTL_SECONDS
          ),
          expiresAt: expiresAt.toISOString(),
          profileId: identity.profileId
        }
      };
    }
  };
}
