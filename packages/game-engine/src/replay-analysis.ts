import { getCardId, sortCards, type Card } from "./cards.js";
import { applyMove, type GameEvent, type GameRules, type GameState } from "./game.js";
import { generateLegalMoves } from "./legal-moves.js";
import type { Move } from "./moves.js";
import {
  evaluateMoveByRandomRollouts,
  type MoveEvaluation,
  type RolloutPolicy
} from "./simulation.js";

export type ReplayDecisionSeverity = "low" | "medium" | "high";

export type ReplayDecisionReview = {
  readonly turnNumber: number;
  readonly chosen: MoveEvaluation;
  readonly simulationFavorite: MoveEvaluation;
  readonly alternativesEvaluated: number;
  readonly placementLoss: number;
  readonly winRateLoss: number;
  readonly severity: ReplayDecisionSeverity;
};

export type ReplayDecisionReviewInput = {
  readonly finalState: GameState;
  readonly playerId: string;
  readonly rolloutsPerMove: number;
  readonly maxDecisions?: number;
  readonly maxMovesPerDecision?: number;
  readonly maxTurnsPerRollout?: number;
  readonly random?: () => number;
  readonly rules?: GameRules;
  readonly rolloutPolicy?: RolloutPolicy;
};

type ReplayDecisionSnapshot = {
  readonly event: GameEvent;
  readonly state: GameState;
};

const DEFAULT_MAX_DECISIONS = 4;
const DEFAULT_MAX_MOVES = 12;

export function analyzeReplayDecisions(
  input: ReplayDecisionReviewInput
): readonly ReplayDecisionReview[] {
  if (input.rolloutsPerMove <= 0) {
    throw new Error("Replay analysis requires at least one rollout per move.");
  }

  if (!input.finalState.players.some((player) => player.id === input.playerId)) {
    throw new Error("Replay analysis requires a known player.");
  }

  const snapshots = reconstructDecisionSnapshots(input.finalState, input.rules ?? {})
    .filter(({ event }) => event.playerId === input.playerId && event.legalMoveCount > 1)
    .sort(compareSnapshotSignal)
    .slice(0, Math.max(0, input.maxDecisions ?? DEFAULT_MAX_DECISIONS))
    .sort((left, right) => left.event.turnNumber - right.event.turnNumber);

  return snapshots.map(({ event, state }) =>
    evaluateReplayDecision({
      state,
      event,
      playerId: input.playerId,
      rolloutsPerMove: input.rolloutsPerMove,
      maxMoves: Math.max(2, input.maxMovesPerDecision ?? DEFAULT_MAX_MOVES),
      rolloutPolicy: input.rolloutPolicy ?? "heuristic-mixed",
      ...(input.maxTurnsPerRollout === undefined
        ? {}
        : { maxTurnsPerRollout: input.maxTurnsPerRollout }),
      ...(input.random === undefined ? {} : { random: input.random })
    })
  );
}

function reconstructDecisionSnapshots(
  finalState: GameState,
  rules: GameRules
): readonly ReplayDecisionSnapshot[] {
  const firstEvent = finalState.events[0];

  if (firstEvent === undefined) {
    return [];
  }

  let state: GameState = {
    players: finalState.players.map((player) => ({
      id: player.id,
      hand: reconstructStartingHand(player.id, player.hand, finalState.events)
    })),
    activePlayerId: firstEvent.playerId,
    currentTrick: null,
    turnNumber: 0,
    placements: [],
    status: "in-progress",
    events: []
  };
  const snapshots: ReplayDecisionSnapshot[] = [];

  for (const event of finalState.events) {
    if (state.turnNumber !== event.turnNumber || state.activePlayerId !== event.playerId) {
      throw new Error(`Replay event ${event.turnNumber} does not match reconstructed turn order.`);
    }

    snapshots.push({ event, state });
    const result = applyMove(state, event.playerId, event.move, rules);

    if (!result.ok) {
      throw new Error(`Replay event ${event.turnNumber} is invalid: ${result.reason}`);
    }

    state = result.state;
  }

  return snapshots;
}

function reconstructStartingHand(
  playerId: string,
  finalHand: readonly Card[],
  events: readonly GameEvent[]
): readonly Card[] {
  const playedCards = events.flatMap((event) =>
    event.playerId === playerId && event.move.type === "play" ? event.move.cards : []
  );

  return sortCards([...finalHand, ...playedCards]);
}

function evaluateReplayDecision(input: {
  readonly state: GameState;
  readonly event: GameEvent;
  readonly playerId: string;
  readonly rolloutsPerMove: number;
  readonly maxMoves: number;
  readonly maxTurnsPerRollout?: number;
  readonly random?: () => number;
  readonly rolloutPolicy: RolloutPolicy;
}): ReplayDecisionReview {
  const player = input.state.players.find((candidate) => candidate.id === input.playerId);

  if (player === undefined) {
    throw new Error("Replay decision belongs to an unknown player.");
  }

  const legalMoves = generateLegalMoves(player.hand, {
    isFirstMove: input.state.turnNumber === 0,
    currentTrick: input.state.currentTrick
  });
  const candidateMoves = [
    input.event.move,
    ...legalMoves.filter((move) => !areMovesEqual(move, input.event.move))
  ].slice(0, input.maxMoves);
  const evaluations = candidateMoves
    .map((move) =>
      evaluateMoveByRandomRollouts({
        state: input.state,
        playerId: input.playerId,
        move,
        rollouts: input.rolloutsPerMove,
        rolloutPolicy: input.rolloutPolicy,
        ...(input.maxTurnsPerRollout === undefined
          ? {}
          : { maxTurnsPerRollout: input.maxTurnsPerRollout }),
        ...(input.random === undefined ? {} : { random: input.random })
      })
    )
    .sort(compareEvaluations);
  const chosen = evaluations.find((evaluation) => areMovesEqual(evaluation.move, input.event.move));
  const simulationFavorite = evaluations[0];

  if (chosen === undefined || simulationFavorite === undefined) {
    throw new Error("Replay decision did not produce a simulation result.");
  }

  const placementLoss = Math.max(0, chosen.averagePlacement - simulationFavorite.averagePlacement);
  const winRateLoss = Math.max(0, simulationFavorite.winRate - chosen.winRate);

  return {
    turnNumber: input.event.turnNumber,
    chosen,
    simulationFavorite,
    alternativesEvaluated: evaluations.length,
    placementLoss,
    winRateLoss,
    severity: getDecisionSeverity(placementLoss, winRateLoss)
  };
}

function compareSnapshotSignal(
  left: ReplayDecisionSnapshot,
  right: ReplayDecisionSnapshot
): number {
  return getSnapshotSignal(right) - getSnapshotSignal(left);
}

function getSnapshotSignal({ event }: ReplayDecisionSnapshot): number {
  return (event.wasPass ? 1_000 : 0) + event.legalMoveCount * 10 + event.turnNumber;
}

function compareEvaluations(left: MoveEvaluation, right: MoveEvaluation): number {
  if (right.winRate !== left.winRate) {
    return right.winRate - left.winRate;
  }

  if (left.averagePlacement !== right.averagePlacement) {
    return left.averagePlacement - right.averagePlacement;
  }

  return getMoveCardCount(right.move) - getMoveCardCount(left.move);
}

function getDecisionSeverity(placementLoss: number, winRateLoss: number): ReplayDecisionSeverity {
  if (placementLoss >= 0.75 || winRateLoss >= 0.2) {
    return "high";
  }

  if (placementLoss >= 0.35 || winRateLoss >= 0.1) {
    return "medium";
  }

  return "low";
}

function areMovesEqual(left: Move, right: Move): boolean {
  if (left.type === "pass" || right.type === "pass") {
    return left.type === right.type;
  }

  if (left.cards.length !== right.cards.length) {
    return false;
  }

  const rightIds = new Set(right.cards.map(getCardId));
  return left.cards.every((card) => rightIds.has(getCardId(card)));
}

function getMoveCardCount(move: Move): number {
  return move.type === "pass" ? 0 : move.cards.length;
}
