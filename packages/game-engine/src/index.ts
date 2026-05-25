export {
  HIGHEST_CARD,
  LOWEST_CARD,
  RANKS,
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

export type { Card, CardId, Rank, Suit } from "./cards.js";

export { assertValidHand, canBeat, compareHands } from "./compare.js";

export type { HandComparisonResult } from "./compare.js";

export {
  detectHand,
  getHandPrimaryStrength,
  getStraightRankStrength,
  isValidHand
} from "./hands.js";

export type { HandAnalysis, HandDetectionResult, HandType, InvalidHand } from "./hands.js";
