export {
  HIGHEST_CARD,
  LOWEST_CARD,
  RANKS,
  ARENA_HIGHEST_CARD,
  ARENA_SUITS,
  CLASSIC_SUITS,
  SUITS,
  compareCards,
  compareRanks,
  compareSuits,
  createCard,
  createDeck,
  getCardId,
  getRankStrength,
  getSuitStrength,
  isSameCard,
  sortCards
} from "./cards.js";

export type { Card, CardId, DeckType, Rank, Suit } from "./cards.js";

export { chooseBotMove } from "./bots.js";

export type { BotDecision, BotDecisionInput, BotStrategy } from "./bots.js";

export { assertValidHand, canBeat, compareHands } from "./compare.js";

export type { HandComparisonResult } from "./compare.js";

export {
  detectHand,
  getHandPrimaryStrength,
  getStraightRankStrength,
  isValidHand
} from "./hands.js";

export type { HandAnalysis, HandDetectionResult, HandType, InvalidHand } from "./hands.js";

export { applyMove, createInitialGame, summarizeGame } from "./game.js";

export type {
  GameActionResult,
  GameEvent,
  InitialGameOptions,
  GameState,
  GameStatus,
  PlayerGameSummary,
  PlayerState
} from "./game.js";

export { generateLegalMoves } from "./legal-moves.js";

export { calculatePlacementRatingChanges } from "./rating.js";

export type { RatedPlayerResult, RatingChange } from "./rating.js";

export { createReplayTimeline } from "./replay.js";

export type { ReplayTimelineItem } from "./replay.js";

export {
  evaluateLegalMovesByRandomRollouts,
  evaluateMoveByRandomRollouts,
  simulateRandomPlayout
} from "./simulation.js";

export type {
  LegalMoveEvaluationInput,
  MoveEvaluation,
  MoveEvaluationInput,
  PlayoutResult,
  RandomPlayoutInput,
  SimulationStatus
} from "./simulation.js";

export { validateMove } from "./moves.js";

export type {
  CurrentTrick,
  Move,
  MoveValidationContext,
  MoveValidationResult,
  PassMove,
  PlayMove
} from "./moves.js";
