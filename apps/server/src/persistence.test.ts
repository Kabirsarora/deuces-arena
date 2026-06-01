import { describe, expect, it } from "vitest";

import { getEarnedCosmeticUnlockSlugs } from "./persistence.js";

describe("cosmetic progression rules", () => {
  it("does not unlock cosmetics before a completed match", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 0, wins: 0 })).toEqual([]);
  });

  it("unlocks the starter card back after one completed match", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 1, wins: 0 })).toEqual([
      "classic-red-card-back"
    ]);
  });

  it("unlocks the table theme after the first win", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 1, wins: 1 })).toEqual([
      "classic-red-card-back",
      "midnight-felt-table"
    ]);
  });
});
