import { describe, expect, it } from "vitest";

import { getEarnedCosmeticUnlockSlugs } from "./persistence.js";

describe("cosmetic progression rules", () => {
  it("does not unlock cosmetics before a completed match", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 0, wins: 0, rating: 1000 })).toEqual([]);
  });

  it("unlocks the starter card back after one completed match", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 1, wins: 0, rating: 1000 })).toEqual([
      "classic-red-card-back"
    ]);
  });

  it("unlocks the table theme after the first win", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 1, wins: 1, rating: 1000 })).toEqual([
      "classic-red-card-back",
      "midnight-felt-table"
    ]);
  });

  it("unlocks progression cosmetics across games and wins", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 20, wins: 8, rating: 1000 })).toEqual([
      "classic-red-card-back",
      "midnight-felt-table",
      "aqua-pulse-avatar",
      "lagoon-table",
      "neon-grid-card-back"
    ]);

    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 50, wins: 25, rating: 1000 })).toEqual([
      "classic-red-card-back",
      "midnight-felt-table",
      "aqua-pulse-avatar",
      "lagoon-table",
      "neon-grid-card-back",
      "aqua-profile-border",
      "crown-chip-avatar",
      "ember-court-card-back"
    ]);

    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 75, wins: 75, rating: 1000 })).toEqual([
      "classic-red-card-back",
      "midnight-felt-table",
      "aqua-pulse-avatar",
      "lagoon-table",
      "neon-grid-card-back",
      "aqua-profile-border",
      "crown-chip-avatar",
      "obsidian-table",
      "ember-court-card-back",
      "arena-six-crest-card-back"
    ]);
  });

  it("unlocks ranked borders at rating thresholds", () => {
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 2, wins: 1, rating: 1500 })).toContain(
      "diamond-division-border"
    );
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 2, wins: 1, rating: 1799 })).not.toContain(
      "arena-master-border"
    );
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 2, wins: 1, rating: 1800 })).toContain(
      "arena-master-border"
    );
  });
});
