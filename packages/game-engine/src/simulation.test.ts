import { describe, expect, it } from "vitest";

import { createCard, type GameState } from "./index.js";
import {
  evaluateLegalMovesByRandomRollouts,
  evaluateMoveByRandomRollouts,
  simulateRandomPlayout
} from "./simulation.js";

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
      averagePlacement: 1,
      completedRollouts: 5,
      completionRate: 1,
      rolloutPolicy: "random-legal"
    });
    expect(evaluation.winRateLow).toBeGreaterThan(0.5);
    expect(evaluation.winRateHigh).toBe(1);
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

  it("ranks legal moves by simulated outcome", () => {
    const evaluations = evaluateLegalMovesByRandomRollouts({
      state: oneCardWinState(),
      playerId: "player-1",
      rolloutsPerMove: 3,
      random: () => 0
    });

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toMatchObject({
      rollouts: 3,
      wins: 3,
      winRate: 1,
      averagePlacement: 1
    });
  });

  it("rejects legal move ranking for inactive players", () => {
    expect(() =>
      evaluateLegalMovesByRandomRollouts({
        state: oneCardWinState(),
        playerId: "player-2",
        rolloutsPerMove: 1
      })
    ).toThrow("Legal move evaluation can only run for the active player.");
  });

  it("labels heuristic-guided evaluations and preserves random exploration controls", () => {
    const evaluation = evaluateMoveByRandomRollouts({
      state: oneCardWinState(),
      playerId: "player-1",
      move: {
        type: "play",
        cards: [createCard("3", "diamonds")]
      },
      rollouts: 2,
      rolloutPolicy: "heuristic-mixed",
      explorationRate: 0,
      random: () => 0.5
    });

    expect(evaluation.rolloutPolicy).toBe("heuristic-mixed");
    expect(evaluation.completedRollouts).toBe(2);
  });

  it("rejects invalid exploration rates", () => {
    expect(() =>
      simulateRandomPlayout({
        state: oneCardWinState(),
        explorationRate: 1.1
      })
    ).toThrow("between 0 and 1");
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
