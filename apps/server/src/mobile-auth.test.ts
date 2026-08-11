import {
  createMobileAuthHandoffToken,
  createRealtimeAuthToken,
  verifyRealtimeAuthToken
} from "@deuces-arena/shared";
import { describe, expect, it } from "vitest";

import { createMobileAuthService } from "./mobile-auth.js";

const SECRET = "mobile-auth-test-secret-with-at-least-32-characters";
const IDENTITY = { profileId: "auth-0123456789abcdef0123456789abcdef" };
const NOW = new Date("2026-08-10T20:00:00.000Z");

describe("mobile account authentication", () => {
  it("exchanges a short account handoff for a signed mobile session", () => {
    const handoff = createMobileAuthHandoffToken(IDENTITY, SECRET, NOW);
    const result = createMobileAuthService(SECRET).exchange(handoff, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.profileId).toBe(IDENTITY.profileId);
    expect(verifyRealtimeAuthToken(result.session.token, SECRET, NOW)).toEqual(IDENTITY);
    expect(new Date(result.session.expiresAt).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("does not accept an ordinary realtime session as a mobile handoff", () => {
    const realtimeToken = createRealtimeAuthToken(IDENTITY, SECRET, NOW);

    expect(createMobileAuthService(SECRET).exchange(realtimeToken, NOW)).toMatchObject({
      ok: false,
      reason: "invalid-token"
    });
  });

  it("rejects expired and malformed handoffs", () => {
    const handoff = createMobileAuthHandoffToken(IDENTITY, SECRET, NOW, 60);
    const service = createMobileAuthService(SECRET);

    expect(service.exchange(null, NOW)).toMatchObject({
      ok: false,
      reason: "invalid-request"
    });
    expect(service.exchange(handoff, new Date(NOW.getTime() + 61_000))).toMatchObject({
      ok: false,
      reason: "invalid-token"
    });
  });

  it("reports unavailable server configuration", () => {
    expect(createMobileAuthService(null).exchange("handoff", NOW)).toMatchObject({
      ok: false,
      reason: "not-configured"
    });
  });
});
