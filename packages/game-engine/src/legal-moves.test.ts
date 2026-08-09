import { describe, expect, it } from "vitest";

import {
  assertValidHand,
  createCard,
  detectHand,
  generateLegalMoves,
  getCardId,
  validateMove,
  type Card,
  type Move,
  type MoveValidationContext,
  type CurrentTrick
} from "./index.js";

function currentTrick(cards: Parameters<typeof detectHand>[0]): CurrentTrick {
  const hand = detectHand(cards);
  assertValidHand(hand);

  return {
    leadingPlayerId: "player-1",
    lastPlayedByPlayerId: "player-1",
    hand,
    passedPlayerIds: []
  };
}

describe("legal move generation", () => {
  it("generates first-play moves that include the 3 of diamonds", () => {
    const hand = [
      createCard("3", "diamonds"),
      createCard("3", "clubs"),
      createCard("4", "diamonds"),
      createCard("4", "clubs")
    ];
    const moves = generateLegalMoves(hand, {
      isFirstMove: true,
      currentTrick: null
    });

    expect(moves).not.toContainEqual({ type: "pass" });
    expect(moves.every((move) => move.type === "play")).toBe(true);
    expect(
      moves
        .filter((move) => move.type === "play")
        .every((move) => move.cards.some((card) => card.rank === "3" && card.suit === "diamonds"))
    ).toBe(true);
  });

  it("includes pass during an active trick", () => {
    const moves = generateLegalMoves([createCard("4", "diamonds")], {
      isFirstMove: false,
      currentTrick: currentTrick([createCard("3", "diamonds")])
    });

    expect(moves).toContainEqual({ type: "pass" });
  });

  it("generates only moves that beat the active hand", () => {
    const moves = generateLegalMoves([createCard("4", "diamonds"), createCard("6", "diamonds")], {
      isFirstMove: false,
      currentTrick: currentTrick([createCard("5", "diamonds")])
    });

    expect(moves).toContainEqual({
      type: "play",
      cards: [createCard("6", "diamonds")]
    });
    expect(moves).not.toContainEqual({
      type: "play",
      cards: [createCard("4", "diamonds")]
    });
  });

  it("generates bombs even when the active hand is a different type", () => {
    const bombCards = [
      createCard("7", "diamonds"),
      createCard("7", "clubs"),
      createCard("7", "hearts"),
      createCard("7", "spades"),
      createCard("3", "clubs")
    ];
    const moves = generateLegalMoves(bombCards, {
      isFirstMove: false,
      currentTrick: currentTrick([createCard("2", "spades")])
    });

    expect(moves).toContainEqual({
      type: "play",
      cards: bombCards
    });
  });

  it("generates Arena 6 pairs, trips, quads, and bombs from six-card rank groups", () => {
    const sixEights = [
      createCard("8", "diamonds"),
      createCard("8", "clubs"),
      createCard("8", "hearts"),
      createCard("8", "spades"),
      createCard("8", "stars"),
      createCard("8", "crowns")
    ];
    const moves = generateLegalMoves([...sixEights, createCard("K", "diamonds")], {
      isFirstMove: false,
      currentTrick: null
    });
    const handTypes = moves.flatMap((move) => {
      if (move.type === "pass") {
        return [];
      }

      return [detectHand(move.cards).type];
    });

    expect(handTypes).toContain("pair");
    expect(handTypes).toContain("trips");
    expect(handTypes).toContain("quad");
    expect(handTypes).toContain("bomb");
    expect(handTypes).not.toContain("invalid");
  });

  it("handles a 20-card Arena 6 hand without enumerating every card subset", () => {
    const hand = [
      ...["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q"].flatMap((rank) => [
        createCard(rank as Parameters<typeof createCard>[0], "diamonds"),
        createCard(rank as Parameters<typeof createCard>[0], "stars")
      ])
    ];
    const moves = generateLegalMoves(hand, { isFirstMove: false, currentTrick: null });

    expect(moves.length).toBeGreaterThan(100);
    expect(moves.length).toBeLessThan(10_000);
    expect(
      moves.every((move) => move.type === "pass" || detectHand(move.cards).type !== "invalid")
    ).toBe(true);
  });

  it("matches exhaustive validation for representative Arena 6 hands", () => {
    const hand = [
      createCard("3", "diamonds"),
      createCard("3", "stars"),
      createCard("4", "clubs"),
      createCard("5", "hearts"),
      createCard("6", "spades"),
      createCard("7", "crowns"),
      createCard("8", "diamonds")
    ];
    const context: MoveValidationContext = { isFirstMove: true, currentTrick: null };

    expect(moveKeys(generateLegalMoves(hand, context))).toEqual(
      moveKeys(generateMovesExhaustively(hand, context))
    );
  });
});

function generateMovesExhaustively(
  hand: readonly Card[],
  context: MoveValidationContext
): readonly Move[] {
  const moves: Move[] = [];

  if (validateMove({ type: "pass" }, context).valid) {
    moves.push({ type: "pass" });
  }

  for (let size = 1; size <= hand.length; size += 1) {
    for (const cards of cardCombinations(hand, size)) {
      const move: Move = { type: "play", cards };

      if (validateMove(move, context).valid) {
        moves.push(move);
      }
    }
  }

  return moves;
}

function cardCombinations(cards: readonly Card[], size: number): Card[][] {
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

  return [
    ...cardCombinations(remainingCards, size - 1).map((cards) => [firstCard, ...cards]),
    ...cardCombinations(remainingCards, size)
  ];
}

function moveKeys(moves: readonly Move[]): readonly string[] {
  return moves
    .map((move) => (move.type === "pass" ? "pass" : move.cards.map(getCardId).sort().join("|")))
    .sort();
}
