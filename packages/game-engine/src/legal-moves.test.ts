import { describe, expect, it } from "vitest";

import {
  assertValidHand,
  createCard,
  detectHand,
  generateLegalMoves,
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
});
