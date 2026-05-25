import { LOWEST_CARD, isSameCard, type Card } from "./cards.js";
import { canBeat, compareHands } from "./compare.js";
import { detectHand, type HandAnalysis } from "./hands.js";

export type PlayMove = {
  readonly type: "play";
  readonly cards: readonly Card[];
};

export type PassMove = {
  readonly type: "pass";
};

export type Move = PlayMove | PassMove;

export type CurrentTrick = {
  readonly leadingPlayerId: string;
  readonly lastPlayedByPlayerId: string;
  readonly hand: HandAnalysis;
  readonly passedPlayerIds: readonly string[];
};

export type MoveValidationContext = {
  readonly isFirstMove: boolean;
  readonly currentTrick: CurrentTrick | null;
};

export type MoveValidationResult =
  | {
      readonly valid: true;
      readonly hand?: HandAnalysis;
    }
  | {
      readonly valid: false;
      readonly reason: string;
    };

export function validateMove(move: Move, context: MoveValidationContext): MoveValidationResult {
  if (move.type === "pass") {
    return validatePass(context);
  }

  return validatePlay(move, context);
}

function validatePass(context: MoveValidationContext): MoveValidationResult {
  if (context.isFirstMove) {
    return {
      valid: false,
      reason: "The first move cannot be a pass."
    };
  }

  if (context.currentTrick === null) {
    return {
      valid: false,
      reason: "A player cannot pass when starting a new trick."
    };
  }

  return {
    valid: true
  };
}

function validatePlay(move: PlayMove, context: MoveValidationContext): MoveValidationResult {
  const hand = detectHand(move.cards);

  if (hand.type === "invalid") {
    return {
      valid: false,
      reason: hand.reason
    };
  }

  if (context.isFirstMove && !move.cards.some((card) => isSameCard(card, LOWEST_CARD))) {
    return {
      valid: false,
      reason: "The first play of the game must include the 3 of diamonds."
    };
  }

  if (context.currentTrick === null) {
    return {
      valid: true,
      hand
    };
  }

  const activeHand = context.currentTrick.hand;

  if (hand.type === "bomb" || activeHand.type === "bomb") {
    if (compareHands(hand, activeHand).result === "higher") {
      return {
        valid: true,
        hand
      };
    }

    return {
      valid: false,
      reason:
        activeHand.type === "bomb"
          ? "A bomb can only be beaten by a stronger bomb."
          : "Bomb must beat the current hand."
    };
  }

  if (hand.type !== activeHand.type) {
    return {
      valid: false,
      reason: "Move must match the current trick hand type unless it is a bomb."
    };
  }

  if (
    hand.type === "straight" &&
    activeHand.type === "straight" &&
    hand.length !== activeHand.length
  ) {
    return {
      valid: false,
      reason: "Straight responses must match the current straight length."
    };
  }

  if (!canBeat(move.cards, activeHand.cards)) {
    return {
      valid: false,
      reason: "Move must beat the current hand."
    };
  }

  return {
    valid: true,
    hand
  };
}
