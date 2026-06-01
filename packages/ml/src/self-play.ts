import {
  createDeck,
  createInitialGame,
  simulateRandomPlayout,
  type Card,
  type GameEvent
} from "@deuces-arena/game-engine";

export type SelfPlayGameSample = {
  readonly gameIndex: number;
  readonly status: "complete" | "max-turns-reached";
  readonly turnsSimulated: number;
  readonly placements: readonly string[];
  readonly events: readonly GameEvent[];
};

export type SelfPlayGenerationInput = {
  readonly games: number;
  readonly random?: () => number;
  readonly maxTurnsPerGame?: number;
};

const SELF_PLAY_PLAYER_IDS = ["self-play-1", "self-play-2", "self-play-3", "self-play-4"];

export function generateRandomSelfPlaySamples(
  input: SelfPlayGenerationInput
): readonly SelfPlayGameSample[] {
  if (input.games <= 0) {
    throw new Error("Self-play generation requires at least one game.");
  }

  const random = input.random ?? Math.random;

  return Array.from({ length: input.games }, (_, gameIndex) => {
    const initialState = createInitialGame(SELF_PLAY_PLAYER_IDS, shuffleDeck(random));
    const result = simulateRandomPlayout({
      state: initialState,
      random,
      ...(input.maxTurnsPerGame === undefined
        ? {}
        : {
            maxTurns: input.maxTurnsPerGame
          })
    });

    return {
      gameIndex,
      status: result.status,
      turnsSimulated: result.turnsSimulated,
      placements: result.placements,
      events: result.finalState.events
    };
  });
}

function shuffleDeck(random: () => number): Card[] {
  const deck = createDeck();

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = deck[index];
    const swap = deck[swapIndex];

    if (current !== undefined && swap !== undefined) {
      deck[index] = swap;
      deck[swapIndex] = current;
    }
  }

  return deck;
}
