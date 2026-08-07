import { describe, expect, it } from "vitest";

import { createCard } from "./cards.js";
import { applyMove, type GameState } from "./game.js";
import { analyzeReplayDecisions } from "./replay-analysis.js";

describe("replay decision analysis", () => {
  it("reconstructs a completed game and compares the chosen move with simulated alternatives", () => {
    const finalState = completedReplayState();
    const reviews = analyzeReplayDecisions({
      finalState,
      playerId: "player-1",
      rolloutsPerMove: 4,
      rolloutPolicy: "random-legal",
      random: () => 0.999
    });

    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.turnNumber).toBe(0);
    expect(reviews[0]?.chosen.move).toEqual({
      type: "play",
      cards: [createCard("3", "diamonds")]
    });
    expect(reviews[0]?.simulationFavorite.move).toMatchObject({
      type: "play",
      cards: expect.arrayContaining([createCard("3", "diamonds"), createCard("7", "diamonds")])
    });
    expect(reviews[0]?.simulationFavorite.winRate).toBe(1);
    expect(reviews[0]?.winRateLoss).toBeGreaterThan(0);
    expect(reviews[0]?.severity).toBe("high");
  });

  it("rejects invalid rollout counts and unknown players", () => {
    const finalState = completedReplayState();

    expect(() =>
      analyzeReplayDecisions({
        finalState,
        playerId: "player-1",
        rolloutsPerMove: 0
      })
    ).toThrow("at least one rollout");
    expect(() =>
      analyzeReplayDecisions({
        finalState,
        playerId: "missing",
        rolloutsPerMove: 1
      })
    ).toThrow("known player");
  });
});

function completedReplayState(): GameState {
  const initialState: GameState = {
    players: [
      {
        id: "player-1",
        hand: ["3", "4", "5", "6", "7"].map((rank) =>
          createCard(rank as "3" | "4" | "5" | "6" | "7", "diamonds")
        )
      },
      { id: "player-2", hand: [createCard("8", "diamonds")] },
      { id: "player-3", hand: [createCard("9", "diamonds")] },
      { id: "player-4", hand: [createCard("10", "diamonds")] }
    ],
    activePlayerId: "player-1",
    currentTrick: null,
    turnNumber: 0,
    placements: [],
    status: "in-progress",
    events: []
  };
  const firstMove = applyMove(initialState, "player-1", {
    type: "play",
    cards: [createCard("3", "diamonds")]
  });

  if (!firstMove.ok) {
    throw new Error(firstMove.reason);
  }

  const winningMove = applyMove(firstMove.state, "player-2", {
    type: "play",
    cards: [createCard("8", "diamonds")]
  });

  if (!winningMove.ok) {
    throw new Error(winningMove.reason);
  }

  return winningMove.state;
}
