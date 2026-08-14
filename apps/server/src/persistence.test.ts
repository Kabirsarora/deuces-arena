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
      "ember-court-card-back",
      "pool-shark-card-back"
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
      "pool-shark-card-back",
      "koi-current-card-back",
      "blackberry-bandit-avatar",
      "koi-garden-table",
      "bengal-bloom-card-back",
      "arena-six-crest-card-back"
    ]);

    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 200, wins: 200, rating: 1000 })).toEqual(
      expect.arrayContaining([
        "celestial-vault-card-back",
        "celestial-observatory-table",
        "ember-sovereign-card-back",
        "voidglass-prism-card-back",
        "ember-throne-table",
        "jungle-club-table"
      ])
    );
    expect(
      getEarnedCosmeticUnlockSlugs({ gamesPlayed: 199, wins: 199, rating: 1000 })
    ).not.toContain("ember-throne-table");
    expect(
      getEarnedCosmeticUnlockSlugs({ gamesPlayed: 225, wins: 224, rating: 1000 })
    ).not.toContain("ember-regent-avatar");
    expect(getEarnedCosmeticUnlockSlugs({ gamesPlayed: 225, wins: 225, rating: 1000 })).toContain(
      "ember-regent-avatar"
    );
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
