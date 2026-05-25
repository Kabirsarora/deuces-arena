import { compareCards, compareRanks, type Card } from "./cards.js";
import {
  detectHand,
  getHandPrimaryStrength,
  type HandAnalysis,
  type HandDetectionResult
} from "./hands.js";

export type HandComparisonResult =
  | {
      readonly result: "higher" | "lower" | "equal";
    }
  | {
      readonly result: "not-comparable";
      readonly reason: string;
    };

export function compareHands(left: HandAnalysis, right: HandAnalysis): HandComparisonResult {
  if (left.type === "bomb" || right.type === "bomb") {
    return compareBombAwareHands(left, right);
  }

  if (left.type !== right.type) {
    return {
      result: "not-comparable",
      reason: "Non-bomb hands must have the same hand type."
    };
  }

  if (left.type === "straight" && right.type === "straight" && left.length !== right.length) {
    return {
      result: "not-comparable",
      reason: "Straights must have the same length."
    };
  }

  return compareSameFamilyHands(left, right);
}

export function canBeat(candidateCards: readonly Card[], currentCards: readonly Card[]): boolean {
  const candidate = detectHand(candidateCards);
  const current = detectHand(currentCards);

  if (candidate.type === "invalid" || current.type === "invalid") {
    return false;
  }

  return compareHands(candidate, current).result === "higher";
}

export function assertValidHand(hand: HandDetectionResult): asserts hand is HandAnalysis {
  if (hand.type === "invalid") {
    throw new Error(hand.reason);
  }
}

function compareBombAwareHands(left: HandAnalysis, right: HandAnalysis): HandComparisonResult {
  if (left.type === "bomb" && right.type !== "bomb") {
    return {
      result: "higher"
    };
  }

  if (left.type !== "bomb" && right.type === "bomb") {
    return {
      result: "lower"
    };
  }

  if (left.type === "bomb" && right.type === "bomb") {
    const rankComparison = compareRanks(left.quadRank, right.quadRank);

    if (rankComparison > 0) {
      return {
        result: "higher"
      };
    }

    if (rankComparison < 0) {
      return {
        result: "lower"
      };
    }

    return {
      result: "equal"
    };
  }

  return {
    result: "not-comparable",
    reason: "Unable to compare bomb-aware hands."
  };
}

function compareSameFamilyHands(left: HandAnalysis, right: HandAnalysis): HandComparisonResult {
  const strengthComparison = getHandPrimaryStrength(left) - getHandPrimaryStrength(right);

  if (strengthComparison > 0) {
    return {
      result: "higher"
    };
  }

  if (strengthComparison < 0) {
    return {
      result: "lower"
    };
  }

  const cardComparison = compareCards(left.highestCard, right.highestCard);

  if (cardComparison > 0) {
    return {
      result: "higher"
    };
  }

  if (cardComparison < 0) {
    return {
      result: "lower"
    };
  }

  return {
    result: "equal"
  };
}
