import { RANKS, compareCards, getRankStrength, sortCards, type Card, type Rank } from "./cards.js";

export type HandType = "single" | "pair" | "trips" | "quad" | "full-house" | "straight" | "bomb";

export type HandAnalysis =
  | {
      readonly type: "single";
      readonly cards: readonly Card[];
      readonly primaryRank: Rank;
      readonly highestCard: Card;
    }
  | {
      readonly type: "pair" | "trips" | "quad";
      readonly cards: readonly Card[];
      readonly primaryRank: Rank;
      readonly highestCard: Card;
    }
  | {
      readonly type: "full-house";
      readonly cards: readonly Card[];
      readonly primaryRank: Rank;
      readonly tripleRank: Rank;
      readonly pairRank: Rank;
      readonly highestCard: Card;
    }
  | {
      readonly type: "straight";
      readonly cards: readonly Card[];
      readonly length: number;
      readonly primaryRank: Rank;
      readonly highestCard: Card;
    }
  | {
      readonly type: "bomb";
      readonly cards: readonly Card[];
      readonly primaryRank: Rank;
      readonly quadRank: Rank;
      readonly kicker: Card;
      readonly highestCard: Card;
    };

export type InvalidHand = {
  readonly type: "invalid";
  readonly reason: string;
};

export type HandDetectionResult = HandAnalysis | InvalidHand;

const STRAIGHT_RANKS: readonly Rank[] = RANKS.filter((rank) => rank !== "2");

export function detectHand(cards: readonly Card[]): HandDetectionResult {
  if (cards.length === 0) {
    return {
      type: "invalid",
      reason: "A hand must include at least one card."
    };
  }

  if (hasDuplicateCards(cards)) {
    return {
      type: "invalid",
      reason: "A hand cannot include duplicate cards."
    };
  }

  const sortedCards = sortCards(cards);
  const rankGroups = groupCardsByRank(sortedCards);

  if (cards.length === 1) {
    const [card] = sortedCards;

    if (card === undefined) {
      return {
        type: "invalid",
        reason: "Unable to evaluate single-card hand."
      };
    }

    return {
      type: "single",
      cards: sortedCards,
      primaryRank: card.rank,
      highestCard: card
    };
  }

  if (rankGroups.size === 1) {
    const primaryRank = sortedCards[0]?.rank;
    const highestCard = sortedCards.at(-1);

    if (primaryRank === undefined || highestCard === undefined) {
      return {
        type: "invalid",
        reason: "Unable to evaluate grouped hand."
      };
    }

    if (cards.length === 2) {
      return {
        type: "pair",
        cards: sortedCards,
        primaryRank,
        highestCard
      };
    }

    if (cards.length === 3) {
      return {
        type: "trips",
        cards: sortedCards,
        primaryRank,
        highestCard
      };
    }

    if (cards.length === 4) {
      return {
        type: "quad",
        cards: sortedCards,
        primaryRank,
        highestCard
      };
    }
  }

  if (cards.length === 5) {
    const bomb = detectBomb(sortedCards, rankGroups);

    if (bomb !== undefined) {
      return bomb;
    }

    const fullHouse = detectFullHouse(sortedCards, rankGroups);

    if (fullHouse !== undefined) {
      return fullHouse;
    }
  }

  if (cards.length >= 5) {
    const straight = detectStraight(sortedCards, rankGroups);

    if (straight !== undefined) {
      return straight;
    }
  }

  return {
    type: "invalid",
    reason: "Cards do not form a supported hand type."
  };
}

export function isValidHand(cards: readonly Card[]): boolean {
  return detectHand(cards).type !== "invalid";
}

function detectBomb(
  cards: readonly Card[],
  rankGroups: Map<Rank, Card[]>
): HandAnalysis | undefined {
  const quadEntry = [...rankGroups.entries()].find(([, group]) => group.length === 4);

  if (quadEntry === undefined || cards.length !== 5 || rankGroups.size !== 2) {
    return undefined;
  }

  const [quadRank, quadCards] = quadEntry;
  const kicker = cards.find((card) => card.rank !== quadRank);
  const highestCard = sortCards(quadCards).at(-1);

  if (kicker === undefined || highestCard === undefined) {
    return undefined;
  }

  return {
    type: "bomb",
    cards,
    primaryRank: quadRank,
    quadRank,
    kicker,
    highestCard
  };
}

function detectFullHouse(
  cards: readonly Card[],
  rankGroups: Map<Rank, Card[]>
): HandAnalysis | undefined {
  if (rankGroups.size !== 2) {
    return undefined;
  }

  const tripleEntry = [...rankGroups.entries()].find(([, group]) => group.length === 3);
  const pairEntry = [...rankGroups.entries()].find(([, group]) => group.length === 2);

  if (tripleEntry === undefined || pairEntry === undefined) {
    return undefined;
  }

  const [tripleRank, tripleCards] = tripleEntry;
  const [pairRank] = pairEntry;
  const highestCard = sortCards(tripleCards).at(-1);

  if (highestCard === undefined) {
    return undefined;
  }

  return {
    type: "full-house",
    cards,
    primaryRank: tripleRank,
    tripleRank,
    pairRank,
    highestCard
  };
}

function detectStraight(
  cards: readonly Card[],
  rankGroups: Map<Rank, Card[]>
): HandAnalysis | undefined {
  if (rankGroups.size !== cards.length) {
    return undefined;
  }

  if (cards.some((card) => !STRAIGHT_RANKS.includes(card.rank))) {
    return undefined;
  }

  const rankIndexes = cards
    .map((card) => STRAIGHT_RANKS.indexOf(card.rank))
    .sort((left, right) => left - right);
  const startsAt = rankIndexes[0];

  if (startsAt === undefined) {
    return undefined;
  }

  const isConsecutive = rankIndexes.every((rankIndex, offset) => rankIndex === startsAt + offset);

  if (!isConsecutive) {
    return undefined;
  }

  const highestCard = cards.reduce((highest, card) =>
    compareCards(card, highest) > 0 ? card : highest
  );

  return {
    type: "straight",
    cards,
    length: cards.length,
    primaryRank: highestCard.rank,
    highestCard
  };
}

function hasDuplicateCards(cards: readonly Card[]): boolean {
  return new Set(cards.map((card) => `${card.rank}-${card.suit}`)).size !== cards.length;
}

function groupCardsByRank(cards: readonly Card[]): Map<Rank, Card[]> {
  const rankGroups = new Map<Rank, Card[]>();

  for (const card of cards) {
    const rankCards = rankGroups.get(card.rank) ?? [];
    rankGroups.set(card.rank, [...rankCards, card]);
  }

  return rankGroups;
}

export function getStraightRankStrength(rank: Rank): number {
  return STRAIGHT_RANKS.includes(rank) ? STRAIGHT_RANKS.indexOf(rank) : -1;
}

export function getHandPrimaryStrength(hand: HandAnalysis): number {
  if (hand.type === "straight") {
    return getStraightRankStrength(hand.primaryRank);
  }

  return getRankStrength(hand.primaryRank);
}
