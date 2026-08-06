import { createHmac, timingSafeEqual } from "node:crypto";

export type RealtimeAuthIdentity = {
  readonly profileId: string;
};

type RealtimeAuthPayload = {
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
};

const DEFAULT_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const AUTH_PROFILE_PATTERN = /^auth-[a-f0-9]{32}$/;

export function createRealtimeAuthToken(
  identity: RealtimeAuthIdentity,
  secret: string,
  now = new Date(),
  ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS
): string {
  assertValidSecret(secret);

  if (!AUTH_PROFILE_PATTERN.test(identity.profileId)) {
    throw new Error("Realtime auth requires a valid account profile ID.");
  }

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Realtime auth token lifetime must be a positive number of seconds.");
  }

  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: RealtimeAuthPayload = {
    sub: identity.profileId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`;
}

export function verifyRealtimeAuthToken(
  token: string,
  secret: string,
  now = new Date()
): RealtimeAuthIdentity | null {
  if (secret.length < 32) {
    return null;
  }

  const [encodedPayload, suppliedSignature, extraSegment] = token.split(".");

  if (
    encodedPayload === undefined ||
    encodedPayload === "" ||
    suppliedSignature === undefined ||
    suppliedSignature === "" ||
    extraSegment !== undefined
  ) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<RealtimeAuthPayload>;
    const currentTime = Math.floor(now.getTime() / 1000);

    if (
      typeof payload.sub !== "string" ||
      !AUTH_PROFILE_PATTERN.test(payload.sub) ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.iat > currentTime + 60 ||
      payload.exp <= currentTime ||
      payload.exp <= payload.iat
    ) {
      return null;
    }

    return {
      profileId: payload.sub
    };
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function assertValidSecret(secret: string): void {
  if (secret.length < 32) {
    throw new Error("REALTIME_AUTH_SECRET must contain at least 32 characters.");
  }
}
