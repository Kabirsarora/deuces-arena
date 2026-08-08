import { describe, expect, it } from "vitest";

import {
  calculatePlacementRatingChanges,
  getRankProgress,
  getRankTier,
  getRankedCoinBonus
} from "./rating.js";

describe("placement rating", () => {
  it("awards placement-based rating changes for four-player results", () => {
    expect(
      calculatePlacementRatingChanges([
        {
          playerId: "player-1",
          ratingBefore: 1000,
          placement: 1
        },
        {
          playerId: "player-2",
          ratingBefore: 1000,
          placement: 2
        },
        {
          playerId: "player-3",
          ratingBefore: 1000,
          placement: 3
        },
        {
          playerId: "player-4",
          ratingBefore: 1000,
          placement: 4
        }
      ])
    ).toEqual([
      {
        playerId: "player-1",
        ratingBefore: 1000,
        placement: 1,
        ratingDelta: 24,
        ratingAfter: 1024
      },
      {
        playerId: "player-2",
        ratingBefore: 1000,
        placement: 2,
        ratingDelta: 6,
        ratingAfter: 1006
      },
      {
        playerId: "player-3",
        ratingBefore: 1000,
        placement: 3,
        ratingDelta: -8,
        ratingAfter: 992
      },
      {
        playerId: "player-4",
        ratingBefore: 1000,
        placement: 4,
        ratingDelta: -22,
        ratingAfter: 978
      }
    ]);
  });

  it("does not allow ratings below zero", () => {
    expect(
      calculatePlacementRatingChanges([
        {
          playerId: "player-1",
          ratingBefore: 10,
          placement: 4
        },
        {
          playerId: "player-2",
          ratingBefore: 10,
          placement: 3
        },
        {
          playerId: "player-3",
          ratingBefore: 10,
          placement: 2
        },
        {
          playerId: "player-4",
          ratingBefore: 10,
          placement: 1
        }
      ])[0]
    ).toMatchObject({
      playerId: "player-1",
      ratingAfter: 0
    });
  });

  it("requires exactly four unique placements", () => {
    expect(() =>
      calculatePlacementRatingChanges([
        {
          playerId: "player-1",
          ratingBefore: 1000,
          placement: 1
        },
        {
          playerId: "player-2",
          ratingBefore: 1000,
          placement: 1
        },
        {
          playerId: "player-3",
          ratingBefore: 1000,
          placement: 3
        },
        {
          playerId: "player-4",
          ratingBefore: 1000,
          placement: 4
        }
      ])
    ).toThrow("Rating changes require unique placements from 1 through 4.");
  });

  it("maps rating boundaries to named tiers", () => {
    expect(getRankTier(899).name).toBe("Bronze");
    expect(getRankTier(900).name).toBe("Silver");
    expect(getRankTier(1100).name).toBe("Gold");
    expect(getRankTier(1500).name).toBe("Diamond");
    expect(getRankTier(2100).name).toBe("Arena Master");
  });

  it("reports progress toward the next tier", () => {
    expect(getRankProgress(1000)).toMatchObject({
      tier: { id: "silver" },
      nextTier: { id: "gold" },
      ratingNeededForNextTier: 100,
      progress: 0.5
    });
    expect(getRankProgress(1800)).toMatchObject({
      tier: { id: "arena-master" },
      nextTier: null,
      ratingNeededForNextTier: null,
      progress: 1
    });
  });

  it("awards placement-based ranked coin bonuses", () => {
    expect([1, 2, 3, 4].map((placement) => getRankedCoinBonus(placement as 1 | 2 | 3 | 4))).toEqual(
      [60, 35, 20, 10]
    );
  });
});
