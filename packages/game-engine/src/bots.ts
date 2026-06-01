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
      move: chooseSimpleHeuristicMove(legalMoves, input.context),
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

  if (playMoves.length === 0) {
    return {
      type: "pass"
    };
  }

  return (
    [...playMoves].sort(comparePlayMoves)[0] ?? {
      type: "pass"
    }
  );
}

function chooseSimpleHeuristicMove(moves: readonly Move[], context: MoveValidationContext): Move {
  const playMoves = moves.filter((move): move is PlayMove => move.type === "play");
  const passMove = moves.find((move) => move.type === "pass");

  if (playMoves.length === 0) {
    return (
      passMove ?? {
        type: "pass"
      }
    );
  }

  if (context.currentTrick === null) {
    return (
      [...playMoves].sort(compareLeadHeuristicMoves)[0] ?? {
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
    [...(nonBombResponses.length > 0 ? nonBombResponses : playMoves)].sort(comparePlayMoves)[0] ?? {
      type: "pass"
    }
  );
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
