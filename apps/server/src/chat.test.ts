import { describe, expect, it } from "vitest";

import { sanitizeChatMessage } from "./chat.js";

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
});
