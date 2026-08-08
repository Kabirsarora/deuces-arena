import { chooseBotMove } from "./bots.js";
import { applyMove, type GameState } from "./game.js";
import { generateLegalMoves } from "./legal-moves.js";
import type { Move } from "./moves.js";

export type SimulationStatus = "complete" | "max-turns-reached";
export type RolloutPolicy = "random-legal" | "heuristic-mixed";

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
  readonly rolloutPolicy?: RolloutPolicy;
  readonly explorationRate?: number;
};

export type MoveEvaluationInput = {
  readonly state: GameState;
  readonly playerId: string;
  readonly move: Move;
  readonly rollouts: number;
  readonly random?: () => number;
  readonly maxTurnsPerRollout?: number;
  readonly rolloutPolicy?: RolloutPolicy;
  readonly explorationRate?: number;
};

export type MoveEvaluation = {
  readonly move: Move;
  readonly rollouts: number;
  readonly wins: number;
  readonly winRate: number;
  readonly winRateLow: number;
  readonly winRateHigh: number;
  readonly averagePlacement: number;
  readonly completedRollouts: number;
  readonly completionRate: number;
  readonly rolloutPolicy: RolloutPolicy;
};

export type LegalMoveEvaluationInput = {
  readonly state: GameState;
  readonly playerId: string;
  readonly rolloutsPerMove: number;
  readonly maxMoves?: number;
  readonly random?: () => number;
  readonly maxTurnsPerRollout?: number;
  readonly rolloutPolicy?: RolloutPolicy;
  readonly explorationRate?: number;
};

export type SimulationBotDecisionInput = Omit<LegalMoveEvaluationInput, "rolloutsPerMove"> & {
  readonly rolloutsPerMove?: number;
};

const DEFAULT_MAX_TURNS = 500;
const DEFAULT_EXPLORATION_RATE = 0.2;

export function simulateRandomPlayout(input: RandomPlayoutInput): PlayoutResult {
  const random = input.random ?? Math.random;
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
  const rolloutPolicy = input.rolloutPolicy ?? "random-legal";
  const explorationRate = input.explorationRate ?? DEFAULT_EXPLORATION_RATE;

  if (explorationRate < 0 || explorationRate > 1) {
    throw new Error("Rollout exploration rate must be between 0 and 1.");
  }

  let state = input.state;
  let turnsSimulated = 0;

  while (state.status !== "complete" && turnsSimulated < maxTurns) {
    const activePlayer = state.players.find((player) => player.id === state.activePlayerId);

    if (activePlayer === undefined) {
      break;
    }

    const context = {
      isFirstMove: state.turnNumber === 0,
      currentTrick: state.currentTrick
    };
    const move = chooseRolloutMove({
      hand: activePlayer.hand,
      context,
      rolloutPolicy,
      explorationRate,
      random
    });
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
  let completedRollouts = 0;
  const rolloutPolicy = input.rolloutPolicy ?? "random-legal";

  for (let index = 0; index < input.rollouts; index += 1) {
    const result = simulateRandomPlayout({
      state: firstStep.state,
      random,
      rolloutPolicy,
      ...(input.explorationRate === undefined ? {} : { explorationRate: input.explorationRate }),
      ...(input.maxTurnsPerRollout === undefined
        ? {}
        : {
            maxTurns: input.maxTurnsPerRollout
          })
    });
    completedRollouts += result.status === "complete" ? 1 : 0;
    placements.push(getPlayerPlacement(result.placements, input.playerId));
  }

  const wins = placements.filter((placement) => placement === 1).length;
  const placementTotal = placements.reduce((sum, placement) => sum + placement, 0);
  const [winRateLow, winRateHigh] = getWilsonScoreInterval(wins, input.rollouts);

  return {
    move: input.move,
    rollouts: input.rollouts,
    wins,
    winRate: wins / input.rollouts,
    winRateLow,
    winRateHigh,
    averagePlacement: placementTotal / input.rollouts,
    completedRollouts,
    completionRate: completedRollouts / input.rollouts,
    rolloutPolicy
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
            }),
        ...(input.rolloutPolicy === undefined ? {} : { rolloutPolicy: input.rolloutPolicy }),
        ...(input.explorationRate === undefined ? {} : { explorationRate: input.explorationRate })
      })
    )
    .sort(compareMoveEvaluations);
}

export function chooseSimulationGuidedMove(
  input: SimulationBotDecisionInput
): MoveEvaluation | null {
  return (
    evaluateLegalMovesByRandomRollouts({
      ...input,
      rolloutsPerMove: input.rolloutsPerMove ?? 2,
      maxMoves: input.maxMoves ?? 8,
      maxTurnsPerRollout: input.maxTurnsPerRollout ?? 180,
      rolloutPolicy: input.rolloutPolicy ?? "heuristic-mixed",
      explorationRate: input.explorationRate ?? 0.15
    })[0] ?? null
  );
}

function chooseRolloutMove(input: {
  readonly hand: GameState["players"][number]["hand"];
  readonly context: Parameters<typeof chooseBotMove>[0]["context"];
  readonly rolloutPolicy: RolloutPolicy;
  readonly explorationRate: number;
  readonly random: () => number;
}): Move {
  const strategy =
    input.rolloutPolicy === "random-legal" || input.random() < input.explorationRate
      ? "random-legal"
      : "simple-heuristic";

  return chooseBotMove({
    hand: input.hand,
    context: input.context,
    strategy,
    random: input.random
  }).move;
}

function getWilsonScoreInterval(successes: number, attempts: number): readonly [number, number] {
  const z = 1.96;
  const proportion = successes / attempts;
  const denominator = 1 + (z * z) / attempts;
  const center = (proportion + (z * z) / (2 * attempts)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / attempts + (z * z) / (4 * attempts * attempts));

  return [Math.max(0, center - margin), Math.min(1, center + margin)];
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
