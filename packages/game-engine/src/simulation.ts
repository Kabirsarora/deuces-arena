import { applyMove, type GameState } from "./game.js";
import { generateLegalMoves } from "./legal-moves.js";
import type { Move } from "./moves.js";

export type SimulationStatus = "complete" | "max-turns-reached";

export type PlayoutResult = {
  readonly finalState: GameState;
  readonly status: SimulationStatus;
  readonly turnsSimulated: number;
  readonly placements: readonly string[];
};

export type RandomPlayoutInput = {
  readonly state: GameState;
  readonly random?: () => number;
  readonly maxTurns?: number;
};

export type MoveEvaluationInput = {
  readonly state: GameState;
  readonly playerId: string;
  readonly move: Move;
  readonly rollouts: number;
  readonly random?: () => number;
  readonly maxTurnsPerRollout?: number;
};

export type MoveEvaluation = {
  readonly move: Move;
  readonly rollouts: number;
  readonly wins: number;
  readonly winRate: number;
  readonly averagePlacement: number;
};

export type LegalMoveEvaluationInput = {
  readonly state: GameState;
  readonly playerId: string;
  readonly rolloutsPerMove: number;
  readonly maxMoves?: number;
  readonly random?: () => number;
  readonly maxTurnsPerRollout?: number;
};

const DEFAULT_MAX_TURNS = 500;

export function simulateRandomPlayout(input: RandomPlayoutInput): PlayoutResult {
  const random = input.random ?? Math.random;
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
  let state = input.state;
  let turnsSimulated = 0;

  while (state.status !== "complete" && turnsSimulated < maxTurns) {
    const activePlayer = state.players.find((player) => player.id === state.activePlayerId);

    if (activePlayer === undefined) {
      break;
    }

    const legalMoves = generateLegalMoves(activePlayer.hand, {
      isFirstMove: state.turnNumber === 0,
      currentTrick: state.currentTrick
    });
    const move = chooseRandomMove(legalMoves, random);
    const result = applyMove(state, activePlayer.id, move);

    if (!result.ok) {
      break;
    }

    state = result.state;
    turnsSimulated += 1;
  }

  return {
    finalState: state,
    status: state.status === "complete" ? "complete" : "max-turns-reached",
    turnsSimulated,
    placements: inferPlacements(state)
  };
}

export function evaluateMoveByRandomRollouts(input: MoveEvaluationInput): MoveEvaluation {
  if (input.rollouts <= 0) {
    throw new Error("Move evaluation requires at least one rollout.");
  }

  const firstStep = applyMove(input.state, input.playerId, input.move);

  if (!firstStep.ok) {
    throw new Error(firstStep.reason);
  }

  const random = input.random ?? Math.random;
  const placements: number[] = [];

  for (let index = 0; index < input.rollouts; index += 1) {
    const result = simulateRandomPlayout({
      state: firstStep.state,
      random,
      ...(input.maxTurnsPerRollout === undefined
        ? {}
        : {
            maxTurns: input.maxTurnsPerRollout
          })
    });
    placements.push(getPlayerPlacement(result.placements, input.playerId));
  }

  const wins = placements.filter((placement) => placement === 1).length;
  const placementTotal = placements.reduce((sum, placement) => sum + placement, 0);

  return {
    move: input.move,
    rollouts: input.rollouts,
    wins,
    winRate: wins / input.rollouts,
    averagePlacement: placementTotal / input.rollouts
  };
}

export function evaluateLegalMovesByRandomRollouts(
  input: LegalMoveEvaluationInput
): readonly MoveEvaluation[] {
  if (input.rolloutsPerMove <= 0) {
    throw new Error("Legal move evaluation requires at least one rollout per move.");
  }

  if (input.state.activePlayerId !== input.playerId) {
    throw new Error("Legal move evaluation can only run for the active player.");
  }

  const player = input.state.players.find((candidate) => candidate.id === input.playerId);

  if (player === undefined) {
    throw new Error("Unknown player.");
  }

  const legalMoves = generateLegalMoves(player.hand, {
    isFirstMove: input.state.turnNumber === 0,
    currentTrick: input.state.currentTrick
  });
  const movesToEvaluate =
    input.maxMoves === undefined ? legalMoves : legalMoves.slice(0, Math.max(0, input.maxMoves));

  return movesToEvaluate
    .map((move) =>
      evaluateMoveByRandomRollouts({
        state: input.state,
        playerId: input.playerId,
        move,
        rollouts: input.rolloutsPerMove,
        ...(input.random === undefined
          ? {}
          : {
              random: input.random
            }),
        ...(input.maxTurnsPerRollout === undefined
          ? {}
          : {
              maxTurnsPerRollout: input.maxTurnsPerRollout
            })
      })
    )
    .sort(compareMoveEvaluations);
}

function chooseRandomMove(moves: readonly Move[], random: () => number): Move {
  if (moves.length === 0) {
    return {
      type: "pass"
    };
  }

  const index = Math.min(Math.floor(random() * moves.length), moves.length - 1);
  return (
    moves[index] ?? {
      type: "pass"
    }
  );
}

function compareMoveEvaluations(left: MoveEvaluation, right: MoveEvaluation): number {
  if (right.winRate !== left.winRate) {
    return right.winRate - left.winRate;
  }

  if (left.averagePlacement !== right.averagePlacement) {
    return left.averagePlacement - right.averagePlacement;
  }

  return getMoveCardCount(right.move) - getMoveCardCount(left.move);
}

function getMoveCardCount(move: Move): number {
  return move.type === "pass" ? 0 : move.cards.length;
}

function inferPlacements(state: GameState): readonly string[] {
  return [
    ...state.placements,
    ...state.players
      .filter((player) => !state.placements.includes(player.id))
      .sort((left, right) => left.hand.length - right.hand.length)
      .map((player) => player.id)
  ];
}

function getPlayerPlacement(placements: readonly string[], playerId: string): number {
  const index = placements.indexOf(playerId);
  return index === -1 ? placements.length : index + 1;
}
