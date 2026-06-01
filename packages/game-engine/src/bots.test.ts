import { describe, expect, it } from "vitest";

import { chooseBotMove, createCard, type MoveValidationContext } from "./index.js";

const openTrick: MoveValidationContext = {
  isFirstMove: false,
  currentTrick: null
};

describe("baseline bots", () => {
  it("chooses a legal random move using the provided random source", () => {
    const decision = chooseBotMove({
      hand: [createCard("3", "diamonds"), createCard("4", "diamonds"), createCard("5", "diamonds")],
      context: openTrick,
      random: () => 0
    });

    expect(decision.strategy).toBe("random-legal");
    expect(decision.legalMoveCount).toBeGreaterThan(0);
    expect(decision.move.type).toBe("play");
  });

  it("chooses the lowest legal play for the deterministic baseline strategy", () => {
    const decision = chooseBotMove({
      hand: [createCard("5", "diamonds"), createCard("3", "diamonds"), createCard("4", "diamonds")],
      context: openTrick,
      strategy: "lowest-legal"
    });

    expect(decision).toMatchObject({
      strategy: "lowest-legal",
      move: {
        type: "play",
        cards: [createCard("3", "diamonds")]
      }
    });
  });

  it("passes when there are no legal plays but passing is legal", () => {
    const decision = chooseBotMove({
      hand: [createCard("4", "diamonds")],
      context: {
        isFirstMove: false,
        currentTrick: {
          leadingPlayerId: "player-1",
          lastPlayedByPlayerId: "player-1",
          hand: {
            type: "single",
            cards: [createCard("2", "spades")],
            primaryRank: "2",
            highestCard: createCard("2", "spades")
          },
          passedPlayerIds: []
        }
      },
      strategy: "lowest-legal"
    });

    expect(decision.move).toEqual({
      type: "pass"
    });
  });

  it("does not pass when starting a trick with legal plays available", () => {
    const decision = chooseBotMove({
      hand: [createCard("7", "diamonds")],
      context: openTrick,
      strategy: "lowest-legal"
    });

    expect(decision.move).toEqual({
      type: "play",
      cards: [createCard("7", "diamonds")]
    });
  });

  it("uses the simple heuristic to shed longer combinations when leading", () => {
    const decision = chooseBotMove({
      hand: [
        createCard("3", "diamonds"),
        createCard("3", "clubs"),
        createCard("6", "hearts"),
        createCard("9", "spades")
      ],
      context: openTrick,
      strategy: "simple-heuristic"
    });

    expect(decision).toMatchObject({
      strategy: "simple-heuristic",
      move: {
        type: "play",
        cards: [createCard("3", "diamonds"), createCard("3", "clubs")]
      }
    });
  });

  it("uses the simple heuristic to answer with the cheapest non-bomb response", () => {
    const decision = chooseBotMove({
      hand: [
        createCard("5", "diamonds"),
        createCard("7", "diamonds"),
        createCard("7", "clubs"),
        createCard("7", "hearts"),
        createCard("7", "spades"),
        createCard("9", "diamonds")
      ],
      context: {
        isFirstMove: false,
        currentTrick: {
          leadingPlayerId: "player-1",
          lastPlayedByPlayerId: "player-1",
          hand: {
            type: "single",
            cards: [createCard("4", "diamonds")],
            primaryRank: "4",
            highestCard: createCard("4", "diamonds")
          },
          passedPlayerIds: []
        }
      },
      strategy: "simple-heuristic"
    });

    expect(decision.move).toEqual({
      type: "play",
      cards: [createCard("5", "diamonds")]
    });
  });

  it("uses the simple heuristic to preserve bombs when passing is legal", () => {
    const decision = chooseBotMove({
      hand: [
        createCard("7", "diamonds"),
        createCard("7", "clubs"),
        createCard("7", "hearts"),
        createCard("7", "spades"),
        createCard("9", "diamonds")
      ],
      context: {
        isFirstMove: false,
        currentTrick: {
          leadingPlayerId: "player-1",
          lastPlayedByPlayerId: "player-1",
          hand: {
            type: "single",
            cards: [createCard("2", "spades")],
            primaryRank: "2",
            highestCard: createCard("2", "spades")
          },
          passedPlayerIds: []
        }
      },
      strategy: "simple-heuristic"
    });

    expect(decision.move).toEqual({
      type: "pass"
    });
  });
});
