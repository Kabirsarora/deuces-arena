import { describe, expect, it } from "vitest";

import { createCard, type GameState } from "./index.js";
import { evaluateMoveByRandomRollouts, simulateRandomPlayout } from "./simulation.js";

describe("simulation", () => {
  it("simulates a playout from a game state", () => {
    const state = oneCardWinState();
    const result = simulateRandomPlayout({
      state,
      random: () => 0
    });

    expect(result.status).toBe("complete");
    expect(result.turnsSimulated).toBe(1);
    expect(result.placements[0]).toBe("player-1");
  });

  it("evaluates a move with random rollouts", () => {
    const state = oneCardWinState();
    const evaluation = evaluateMoveByRandomRollouts({
      state,
      playerId: "player-1",
      move: {
        type: "play",
        cards: [createCard("3", "diamonds")]
      },
      rollouts: 5,
      random: () => 0
    });

    expect(evaluation).toMatchObject({
      rollouts: 5,
      wins: 5,
      winRate: 1,
      averagePlacement: 1
    });
  });

  it("rejects invalid moves before running rollouts", () => {
    expect(() =>
      evaluateMoveByRandomRollouts({
        state: oneCardWinState(),
        playerId: "player-1",
        move: {
          type: "pass"
        },
        rollouts: 1
      })
    ).toThrow("The first move cannot be a pass.");
  });
});

function oneCardWinState(): GameState {
  return {
    players: [
      {
        id: "player-1",
        hand: [createCard("3", "diamonds")]
      },
      {
        id: "player-2",
        hand: [createCard("4", "diamonds")]
      },
      {
        id: "player-3",
        hand: [createCard("5", "diamonds")]
      },
      {
        id: "player-4",
        hand: [createCard("6", "diamonds")]
      }
    ],
    activePlayerId: "player-1",
    currentTrick: null,
    turnNumber: 0,
    placements: [],
    status: "in-progress",
    events: []
  };
}
