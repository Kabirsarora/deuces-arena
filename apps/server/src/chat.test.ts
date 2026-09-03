import { describe, expect, it } from "vitest";

import { moderateCommunityText, sanitizeChatMessage } from "./chat.js";

describe("sanitizeChatMessage", () => {
  it("returns null for empty messages", () => {
    expect(sanitizeChatMessage("")).toBeNull();
    expect(sanitizeChatMessage("     \n\t  ")).toBeNull();
  });

  it("normalizes repeated whitespace", () => {
    expect(sanitizeChatMessage("hello     table\nplayers")).toBe("hello table players");
  });

  it("caps messages at 240 characters", () => {
    expect(sanitizeChatMessage("a".repeat(260))).toHaveLength(240);
  });

  it("masks blocked words without masking partial words", () => {
    expect(sanitizeChatMessage("That shit was wild, but classic is fine.")).toBe(
      "That **** was wild, but classic is fine."
    );
  });

  it("masks mixed-case and punctuation-separated profanity", () => {
    expect(sanitizeChatMessage("F.U.C.K this and stop being a b!tch")).toBe(
      "**** this and stop being a ****"
    );
  });

  it("preserves ordinary words and emoji", () => {
    expect(sanitizeChatMessage("Classic table, nice move! 🎉")).toBe(
      "Classic table, nice move! 🎉"
    );
  });
});

describe("moderateCommunityText", () => {
  it("masks profanity in community posts", () => {
    expect(moderateCommunityText("This part is shit but the rest is useful.")).toEqual({
      accepted: true,
      body: "This part is **** but the rest is useful."
    });
  });

  it("rejects threats and targeted hateful language", () => {
    expect(moderateCommunityText("I will hurt you")).toEqual({ accepted: false });
    expect(moderateCommunityText("k.y.s")).toEqual({ accepted: false });
    expect(moderateCommunityText("You are a n1gger")).toEqual({ accepted: false });
  });

  it("keeps constructive criticism", () => {
    expect(moderateCommunityText("The turn indicator is confusing on mobile.")).toEqual({
      accepted: true,
      body: "The turn indicator is confusing on mobile."
    });
  });
});
