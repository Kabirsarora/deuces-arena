import { detectHand, type HandType } from "./hands.js";
import type { GameEvent } from "./game.js";

export type ReplayTimelineItem = {
  readonly turnNumber: number;
  readonly playerId: string;
  readonly kind: "play" | "pass";
  readonly handType: HandType | null;
  readonly cardCount: number;
  readonly legalMoveCount: number;
  readonly cardsRemainingBefore: number;
  readonly cardsRemainingAfter: number;
};

export function createReplayTimeline(events: readonly GameEvent[]): readonly ReplayTimelineItem[] {
  return events.map((event) => {
    const handType = getEventHandType(event);

    return {
      turnNumber: event.turnNumber,
      playerId: event.playerId,
      kind: event.wasPass ? "pass" : "play",
      handType,
      cardCount: event.move.type === "play" ? event.move.cards.length : 0,
      legalMoveCount: event.legalMoveCount,
      cardsRemainingBefore: event.cardsRemainingBefore[event.playerId] ?? 0,
      cardsRemainingAfter: event.cardsRemainingAfter[event.playerId] ?? 0
    };
  });
}

function getEventHandType(event: GameEvent): HandType | null {
  if (event.move.type === "pass") {
    return null;
  }

  const hand = detectHand(event.move.cards);
  return hand.type === "invalid" ? null : hand.type;
}
