import { compareCards, getRankStrength, type Card } from "./cards.js";
import { detectHand, type HandAnalysis } from "./hands.js";
import { generateLegalMoves } from "./legal-moves.js";
import type { Move, MoveValidationContext, PlayMove } from "./moves.js";

export type BotStrategy = "random-legal" | "lowest-legal" | "simple-heuristic";

export type BotDecisionInput = {
  readonly hand: readonly Card[];
  readonly context: MoveValidationContext;
  readonly strategy?: BotStrategy;
  readonly random?: () => number;
};

export type BotDecision = {
  readonly move: Move;
  readonly legalMoveCount: number;
  readonly strategy: BotStrategy;
};

export function chooseBotMove(input: BotDecisionInput): BotDecision {
  const strategy = input.strategy ?? "random-legal";
  const legalMoves = generateLegalMoves(input.hand, input.context);

  if (legalMoves.length === 0) {
    return {
      move: {
        type: "pass"
      },
      legalMoveCount: 0,
      strategy
    };
  }

  if (strategy === "lowest-legal") {
    return {
      move: chooseLowestLegalMove(legalMoves),
      legalMoveCount: legalMoves.length,
      strategy
    };
  }

  if (strategy === "simple-heuristic") {
    return {
      move: chooseSimpleHeuristicMove(legalMoves, input.context, input.hand),
      legalMoveCount: legalMoves.length,
      strategy
    };
  }

  return {
    move: chooseRandomMove(legalMoves, input.random ?? Math.random),
    legalMoveCount: legalMoves.length,
    strategy
  };
}

function chooseRandomMove(moves: readonly Move[], random: () => number): Move {
  const index = Math.min(Math.floor(random() * moves.length), moves.length - 1);
  return (
    moves[index] ?? {
      type: "pass"
    }
  );
}

function chooseLowestLegalMove(moves: readonly Move[]): Move {
  const playMoves = moves.filter((move): move is PlayMove => move.type === "play");
  const passMove = moves.find((move) => move.type === "pass");

  if (playMoves.length === 0) {
    return {
      type: "pass"
    };
  }

  const nonBombMoves = playMoves.filter((move) => detectPlayableHand(move)?.type !== "bomb");

  if (nonBombMoves.length === 0 && passMove !== undefined) {
    return passMove;
  }

  return (
    [...(nonBombMoves.length > 0 ? nonBombMoves : playMoves)].sort(comparePlayMoves)[0] ?? {
      type: "pass"
    }
  );
}

function chooseSimpleHeuristicMove(
  moves: readonly Move[],
  context: MoveValidationContext,
  hand: readonly Card[]
): Move {
  const playMoves = moves.filter((move): move is PlayMove => move.type === "play");
  const passMove = moves.find((move) => move.type === "pass");

  if (playMoves.length === 0) {
    return (
      passMove ?? {
        type: "pass"
      }
    );
  }

  const finishingMoves = playMoves.filter((move) => move.cards.length === hand.length);

  if (finishingMoves.length > 0) {
    return [...finishingMoves].sort(comparePlayMoves)[0] ?? finishingMoves[0] ?? { type: "pass" };
  }

  if (context.currentTrick === null) {
    const nonBombLeads = playMoves.filter((move) => detectPlayableHand(move)?.type !== "bomb");
    return (
      [...(nonBombLeads.length > 0 ? nonBombLeads : playMoves)].sort(
        compareLeadHeuristicMoves
      )[0] ?? {
        type: "pass"
      }
    );
  }

  const currentHandType = context.currentTrick.hand.type;
  const nonBombResponses = playMoves.filter((move) => detectPlayableHand(move)?.type !== "bomb");

  if (currentHandType !== "bomb" && nonBombResponses.length === 0 && passMove !== undefined) {
    return passMove;
  }

  return (
    [...(nonBombResponses.length > 0 ? nonBombResponses : playMoves)].sort((left, right) =>
      compareConservingResponses(left, right, hand)
    )[0] ?? { type: "pass" }
  );
}

function compareConservingResponses(
  left: PlayMove,
  right: PlayMove,
  hand: readonly Card[]
): number {
  const splitComparison = getGroupSplitPenalty(left, hand) - getGroupSplitPenalty(right, hand);

  return splitComparison !== 0 ? splitComparison : comparePlayMoves(left, right);
}

function getGroupSplitPenalty(move: PlayMove, hand: readonly Card[]): number {
  const handCounts = countCardsByRank(hand);
  const moveCounts = countCardsByRank(move.cards);
  let penalty = 0;

  for (const [rank, selectedCount] of moveCounts) {
    const remainingCount = (handCounts.get(rank) ?? 0) - selectedCount;

    if (remainingCount > 0) {
      penalty += remainingCount;
    }
  }

  return penalty;
}

function countCardsByRank(cards: readonly Card[]): Map<Card["rank"], number> {
  const counts = new Map<Card["rank"], number>();

  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  return counts;
}

function compareLeadHeuristicMoves(left: PlayMove, right: PlayMove): number {
  if (left.cards.length !== right.cards.length) {
    return right.cards.length - left.cards.length;
  }

  const leftHand = detectPlayableHand(left);
  const rightHand = detectPlayableHand(right);
  const leftStrength = leftHand === undefined ? Number.MAX_SAFE_INTEGER : handStrength(leftHand);
  const rightStrength = rightHand === undefined ? Number.MAX_SAFE_INTEGER : handStrength(rightHand);

  if (leftStrength !== rightStrength) {
    return leftStrength - rightStrength;
  }

  return comparePlayMoves(left, right);
}

function detectPlayableHand(move: PlayMove): HandAnalysis | undefined {
  const hand = detectHand(move.cards);
  return hand.type === "invalid" ? undefined : hand;
}

function handStrength(hand: HandAnalysis): number {
  return getRankStrength(hand.primaryRank);
}

function comparePlayMoves(left: PlayMove, right: PlayMove): number {
  if (left.cards.length !== right.cards.length) {
    return left.cards.length - right.cards.length;
  }

  const leftCards = [...left.cards].sort(compareCards);
  const rightCards = [...right.cards].sort(compareCards);

  for (let index = 0; index < leftCards.length; index += 1) {
    const leftCard = leftCards[index];
    const rightCard = rightCards[index];

    if (leftCard === undefined || rightCard === undefined) {
      continue;
    }

    const comparison = compareCards(leftCard, rightCard);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}
