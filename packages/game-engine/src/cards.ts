export const CLASSIC_SUITS = ["diamonds", "clubs", "hearts", "spades"] as const;
export const ARENA_SUITS = ["diamonds", "clubs", "hearts", "spades", "stars", "crowns"] as const;
export const SUITS = CLASSIC_SUITS;
export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"] as const;

export type Suit = (typeof ARENA_SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type DeckType = "classic" | "arena-six";

export type Card = {
  readonly rank: Rank;
  readonly suit: Suit;
};

export type CardId = `${Rank}-${Suit}`;

const rankStrength = new Map<Rank, number>(RANKS.map((rank, index) => [rank, index]));
const suitStrength = new Map<Suit, number>(ARENA_SUITS.map((suit, index) => [suit, index]));

export const LOWEST_CARD: Card = {
  rank: "3",
  suit: "diamonds"
};

export const HIGHEST_CARD: Card = {
  rank: "2",
  suit: "spades"
};

export const ARENA_HIGHEST_CARD: Card = {
  rank: "2",
  suit: "crowns"
};

export function createCard(rank: Rank, suit: Suit): Card {
  return {
    rank,
    suit
  };
}

export function getCardId(card: Card): CardId {
  return `${card.rank}-${card.suit}`;
}

export function getRankStrength(rank: Rank): number {
  const strength = rankStrength.get(rank);

  if (strength === undefined) {
    throw new Error(`Unknown rank: ${rank}`);
  }

  return strength;
}

export function getSuitStrength(suit: Suit): number {
  const strength = suitStrength.get(suit);

  if (strength === undefined) {
    throw new Error(`Unknown suit: ${suit}`);
  }

  return strength;
}

export function compareRanks(left: Rank, right: Rank): number {
  return getRankStrength(left) - getRankStrength(right);
}

export function compareSuits(left: Suit, right: Suit): number {
  return getSuitStrength(left) - getSuitStrength(right);
}

export function compareCards(left: Card, right: Card): number {
  const rankComparison = compareRanks(left.rank, right.rank);

  if (rankComparison !== 0) {
    return rankComparison;
  }

  return compareSuits(left.suit, right.suit);
}

export function isSameCard(left: Card, right: Card): boolean {
  return left.rank === right.rank && left.suit === right.suit;
}

export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort(compareCards);
}

export function createDeck(deckType: DeckType = "classic"): Card[] {
  const suits = deckType === "arena-six" ? ARENA_SUITS : CLASSIC_SUITS;
  return RANKS.flatMap((rank) => suits.map((suit) => createCard(rank, suit)));
}
