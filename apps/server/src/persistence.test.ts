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

  it("unlocks progression cosmetics across games and wins", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 10, wins: 5 })).toEqual([
      "classic-red-card-back",
      "midnight-felt-table",
      "aqua-pulse-avatar",
      "lagoon-table",
      "neon-grid-card-back",
      "aqua-profile-border"
    ]);

    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 25, wins: 20 })).toEqual([
      "classic-red-card-back",
      "midnight-felt-table",
      "aqua-pulse-avatar",
      "lagoon-table",
      "neon-grid-card-back",
      "aqua-profile-border",
      "crown-chip-avatar",
      "obsidian-table",
      "ember-court-card-back"
    ]);
  });
});
