import { compareCards, type Card } from "./cards.js";
import { generateLegalMoves } from "./legal-moves.js";
import type { Move, MoveValidationContext, PlayMove } from "./moves.js";

export type BotStrategy = "random-legal" | "lowest-legal";

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
