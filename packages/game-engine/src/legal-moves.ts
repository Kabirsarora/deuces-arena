import type { Card } from "./cards.js";
import { validateMove, type Move, type MoveValidationContext, type PlayMove } from "./moves.js";

export function generateLegalMoves(
  hand: readonly Card[],
  context: MoveValidationContext
): readonly Move[] {
  const plays = generatePlayCandidates(hand).filter((move) => validateMove(move, context).valid);

  if (validateMove({ type: "pass" }, context).valid) {
    return [{ type: "pass" }, ...plays];
  }

  return plays;
}

function generatePlayCandidates(hand: readonly Card[]): readonly PlayMove[] {
  const candidates: PlayMove[] = [];

  for (let size = 1; size <= hand.length; size += 1) {
    for (const cards of combinations(hand, size)) {
      candidates.push({
        type: "play",
        cards
      });
    }
  }

  return candidates;
}

function combinations(cards: readonly Card[], size: number): readonly Card[][] {
  if (size === 0) {
    return [[]];
  }

  if (cards.length < size) {
    return [];
  }

  const [firstCard, ...remainingCards] = cards;

  if (firstCard === undefined) {
    return [];
  }

  const withFirst = combinations(remainingCards, size - 1).map((combo) => [firstCard, ...combo]);
  const withoutFirst = combinations(remainingCards, size);

  return [...withFirst, ...withoutFirst];
}
