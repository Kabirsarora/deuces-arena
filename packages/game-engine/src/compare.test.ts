import { describe, expect, it } from "vitest";

import { assertValidHand, canBeat, compareHands, createCard, detectHand } from "./index.js";

function hand(cards: Parameters<typeof detectHand>[0]) {
  const detected = detectHand(cards);
  assertValidHand(detected);
  return detected;
}

describe("hand comparison", () => {
  it("compares singles by rank and suit", () => {
    const highSingle = hand([createCard("A", "diamonds")]);
    const lowSingle = hand([createCard("K", "spades")]);
    const sameRankHigherSuit = hand([createCard("A", "spades")]);

    expect(compareHands(highSingle, lowSingle)).toEqual({ result: "higher" });
    expect(compareHands(highSingle, sameRankHigherSuit)).toEqual({ result: "lower" });
  });

  it("compares pairs by rank and highest suit", () => {
    const highPair = hand([createCard("9", "diamonds"), createCard("9", "spades")]);
    const lowPair = hand([createCard("8", "hearts"), createCard("8", "spades")]);
    const sameRankHigherSuit = hand([createCard("9", "clubs"), createCard("9", "hearts")]);

    expect(compareHands(highPair, lowPair)).toEqual({ result: "higher" });
    expect(compareHands(sameRankHigherSuit, highPair)).toEqual({ result: "lower" });
  });

  it("compares full houses by triple rank", () => {
    const highFullHouse = hand([
      createCard("K", "diamonds"),
      createCard("K", "clubs"),
      createCard("K", "spades"),
      createCard("3", "diamonds"),
      createCard("3", "clubs")
    ]);
    const lowFullHouse = hand([
      createCard("Q", "diamonds"),
      createCard("Q", "clubs"),
      createCard("Q", "spades"),
      createCard("A", "diamonds"),
      createCard("A", "clubs")
    ]);

    expect(compareHands(highFullHouse, lowFullHouse)).toEqual({ result: "higher" });
  });

  it("requires straights to match exact length", () => {
    const fiveCardStraight = hand([
      createCard("3", "diamonds"),
      createCard("4", "clubs"),
      createCard("5", "hearts"),
      createCard("6", "spades"),
      createCard("7", "diamonds")
    ]);
    const sixCardStraight = hand([
      createCard("3", "clubs"),
      createCard("4", "diamonds"),
      createCard("5", "clubs"),
      createCard("6", "hearts"),
      createCard("7", "spades"),
      createCard("8", "diamonds")
    ]);

    expect(compareHands(sixCardStraight, fiveCardStraight)).toEqual({
      result: "not-comparable",
      reason: "Straights must have the same length."
    });
  });

  it("compares same-length straights by highest card", () => {
    const highStraight = hand([
      createCard("4", "diamonds"),
      createCard("5", "clubs"),
      createCard("6", "hearts"),
      createCard("7", "spades"),
      createCard("8", "diamonds")
    ]);
    const lowStraight = hand([
      createCard("3", "diamonds"),
      createCard("4", "clubs"),
      createCard("5", "hearts"),
      createCard("6", "spades"),
      createCard("7", "diamonds")
    ]);

    expect(compareHands(highStraight, lowStraight)).toEqual({ result: "higher" });
  });

  it("does not compare different non-bomb hand types", () => {
    const single = hand([createCard("A", "spades")]);
    const pair = hand([createCard("K", "diamonds"), createCard("K", "spades")]);

    expect(compareHands(single, pair)).toEqual({
      result: "not-comparable",
      reason: "Non-bomb hands must have the same hand type."
    });
  });

  it("allows bombs to beat normal hands", () => {
    const bomb = [
      createCard("5", "diamonds"),
      createCard("5", "clubs"),
      createCard("5", "hearts"),
      createCard("5", "spades"),
      createCard("K", "diamonds")
    ];
    const highSingle = [createCard("2", "spades")];

    expect(canBeat(bomb, highSingle)).toBe(true);
  });

  it("compares bombs by the four-of-a-kind rank and ignores the kicker", () => {
    const highBomb = hand([
      createCard("9", "diamonds"),
      createCard("9", "clubs"),
      createCard("9", "hearts"),
      createCard("9", "spades"),
      createCard("3", "diamonds")
    ]);
    const lowBomb = hand([
      createCard("8", "diamonds"),
      createCard("8", "clubs"),
      createCard("8", "hearts"),
      createCard("8", "spades"),
      createCard("2", "spades")
    ]);

    expect(compareHands(highBomb, lowBomb)).toEqual({ result: "higher" });
  });
});
