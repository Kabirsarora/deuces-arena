import { describe, expect, it } from "vitest";

import {
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
  sortCards
} from "./index.js";

describe("card ranking", () => {
  it("orders ranks from 3 lowest through 2 highest", () => {
    expect(compareRanks("3", "4")).toBeLessThan(0);
    expect(compareRanks("A", "2")).toBeLessThan(0);
    expect(compareRanks("2", "3")).toBeGreaterThan(0);
  });

  it("orders suits from diamonds lowest through spades highest", () => {
    expect(compareSuits("diamonds", "clubs")).toBeLessThan(0);
    expect(compareSuits("clubs", "hearts")).toBeLessThan(0);
    expect(compareSuits("hearts", "spades")).toBeLessThan(0);
  });

  it("treats 3 of diamonds as the lowest card", () => {
    const deck = createDeck();

    for (const card of deck) {
      if (getCardId(card) === getCardId(LOWEST_CARD)) {
        continue;
      }

      expect(compareCards(LOWEST_CARD, card)).toBeLessThan(0);
    }
  });

  it("treats 2 of spades as the highest card", () => {
    const deck = createDeck();

    for (const card of deck) {
      if (getCardId(card) === getCardId(HIGHEST_CARD)) {
        continue;
      }

      expect(compareCards(HIGHEST_CARD, card)).toBeGreaterThan(0);
    }
  });
});

describe("deck generation", () => {
  it("creates one card for every rank and suit combination", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(getCardId))).toHaveLength(52);
    expect(deck).toContainEqual(createCard("3", "diamonds"));
    expect(deck).toContainEqual(createCard("2", "spades"));
  });

  it("keeps rank and suit constants in rule order", () => {
    expect(RANKS).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]);
    expect(SUITS).toEqual(["diamonds", "clubs", "hearts", "spades"]);
  });

  it("sorts cards by rank first and suit second", () => {
    const cards = [
      createCard("2", "spades"),
      createCard("3", "clubs"),
      createCard("3", "diamonds"),
      createCard("A", "spades")
    ];

    expect(sortCards(cards)).toEqual([
      createCard("3", "diamonds"),
      createCard("3", "clubs"),
      createCard("A", "spades"),
      createCard("2", "spades")
    ]);
  });
});
