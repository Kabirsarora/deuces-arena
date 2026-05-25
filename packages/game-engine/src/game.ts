import { LOWEST_CARD, createDeck, isSameCard, sortCards, type Card } from "./cards.js";
import type { HandAnalysis } from "./hands.js";
import { validateMove, type CurrentTrick, type Move } from "./moves.js";

export type PlayerState = {
  readonly id: string;
  readonly hand: readonly Card[];
};

export type GameStatus = "in-progress" | "complete";

export type GameState = {
  readonly players: readonly PlayerState[];
  readonly activePlayerId: string;
  readonly currentTrick: CurrentTrick | null;
  readonly turnNumber: number;
  readonly placements: readonly string[];
  readonly status: GameStatus;
};

export type GameActionResult =
  | {
      readonly ok: true;
      readonly state: GameState;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export function createInitialGame(
  playerIds: readonly string[],
  deck: readonly Card[] = createDeck()
): GameState {
  if (playerIds.length !== 4) {
    throw new Error("Deuces Arena currently requires exactly 4 players.");
  }

  if (deck.length !== 52) {
    throw new Error("A game must start with a 52-card deck.");
  }

  const players = playerIds.map((id, index) => ({
    id,
    hand: sortCards(deck.slice(index * 13, index * 13 + 13))
  }));
  const startingPlayer = players.find((player) =>
    player.hand.some((card) => isSameCard(card, LOWEST_CARD))
  );

  if (startingPlayer === undefined) {
    throw new Error("A game cannot start without the 3 of diamonds.");
  }

  return {
    players,
    activePlayerId: startingPlayer.id,
    currentTrick: null,
    turnNumber: 0,
    placements: [],
    status: "in-progress"
  };
}

export function applyMove(state: GameState, playerId: string, move: Move): GameActionResult {
  if (state.status === "complete") {
    return {
      ok: false,
      reason: "Game is already complete."
    };
  }

  if (playerId !== state.activePlayerId) {
    return {
      ok: false,
      reason: "It is not this player's turn."
    };
  }

  const player = getPlayer(state, playerId);

  if (player === undefined) {
    return {
      ok: false,
      reason: "Unknown player."
    };
  }

  if (move.type === "play" && !playerOwnsCards(player, move.cards)) {
    return {
      ok: false,
      reason: "Player cannot play cards they do not hold."
    };
  }

  const validation = validateMove(move, {
    isFirstMove: state.turnNumber === 0,
    currentTrick: state.currentTrick
  });

  if (!validation.valid) {
    return {
      ok: false,
      reason: validation.reason
    };
  }

  if (move.type === "pass") {
    return {
      ok: true,
      state: applyPass(state, playerId)
    };
  }

  if (validation.hand === undefined) {
    return {
      ok: false,
      reason: "A play move must produce a valid hand."
    };
  }

  return {
    ok: true,
    state: applyPlay(state, playerId, move.cards, validation.hand)
  };
}

function applyPlay(
  state: GameState,
  playerId: string,
  cards: readonly Card[],
  hand: HandAnalysis
): GameState {
  const players = state.players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          hand: removeCards(player.hand, cards)
        }
      : player
  );
  const updatedPlayer = players.find((player) => player.id === playerId);

  if (updatedPlayer !== undefined && updatedPlayer.hand.length === 0) {
    return {
      ...state,
      players,
      currentTrick: {
        leadingPlayerId: state.currentTrick?.leadingPlayerId ?? playerId,
        lastPlayedByPlayerId: playerId,
        hand,
        passedPlayerIds: []
      },
      turnNumber: state.turnNumber + 1,
      placements: [...state.placements, playerId],
      status: "complete"
    };
  }

  return {
    ...state,
    players,
    activePlayerId: getNextActivePlayerId(
      {
        ...state,
        players
      },
      playerId
    ),
    currentTrick: {
      leadingPlayerId: state.currentTrick?.leadingPlayerId ?? playerId,
      lastPlayedByPlayerId: playerId,
      hand,
      passedPlayerIds: []
    },
    turnNumber: state.turnNumber + 1
  };
}

function applyPass(state: GameState, playerId: string): GameState {
  if (state.currentTrick === null) {
    return state;
  }

  const passedPlayerIds = uniqueIds([...state.currentTrick.passedPlayerIds, playerId]);
  const updatedTrick = {
    ...state.currentTrick,
    passedPlayerIds
  };

  if (hasTrickEnded(state, updatedTrick)) {
    return {
      ...state,
      activePlayerId: updatedTrick.lastPlayedByPlayerId,
      currentTrick: null,
      turnNumber: state.turnNumber + 1
    };
  }

  return {
    ...state,
    activePlayerId: getNextActivePlayerId(state, playerId),
    currentTrick: updatedTrick,
    turnNumber: state.turnNumber + 1
  };
}

function hasTrickEnded(state: GameState, trick: CurrentTrick): boolean {
  const activePlayerIds = state.players
    .filter((player) => player.hand.length > 0)
    .map((player) => player.id)
    .filter((id) => id !== trick.lastPlayedByPlayerId);

  return activePlayerIds.every((id) => trick.passedPlayerIds.includes(id));
}

function getNextActivePlayerId(state: GameState, playerId: string): string {
  const activePlayers = state.players.filter((player) => player.hand.length > 0);
  const currentIndex = activePlayers.findIndex((player) => player.id === playerId);

  if (currentIndex === -1) {
    return activePlayers[0]?.id ?? playerId;
  }

  return activePlayers[(currentIndex + 1) % activePlayers.length]?.id ?? playerId;
}

function getPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((player) => player.id === playerId);
}

function playerOwnsCards(player: PlayerState, cards: readonly Card[]): boolean {
  return cards.every((card) => player.hand.some((heldCard) => isSameCard(heldCard, card)));
}

function removeCards(hand: readonly Card[], cards: readonly Card[]): Card[] {
  const cardsToRemove = [...cards];

  return hand.filter((heldCard) => {
    const removeAt = cardsToRemove.findIndex((card) => isSameCard(card, heldCard));

    if (removeAt === -1) {
      return true;
    }

    cardsToRemove.splice(removeAt, 1);
    return false;
  });
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
