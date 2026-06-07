import { describe, expect, it } from "vitest";

import {
  applyMove,
  createCard,
  createDeck,
  createInitialGame,
  summarizeGame,
  type GameState
} from "./index.js";

const playerIds = ["player-1", "player-2", "player-3", "player-4"] as const;

function testGame(): GameState {
  return createInitialGame(playerIds, createDeck());
}

describe("game state", () => {
  it("deals 13 cards to each player and starts with whoever has the 3 of diamonds", () => {
    const game = testGame();

    expect(game.players).toHaveLength(4);
    expect(game.players.every((player) => player.hand.length === 13)).toBe(true);
    expect(game.activePlayerId).toBe("player-1");
    expect(game.status).toBe("in-progress");
  });

  it("supports six-player arena deals with the expanded deck", () => {
    const game = createInitialGame(
      ["player-1", "player-2", "player-3", "player-4", "player-5", "player-6"],
      createDeck("arena-six"),
      {
        cardsPerPlayer: 13
      }
    );

    expect(game.players).toHaveLength(6);
    expect(game.players.every((player) => player.hand.length === 13)).toBe(true);
    expect(game.players.some((player) => player.hand.some((card) => card.suit === "crowns"))).toBe(
      true
    );
  });

  it("supports custom cards per player when the deck has enough cards", () => {
    const game = createInitialGame(playerIds, createDeck("arena-six"), {
      cardsPerPlayer: 15
    });

    expect(game.players.every((player) => player.hand.length === 15)).toBe(true);
  });

  it("rejects moves from players whose turn it is not", () => {
    const result = applyMove(testGame(), "player-2", {
      type: "play",
      cards: [createCard("3", "diamonds")]
    });

    expect(result).toEqual({
      ok: false,
      reason: "It is not this player's turn."
    });
  });

  it("rejects playing cards the player does not hold", () => {
    const result = applyMove(testGame(), "player-1", {
      type: "play",
      cards: [createCard("K", "spades")]
    });

    expect(result).toEqual({
      ok: false,
      reason: "Player cannot play cards they do not hold."
    });
  });

  it("applies a valid play, removes cards, and advances the turn", () => {
    const result = applyMove(testGame(), "player-1", {
      type: "play",
      cards: [createCard("3", "diamonds")]
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.players[0]?.hand).toHaveLength(12);
    expect(result.state.activePlayerId).toBe("player-2");
    expect(result.state.currentTrick?.lastPlayedByPlayerId).toBe("player-1");
    expect(result.state.turnNumber).toBe(1);
  });

  it("tracks passes and lets the trick winner start a new trick", () => {
    const firstMove = applyMove(testGame(), "player-1", {
      type: "play",
      cards: [createCard("3", "diamonds")]
    });
    expect(firstMove.ok).toBe(true);

    if (!firstMove.ok) {
      return;
    }

    const passTwo = applyMove(firstMove.state, "player-2", { type: "pass" });
    expect(passTwo.ok).toBe(true);

    if (!passTwo.ok) {
      return;
    }

    const passThree = applyMove(passTwo.state, "player-3", { type: "pass" });
    expect(passThree.ok).toBe(true);

    if (!passThree.ok) {
      return;
    }

    const passFour = applyMove(passThree.state, "player-4", { type: "pass" });
    expect(passFour.ok).toBe(true);

    if (!passFour.ok) {
      return;
    }

    expect(passFour.state.activePlayerId).toBe("player-1");
    expect(passFour.state.currentTrick).toBeNull();
  });

  it("completes the game when a player sheds their final card", () => {
    const game: GameState = {
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

    const result = applyMove(game, "player-1", {
      type: "play",
      cards: [createCard("3", "diamonds")]
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.status).toBe("complete");
    expect(result.state.placements).toEqual(["player-1"]);
  });

  it("records structured move events for replay and future analysis", () => {
    const result = applyMove(testGame(), "player-1", {
      type: "play",
      cards: [createCard("3", "diamonds")]
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.events).toHaveLength(1);
    expect(result.state.events[0]).toMatchObject({
      turnNumber: 0,
      playerId: "player-1",
      wasPass: false,
      legalMoveCount: expect.any(Number),
      cardsRemainingBefore: {
        "player-1": 13,
        "player-2": 13,
        "player-3": 13,
        "player-4": 13
      },
      cardsRemainingAfter: {
        "player-1": 12,
        "player-2": 13,
        "player-3": 13,
        "player-4": 13
      }
    });
  });

  it("summarizes move, pass, and remaining-card stats", () => {
    const firstMove = applyMove(testGame(), "player-1", {
      type: "play",
      cards: [createCard("3", "diamonds")]
    });
    expect(firstMove.ok).toBe(true);

    if (!firstMove.ok) {
      return;
    }

    const pass = applyMove(firstMove.state, "player-2", {
      type: "pass"
    });
    expect(pass.ok).toBe(true);

    if (!pass.ok) {
      return;
    }

    expect(summarizeGame(pass.state)).toContainEqual({
      playerId: "player-1",
      cardsRemaining: 12,
      movesPlayed: 1,
      passes: 0,
      bombsPlayed: 0
    });
    expect(summarizeGame(pass.state)).toContainEqual({
      playerId: "player-2",
      cardsRemaining: 13,
      movesPlayed: 0,
      passes: 1,
      bombsPlayed: 0
    });
  });

  it("counts only detected bombs as bombs in game summaries", () => {
    const fullHouseGame = createSummaryGame([
      createCard("3", "diamonds"),
      createCard("3", "clubs"),
      createCard("3", "hearts"),
      createCard("4", "diamonds"),
      createCard("4", "clubs")
    ]);
    const fullHouseResult = applyMove(fullHouseGame, "player-1", {
      type: "play",
      cards: fullHouseGame.players[0]?.hand ?? []
    });
    expect(fullHouseResult.ok).toBe(true);

    if (!fullHouseResult.ok) {
      return;
    }

    expect(summarizeGame(fullHouseResult.state)).toContainEqual({
      playerId: "player-1",
      cardsRemaining: 0,
      movesPlayed: 1,
      passes: 0,
      bombsPlayed: 0
    });

    const bombGame = createSummaryGame([
      createCard("3", "diamonds"),
      createCard("3", "clubs"),
      createCard("3", "hearts"),
      createCard("3", "spades"),
      createCard("4", "diamonds")
    ]);
    const bombResult = applyMove(bombGame, "player-1", {
      type: "play",
      cards: bombGame.players[0]?.hand ?? []
    });
    expect(bombResult.ok).toBe(true);

    if (!bombResult.ok) {
      return;
    }

    expect(summarizeGame(bombResult.state)).toContainEqual({
      playerId: "player-1",
      cardsRemaining: 0,
      movesPlayed: 1,
      passes: 0,
      bombsPlayed: 1
    });
  });

  it("can end the trick immediately when a bomb rule variant is enabled", () => {
    const game = createSummaryGame([
      createCard("3", "diamonds"),
      createCard("3", "clubs"),
      createCard("3", "hearts"),
      createCard("3", "spades"),
      createCard("4", "diamonds"),
      createCard("5", "diamonds")
    ]);
    const result = applyMove(
      game,
      "player-1",
      {
        type: "play",
        cards: game.players[0]?.hand.slice(0, 5) ?? []
      },
      { bombEndsTrick: true }
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.state.activePlayerId).toBe("player-1");
    expect(result.state.currentTrick).toBeNull();
    expect(result.state.status).toBe("in-progress");
    expect(result.state.players[0]?.hand).toEqual([createCard("5", "diamonds")]);
  });
});

function createSummaryGame(playerOneHand: GameState["players"][number]["hand"]): GameState {
  return {
    players: [
      {
        id: "player-1",
        hand: playerOneHand
      },
      {
        id: "player-2",
        hand: [createCard("5", "diamonds")]
      },
      {
        id: "player-3",
        hand: [createCard("6", "diamonds")]
      },
      {
        id: "player-4",
        hand: [createCard("7", "diamonds")]
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
