import { describe, expect, it } from "vitest";

import {
  assertValidHand,
  createCard,
  detectHand,
  validateMove,
  type CurrentTrick,
  type MoveValidationContext
} from "./index.js";

const newTrickContext: MoveValidationContext = {
  isFirstMove: false,
  currentTrick: null
};

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

describe("move validation", () => {
  it("requires the first play to include the 3 of diamonds", () => {
    expect(
      validateMove(
        {
          type: "play",
          cards: [createCard("4", "diamonds")]
        },
        {
          isFirstMove: true,
          currentTrick: null
        }
      )
    ).toEqual({
      valid: false,
      reason: "The first play of the game must include the 3 of diamonds."
    });

    expect(
      validateMove(
        {
          type: "play",
          cards: [createCard("3", "diamonds")]
        },
        {
          isFirstMove: true,
          currentTrick: null
        }
      )
    ).toMatchObject({
      valid: true
    });
  });

  it("does not allow passing on the first move or while starting a trick", () => {
    expect(
      validateMove(
        {
          type: "pass"
        },
        {
          isFirstMove: true,
          currentTrick: null
        }
      )
    ).toEqual({
      valid: false,
      reason: "The first move cannot be a pass."
    });

    expect(
      validateMove(
        {
          type: "pass"
        },
        newTrickContext
      )
    ).toEqual({
      valid: false,
      reason: "A player cannot pass when starting a new trick."
    });
  });

  it("allows passing during an active trick", () => {
    expect(
      validateMove(
        {
          type: "pass"
        },
        {
          isFirstMove: false,
          currentTrick: currentTrick([createCard("7", "diamonds")])
        }
      )
    ).toEqual({
      valid: true
    });
  });

  it("requires normal moves to match the active hand type", () => {
    expect(
      validateMove(
        {
          type: "play",
          cards: [createCard("8", "diamonds"), createCard("8", "spades")]
        },
        {
          isFirstMove: false,
          currentTrick: currentTrick([createCard("7", "diamonds")])
        }
      )
    ).toEqual({
      valid: false,
      reason: "Move must match the current trick hand type unless it is a bomb."
    });
  });

  it("requires straight responses to match exact length", () => {
    expect(
      validateMove(
        {
          type: "play",
          cards: [
            createCard("4", "diamonds"),
            createCard("5", "clubs"),
            createCard("6", "hearts"),
            createCard("7", "spades"),
            createCard("8", "diamonds"),
            createCard("9", "clubs")
          ]
        },
        {
          isFirstMove: false,
          currentTrick: currentTrick([
            createCard("3", "diamonds"),
            createCard("4", "clubs"),
            createCard("5", "hearts"),
            createCard("6", "spades"),
            createCard("7", "diamonds")
          ])
        }
      )
    ).toEqual({
      valid: false,
      reason: "Straight responses must match the current straight length."
    });
  });

  it("requires the played hand to beat the current hand", () => {
    expect(
      validateMove(
        {
          type: "play",
          cards: [createCard("6", "diamonds")]
        },
        {
          isFirstMove: false,
          currentTrick: currentTrick([createCard("7", "diamonds")])
        }
      )
    ).toEqual({
      valid: false,
      reason: "Move must beat the current hand."
    });
  });

  it("allows bombs to beat normal hands", () => {
    expect(
      validateMove(
        {
          type: "play",
          cards: [
            createCard("5", "diamonds"),
            createCard("5", "clubs"),
            createCard("5", "hearts"),
            createCard("5", "spades"),
            createCard("K", "diamonds")
          ]
        },
        {
          isFirstMove: false,
          currentTrick: currentTrick([createCard("2", "spades")])
        }
      )
    ).toMatchObject({
      valid: true
    });
  });

  it("requires stronger bombs after a bomb is played", () => {
    expect(
      validateMove(
        {
          type: "play",
          cards: [
            createCard("4", "diamonds"),
            createCard("4", "clubs"),
            createCard("4", "hearts"),
            createCard("4", "spades"),
            createCard("K", "diamonds")
          ]
        },
        {
          isFirstMove: false,
          currentTrick: currentTrick([
            createCard("5", "diamonds"),
            createCard("5", "clubs"),
            createCard("5", "hearts"),
            createCard("5", "spades"),
            createCard("3", "diamonds")
          ])
        }
      )
    ).toEqual({
      valid: false,
      reason: "A bomb can only be beaten by a stronger bomb."
    });
  });
});
