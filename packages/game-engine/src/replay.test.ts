import { describe, expect, it } from "vitest";

import { createCard, type GameEvent } from "./index.js";
import { createReplayTimeline } from "./replay.js";

describe("replay timeline", () => {
  it("creates compact timeline items from move events", () => {
    const events: readonly GameEvent[] = [
      {
        turnNumber: 0,
        playerId: "player-1",
        move: {
          type: "play",
          cards: [createCard("3", "diamonds")]
        },
        wasPass: false,
        handBefore: [createCard("3", "diamonds"), createCard("4", "diamonds")],
        currentTrickBefore: null,
        cardsRemainingBefore: {
          "player-1": 2
        },
        cardsRemainingAfter: {
          "player-1": 1
        },
        legalMoveCount: 4
      },
      {
        turnNumber: 1,
        playerId: "player-2",
        move: {
          type: "pass"
        },
        wasPass: true,
        handBefore: [createCard("5", "diamonds")],
        currentTrickBefore: null,
        cardsRemainingBefore: {
          "player-2": 1
        },
        cardsRemainingAfter: {
          "player-2": 1
        },
        legalMoveCount: 1
      }
    ];

    expect(createReplayTimeline(events)).toEqual([
      {
        turnNumber: 0,
        playerId: "player-1",
        kind: "play",
        handType: "single",
        cardCount: 1,
        legalMoveCount: 4,
        cardsRemainingBefore: 2,
        cardsRemainingAfter: 1
      },
      {
        turnNumber: 1,
        playerId: "player-2",
        kind: "pass",
        handType: null,
        cardCount: 0,
        legalMoveCount: 1,
        cardsRemainingBefore: 1,
        cardsRemainingAfter: 1
      }
    ]);
  });
});
