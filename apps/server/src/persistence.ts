import {
  detectHand,
  summarizeGame,
  type GameEvent,
  type GameState
} from "@deuces-arena/game-engine";
import type { Prisma } from "@deuces-arena/db";
import type * as DbModule from "@deuces-arena/db";

type PersistableRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
};

export type PersistedMatch = {
  readonly matchId: string;
  readonly matchPlayerIds: Readonly<Record<string, string>>;
};

let dbModulePromise: Promise<typeof DbModule> | null = null;

export async function createPersistedMatch(
  roomCode: string,
  players: readonly PersistableRoomPlayer[]
): Promise<PersistedMatch | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const match = await db.prisma.match.create({
      data: {
        mode: "CASUAL",
        status: "IN_PROGRESS",
        roomCode,
        players: {
          create: players.map((player, index) => ({
            playerSeat: index,
            playerLabel: player.name,
            kind: toDbPlayerKind(player.kind)
          }))
        }
      },
      include: {
        players: true
      }
    });

    return {
      matchId: match.id,
      matchPlayerIds: Object.fromEntries(
        match.players.flatMap((matchPlayer) => {
          const roomPlayer = players[matchPlayer.playerSeat];
          return roomPlayer === undefined ? [] : [[roomPlayer.id, matchPlayer.id]];
        })
      )
    };
  } catch (error) {
    console.error("Unable to persist match start.", error);
    return null;
  }
}

export async function persistMoveEvent(
  persistedMatch: PersistedMatch | null,
  event: GameEvent
): Promise<void> {
  const db = await getDb();

  if (db === null || persistedMatch === null) {
    return;
  }

  const matchPlayerId = persistedMatch.matchPlayerIds[event.playerId];

  if (matchPlayerId === undefined) {
    return;
  }

  try {
    await db.prisma.moveEvent.create({
      data: {
        matchId: persistedMatch.matchId,
        matchPlayerId,
        turnNumber: event.turnNumber,
        kind: event.wasPass ? "PASS" : "PLAY",
        handType: getMoveHandType(event),
        cards: toPrismaJson(event.move.type === "play" ? event.move.cards : []),
        handBefore: toPrismaJson(event.handBefore),
        legalMoves: toPrismaJson({
          count: event.legalMoveCount,
          stored: false
        }),
        currentTrickBefore: toPrismaJson(event.currentTrickBefore),
        cardsRemainingBefore: toPrismaJson(event.cardsRemainingBefore),
        cardsRemainingAfter: toPrismaJson(event.cardsRemainingAfter)
      }
    });
  } catch (error) {
    console.error("Unable to persist move event.", error);
  }
}

export async function completePersistedMatch(
  persistedMatch: PersistedMatch | null,
  game: GameState
): Promise<void> {
  const db = await getDb();

  if (db === null || persistedMatch === null) {
    return;
  }

  const summaries = summarizeGame(game);
  const placementByPlayerId = getPlacementByPlayerId(game);

  try {
    await db.prisma.$transaction([
      db.prisma.match.update({
        where: {
          id: persistedMatch.matchId
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date()
        }
      }),
      ...summaries.flatMap((summary) => {
        const matchPlayerId = persistedMatch.matchPlayerIds[summary.playerId];

        if (matchPlayerId === undefined) {
          return [];
        }

        return [
          db.prisma.matchPlayer.update({
            where: {
              id: matchPlayerId
            },
            data: {
              placement: placementByPlayerId[summary.playerId] ?? null,
              cardsRemaining: summary.cardsRemaining,
              bombsPlayed: summary.bombsPlayed,
              averageMoveCount: summary.movesPlayed
            }
          })
        ];
      })
    ]);
  } catch (error) {
    console.error("Unable to persist match completion.", error);
  }
}

async function getDb(): Promise<typeof DbModule | null> {
  if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === "") {
    return null;
  }

  dbModulePromise ??= import("@deuces-arena/db");
  return dbModulePromise;
}

function toDbPlayerKind(kind: PersistableRoomPlayer["kind"]): "HUMAN" | "BOT" | "GUEST" {
  if (kind === "bot") {
    return "BOT";
  }

  if (kind === "guest") {
    return "GUEST";
  }

  return "HUMAN";
}

function getMoveHandType(event: GameEvent): string | null {
  if (event.move.type === "pass") {
    return null;
  }

  const hand = detectHand(event.move.cards);
  return hand.type === "invalid" ? null : hand.type;
}

function getPlacementByPlayerId(game: GameState): Readonly<Record<string, number>> {
  const orderedPlayers = [
    ...game.placements,
    ...game.players
      .filter((player) => !game.placements.includes(player.id))
      .sort((left, right) => left.hand.length - right.hand.length)
      .map((player) => player.id)
  ];

  return Object.fromEntries(orderedPlayers.map((playerId, index) => [playerId, index + 1]));
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
