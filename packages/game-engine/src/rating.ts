export type RatedPlayerResult = {
  readonly playerId: string;
  readonly ratingBefore: number;
  readonly placement: 1 | 2 | 3 | 4;
};

export type RatingChange = RatedPlayerResult & {
  readonly ratingDelta: number;
  readonly ratingAfter: number;
};

const PLACEMENT_DELTAS: Readonly<Record<RatedPlayerResult["placement"], number>> = {
  1: 24,
  2: 6,
  3: -8,
  4: -22
};

export function calculatePlacementRatingChanges(
  results: readonly RatedPlayerResult[]
): readonly RatingChange[] {
  if (results.length !== 4) {
    throw new Error("Rating changes require exactly 4 player results.");
  }

  const placements = new Set(results.map((result) => result.placement));

  if (placements.size !== 4) {
    throw new Error("Rating changes require unique placements from 1 through 4.");
  }

  return results.map((result) => {
    const ratingDelta = PLACEMENT_DELTAS[result.placement];

    return {
      ...result,
      ratingDelta,
      ratingAfter: Math.max(0, result.ratingBefore + ratingDelta)
    };
  });
}
