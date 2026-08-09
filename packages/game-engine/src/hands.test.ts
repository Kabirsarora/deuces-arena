import { describe, expect, it } from "vitest";

import { createCard, detectHand, isValidHand } from "./index.js";

describe("hand detection", () => {
  it("detects a single card", () => {
    expect(detectHand([createCard("3", "diamonds")])).toMatchObject({
      type: "single",
      primaryRank: "3",
      highestCard: createCard("3", "diamonds")
    });
  });

  it("detects a pair", () => {
    expect(detectHand([createCard("K", "diamonds"), createCard("K", "spades")])).toMatchObject({
      type: "pair",
      primaryRank: "K",
      highestCard: createCard("K", "spades")
    });
  });

  it("detects trips", () => {
    expect(
      detectHand([createCard("7", "diamonds"), createCard("7", "clubs"), createCard("7", "hearts")])
    ).toMatchObject({
      type: "trips",
      primaryRank: "7",
      highestCard: createCard("7", "hearts")
    });
  });

  it("detects quads", () => {
    expect(
      detectHand([
        createCard("A", "diamonds"),
        createCard("A", "clubs"),
        createCard("A", "hearts"),
        createCard("A", "spades")
      ])
    ).toMatchObject({
      type: "quad",
      primaryRank: "A",
      highestCard: createCard("A", "spades")
    });
  });

  it("detects full houses by the triple rank", () => {
    expect(
      detectHand([
        createCard("9", "diamonds"),
        createCard("9", "clubs"),
        createCard("9", "spades"),
        createCard("4", "diamonds"),
        createCard("4", "hearts")
      ])
    ).toMatchObject({
      type: "full-house",
      primaryRank: "9",
      tripleRank: "9",
      pairRank: "4"
    });
  });

  it("detects 5-card straights", () => {
    expect(
      detectHand([
        createCard("3", "diamonds"),
        createCard("4", "clubs"),
        createCard("5", "hearts"),
        createCard("6", "spades"),
        createCard("7", "diamonds")
      ])
    ).toMatchObject({
      type: "straight",
      length: 5,
      primaryRank: "7"
    });
  });

  it("detects longer straights", () => {
    expect(
      detectHand([
        createCard("6", "diamonds"),
        createCard("7", "clubs"),
        createCard("8", "hearts"),
        createCard("9", "spades"),
        createCard("10", "diamonds"),
        createCard("J", "clubs"),
        createCard("Q", "hearts")
      ])
    ).toMatchObject({
      type: "straight",
      length: 7,
      primaryRank: "Q"
    });
  });

  it("detects bombs as four of a kind plus one kicker", () => {
    expect(
      detectHand([
        createCard("5", "diamonds"),
        createCard("5", "clubs"),
        createCard("5", "hearts"),
        createCard("5", "spades"),
        createCard("K", "diamonds")
      ])
    ).toMatchObject({
      type: "bomb",
      primaryRank: "5",
      quadRank: "5",
      kicker: createCard("K", "diamonds")
    });
  });

  it("supports Arena 6 quads using any four suits", () => {
    expect(
      detectHand([
        createCard("8", "clubs"),
        createCard("8", "hearts"),
        createCard("8", "stars"),
        createCard("8", "crowns")
      ])
    ).toMatchObject({
      type: "quad",
      primaryRank: "8",
      highestCard: createCard("8", "crowns")
    });
  });

  it("keeps Arena 6 bombs at four matching cards plus an off-rank kicker", () => {
    expect(
      detectHand([
        createCard("9", "diamonds"),
        createCard("9", "spades"),
        createCard("9", "stars"),
        createCard("9", "crowns"),
        createCard("A", "hearts")
      ])
    ).toMatchObject({
      type: "bomb",
      quadRank: "9",
      kicker: createCard("A", "hearts")
    });
    expect(
      isValidHand([
        createCard("9", "diamonds"),
        createCard("9", "clubs"),
        createCard("9", "hearts"),
        createCard("9", "spades"),
        createCard("9", "stars")
      ])
    ).toBe(false);
  });

  it("rejects duplicate cards", () => {
    expect(isValidHand([createCard("3", "diamonds"), createCard("3", "diamonds")])).toBe(false);
  });

  it("rejects unsupported combinations", () => {
    expect(isValidHand([createCard("3", "diamonds"), createCard("4", "clubs")])).toBe(false);
  });

  it("rejects straights containing 2 in the default rules", () => {
    expect(
      isValidHand([
        createCard("J", "diamonds"),
        createCard("Q", "clubs"),
        createCard("K", "hearts"),
        createCard("A", "spades"),
        createCard("2", "diamonds")
      ])
    ).toBe(false);
  });
});
