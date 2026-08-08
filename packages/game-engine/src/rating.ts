export type RatedPlayerResult = {
  readonly playerId: string;
  readonly ratingBefore: number;
  readonly placement: 1 | 2 | 3 | 4;
};

export type RatingChange = RatedPlayerResult & {
  readonly ratingDelta: number;
  readonly ratingAfter: number;
};

export type RankTierId = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "arena-master";

export type RankTier = {
  readonly id: RankTierId;
  readonly name: string;
  readonly minimumRating: number;
};

export type RankProgress = {
  readonly tier: RankTier;
  readonly nextTier: RankTier | null;
  readonly ratingIntoTier: number;
  readonly ratingNeededForNextTier: number | null;
  readonly progress: number;
};

export const RANK_TIERS: readonly RankTier[] = [
  { id: "bronze", name: "Bronze", minimumRating: 0 },
  { id: "silver", name: "Silver", minimumRating: 900 },
  { id: "gold", name: "Gold", minimumRating: 1100 },
  { id: "platinum", name: "Platinum", minimumRating: 1300 },
  { id: "diamond", name: "Diamond", minimumRating: 1500 },
  { id: "arena-master", name: "Arena Master", minimumRating: 1800 }
];

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

export function getRankTier(rating: number): RankTier {
  const normalizedRating = Math.max(0, Math.floor(rating));

  return (
    [...RANK_TIERS].reverse().find((tier) => normalizedRating >= tier.minimumRating) ??
    RANK_TIERS[0]!
  );
}

export function getRankProgress(rating: number): RankProgress {
  const normalizedRating = Math.max(0, Math.floor(rating));
  const tier = getRankTier(normalizedRating);
  const tierIndex = RANK_TIERS.findIndex((candidate) => candidate.id === tier.id);
  const nextTier = RANK_TIERS[tierIndex + 1] ?? null;
  const ratingIntoTier = normalizedRating - tier.minimumRating;
  const ratingNeededForNextTier =
    nextTier === null ? null : nextTier.minimumRating - normalizedRating;
  const tierSpan = nextTier === null ? null : nextTier.minimumRating - tier.minimumRating;

  return {
    tier,
    nextTier,
    ratingIntoTier,
    ratingNeededForNextTier,
    progress: tierSpan === null ? 1 : Math.min(1, Math.max(0, ratingIntoTier / tierSpan))
  };
}

export function getRankedCoinBonus(placement: RatedPlayerResult["placement"]): number {
  if (placement === 1) {
    return 60;
  }

  if (placement === 2) {
    return 35;
  }

  if (placement === 3) {
    return 20;
  }

  return 10;
}
