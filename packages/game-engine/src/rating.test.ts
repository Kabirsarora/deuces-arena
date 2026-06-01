import { describe, expect, it } from "vitest";

import { calculatePlacementRatingChanges } from "./rating.js";

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
});
