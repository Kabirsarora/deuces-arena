import { RANKS, getCardId, sortCards, type Card, type Rank } from "./cards.js";
import { validateMove, type Move, type MoveValidationContext, type PlayMove } from "./moves.js";

const STRAIGHT_RANKS = RANKS.filter((rank) => rank !== "2");

export function generateLegalMoves(
  hand: readonly Card[],
  context: MoveValidationContext
): readonly Move[] {
  const plays = generatePlayCandidates(hand, context).filter(
    (move) => validateMove(move, context).valid
  );

  if (validateMove({ type: "pass" }, context).valid) {
    return [{ type: "pass" }, ...plays];
  }

  return plays;
}

function generatePlayCandidates(
  hand: readonly Card[],
  context: MoveValidationContext
): readonly PlayMove[] {
  const cards = sortCards(hand);
  const cardsByRank = groupCardsByRank(cards);
  const targetType = context.currentTrick?.hand.type ?? null;
  const candidates: PlayMove[] = [];

  if (targetType === null || targetType === "single") {
    candidates.push(...cards.map(toPlayMove));
  }

  if (targetType === null || targetType === "pair") {
    candidates.push(...generateRankGroups(cardsByRank, 2));
  }

  if (targetType === null || targetType === "trips") {
    candidates.push(...generateRankGroups(cardsByRank, 3));
  }

  if (targetType === null || targetType === "quad") {
    candidates.push(...generateRankGroups(cardsByRank, 4));
  }

  if (targetType === null || targetType === "full-house") {
    candidates.push(...generateFullHouses(cardsByRank));
  }

  if (targetType === null || targetType === "straight") {
    const requiredLength =
      context.currentTrick?.hand.type === "straight" ? context.currentTrick.hand.length : null;
    candidates.push(...generateStraights(cardsByRank, requiredLength));
  }

  candidates.push(...generateBombs(cards, cardsByRank));
  return deduplicateMoves(candidates);
}

function generateRankGroups(
  cardsByRank: ReadonlyMap<Rank, readonly Card[]>,
  size: number
): PlayMove[] {
  return [...cardsByRank.values()].flatMap((cards) =>
    combinations(cards, size).map((group) => toPlayMove(group))
  );
}

function generateFullHouses(cardsByRank: ReadonlyMap<Rank, readonly Card[]>): PlayMove[] {
  const moves: PlayMove[] = [];

  for (const [tripleRank, tripleCards] of cardsByRank) {
    for (const triple of combinations(tripleCards, 3)) {
      for (const [pairRank, pairCards] of cardsByRank) {
        if (pairRank === tripleRank) {
          continue;
        }

        for (const pair of combinations(pairCards, 2)) {
          moves.push(toPlayMove([...triple, ...pair]));
        }
      }
    }
  }

  return moves;
}

function generateStraights(
  cardsByRank: ReadonlyMap<Rank, readonly Card[]>,
  requiredLength: number | null
): PlayMove[] {
  const maximumLength = Math.min(STRAIGHT_RANKS.length, cardsByRank.size);
  const lengths =
    requiredLength === null
      ? Array.from({ length: Math.max(0, maximumLength - 4) }, (_, index) => index + 5)
      : [requiredLength];
  const moves: PlayMove[] = [];

  for (const length of lengths) {
    if (length < 5 || length > STRAIGHT_RANKS.length) {
      continue;
    }

    for (let start = 0; start <= STRAIGHT_RANKS.length - length; start += 1) {
      const rankWindow = STRAIGHT_RANKS.slice(start, start + length);
      const cardOptions = rankWindow.map((rank) => cardsByRank.get(rank) ?? []);

      if (cardOptions.some((options) => options.length === 0)) {
        continue;
      }

      for (const straight of chooseOneFromEach(cardOptions)) {
        moves.push(toPlayMove(straight));
      }
    }
  }

  return moves;
}

function generateBombs(
  cards: readonly Card[],
  cardsByRank: ReadonlyMap<Rank, readonly Card[]>
): PlayMove[] {
  const moves: PlayMove[] = [];

  for (const [quadRank, rankCards] of cardsByRank) {
    for (const quad of combinations(rankCards, 4)) {
      for (const kicker of cards) {
        if (kicker.rank !== quadRank) {
          moves.push(toPlayMove([...quad, kicker]));
        }
      }
    }
  }

  return moves;
}

function groupCardsByRank(cards: readonly Card[]): ReadonlyMap<Rank, readonly Card[]> {
  const cardsByRank = new Map<Rank, Card[]>();

  for (const card of cards) {
    const rankCards = cardsByRank.get(card.rank) ?? [];
    rankCards.push(card);
    cardsByRank.set(card.rank, rankCards);
  }

  return cardsByRank;
}

function chooseOneFromEach(cardOptions: readonly (readonly Card[])[]): Card[][] {
  return cardOptions.reduce<Card[][]>(
    (partialHands, options) =>
      partialHands.flatMap((partialHand) => options.map((card) => [...partialHand, card])),
    [[]]
  );
}

function combinations<T>(values: readonly T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }

  if (values.length < size) {
    return [];
  }

  const [firstValue, ...remainingValues] = values;

  if (firstValue === undefined) {
    return [];
  }

  const withFirst = combinations(remainingValues, size - 1).map((combination) => [
    firstValue,
    ...combination
  ]);
  return [...withFirst, ...combinations(remainingValues, size)];
}

function deduplicateMoves(moves: readonly PlayMove[]): PlayMove[] {
  const uniqueMoves = new Map<string, PlayMove>();

  for (const move of moves) {
    const key = move.cards.map(getCardId).sort().join("|");
    uniqueMoves.set(key, move);
  }

  return [...uniqueMoves.values()];
}

function toPlayMove(cards: readonly Card[] | Card): PlayMove {
  return {
    type: "play",
    cards: Array.isArray(cards) ? cards : [cards]
  };
}
