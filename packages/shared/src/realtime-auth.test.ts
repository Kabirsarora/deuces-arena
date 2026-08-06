import { describe, expect, it } from "vitest";

import { createRealtimeAuthToken, verifyRealtimeAuthToken } from "./realtime-auth.js";

const SECRET = "test-realtime-auth-secret-with-at-least-32-characters";
const IDENTITY = {
  profileId: "auth-0123456789abcdef0123456789abcdef"
} as const;
const NOW = new Date("2026-08-06T20:00:00.000Z");

describe("realtime authentication tokens", () => {
  it("round trips a signed account identity", () => {
    const token = createRealtimeAuthToken(IDENTITY, SECRET, NOW);

    expect(verifyRealtimeAuthToken(token, SECRET, NOW)).toEqual(IDENTITY);
  });

  it("rejects tampered signatures", () => {
    const token = createRealtimeAuthToken(IDENTITY, SECRET, NOW);

    expect(verifyRealtimeAuthToken(`${token}x`, SECRET, NOW)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = createRealtimeAuthToken(IDENTITY, SECRET, NOW, 60);
    const afterExpiry = new Date(NOW.getTime() + 61_000);

    expect(verifyRealtimeAuthToken(token, SECRET, afterExpiry)).toBeNull();
  });
});
