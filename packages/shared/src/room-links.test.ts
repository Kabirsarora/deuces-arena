import { describe, expect, it } from "vitest";

import { createRoomInviteUrl, isValidRoomCode, normalizeRoomCode } from "./room-links.js";

describe("room invitation links", () => {
  it("normalizes pasted room codes", () => {
    expect(normalizeRoomCode("  ab-c 12 ")).toBe("ABC12");
  });

  it("accepts supported room codes and rejects malformed input", () => {
    expect(isValidRoomCode("ABC123")).toBe(true);
    expect(isValidRoomCode("abc1")).toBe(false);
    expect(isValidRoomCode("abc")).toBe(false);
    expect(isValidRoomCode("not a room code")).toBe(false);
  });

  it("creates a canonical web fallback URL", () => {
    expect(createRoomInviteUrl("https://deucesarena.com/", " abc123 ")).toBe(
      "https://deucesarena.com/join/ABC123"
    );
  });

  it("rejects unsafe origins", () => {
    expect(() => createRoomInviteUrl("javascript:alert(1)", "ABC123")).toThrow("HTTP or HTTPS");
  });
});
