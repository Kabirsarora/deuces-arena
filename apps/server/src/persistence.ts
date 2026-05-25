import {
  calculatePlacementRatingChanges,
  detectHand,
  summarizeGame,
  type GameEvent,
  type GameState,
  type RatedPlayerResult
} from "@deuces-arena/game-engine";
import type { Prisma } from "@deuces-arena/db";
import type * as DbModule from "@deuces-arena/db";
import type { PublicGuestProfile, PublicLeaderboardEntry } from "@deuces-arena/shared";

type PersistableRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
  readonly guestId?: string | null;
};

export type PersistedMatch = {
  readonly matchId: string;
  readonly matchPlayerIds: Readonly<Record<string, string>>;
  readonly userIds: Readonly<Record<string, string>>;
  readonly ratingBeforeByPlayerId: Readonly<Record<string, number>>;
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
    const usersByPlayerId = await getUsersByPlayerId(db, players);
    const match = await db.prisma.match.create({
      data: {
        mode: "CASUAL",
        status: "IN_PROGRESS",
        roomCode,
        players: {
          create: players.map((player, index) => {
            const user = usersByPlayerId[player.id];

            return {
              playerSeat: index,
              playerLabel: player.name,
              kind: toDbPlayerKind(player.kind),
              ratingBefore: user?.rating ?? 1000,
              ...(user === undefined
                ? {}
                : {
                    userId: user.id
                  })
            };
          })
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
      ),
      userIds: Object.fromEntries(
        Object.entries(usersByPlayerId).map(([playerId, user]) => [playerId, user.id])
      ),
      ratingBeforeByPlayerId: Object.fromEntries(
        players.map((player) => [player.id, usersByPlayerId[player.id]?.rating ?? 1000])
      )
    };
  } catch (error) {
    console.error("Unable to persist match start.", error);
    return null;
  }
}

export async function getPersistedGuestProfile(
  guestId: string
): Promise<PublicGuestProfile | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const user = await db.prisma.user.findUnique({
      where: {
        guestId
      },
      select: {
        guestId: true,
        rating: true,
        gamesPlayed: true,
        wins: true,
        placementTotal: true
      }
    });

    if (user?.guestId === null || user?.guestId === undefined) {
      return null;
    }

    return {
      guestId: user.guestId,
      rating: user.rating,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      averagePlacement: user.gamesPlayed === 0 ? null : user.placementTotal / user.gamesPlayed
    };
  } catch (error) {
    console.error("Unable to read guest profile.", error);
    return null;
  }
}

export async function getPersistedLeaderboard(
  limit: number
): Promise<readonly PublicLeaderboardEntry[] | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const users = await db.prisma.user.findMany({
      where: {
        guestId: {
          not: null
        },
        gamesPlayed: {
          gt: 0
        }
      },
      orderBy: [
        {
          rating: "desc"
        },
        {
          wins: "desc"
        }
      ],
      take: limit,
      select: {
        guestId: true,
        displayName: true,
        rating: true,
        gamesPlayed: true,
        wins: true,
        placementTotal: true
      }
    });

    return users.flatMap((user) =>
      user.guestId === null
        ? []
        : [
            {
              guestId: user.guestId,
              displayName: user.displayName,
              rating: user.rating,
              gamesPlayed: user.gamesPlayed,
              wins: user.wins,
              averagePlacement:
                user.gamesPlayed === 0 ? null : user.placementTotal / user.gamesPlayed
            }
          ]
    );
  } catch (error) {
    console.error("Unable to read leaderboard.", error);
    return null;
  }
}

export async function persistMoveEvent(
  persistedMatch: PersistedMatch | null,
  event: GameEvent,
  game: GameState
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
        cardsRemainingAfter: toPrismaJson(event.cardsRemainingAfter),
        placement:
          game.status === "complete"
            ? (getPlacementByPlayerId(game)[event.playerId] ?? null)
            : null,
        ...(game.status === "complete"
          ? {
              gameResult: createGameResult(game)
            }
          : {})
      }
    });
  } catch (error) {
    console.error("Unable to persist move event.", error);
  }
}

function createGameResult(game: GameState): Prisma.InputJsonValue {
  const summaries = summarizeGame(game);
  const placementByPlayerId = getPlacementByPlayerId(game);

  return toPrismaJson({
    status: game.status,
    placements: placementByPlayerId,
    players: summaries
  });
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
  const ratingChanges = calculatePersistedRatingChanges(persistedMatch, game);

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
              ratingAfter:
                ratingChanges.find((change) => change.playerId === summary.playerId)?.ratingAfter ??
                null,
              cardsRemaining: summary.cardsRemaining,
              bombsPlayed: summary.bombsPlayed,
              averageMoveCount: summary.movesPlayed
            }
          })
        ];
      }),
      ...ratingChanges.flatMap((change) => {
        const userId = persistedMatch.userIds[change.playerId];

        if (userId === undefined) {
          return [];
        }

        return [
          db.prisma.user.update({
            where: {
              id: userId
            },
            data: {
              rating: change.ratingAfter,
              gamesPlayed: {
                increment: 1
              },
              wins: {
                increment: change.placement === 1 ? 1 : 0
              },
              losses: {
                increment: change.placement === 4 ? 1 : 0
              },
              placementTotal: {
                increment: change.placement
              }
            }
          })
        ];
      })
    ]);
  } catch (error) {
    console.error("Unable to persist match completion.", error);
  }
}

async function getUsersByPlayerId(
  db: typeof DbModule,
  players: readonly PersistableRoomPlayer[]
): Promise<Readonly<Record<string, { readonly id: string; readonly rating: number }>>> {
  const entries = await Promise.all(
    players.flatMap((player) => {
      if (player.guestId === undefined || player.guestId === null || player.guestId.trim() === "") {
        return [];
      }

      const guestId = player.guestId.trim();

      return [
        db.prisma.user
          .upsert({
            where: {
              guestId
            },
            create: {
              username: `guest:${guestId}`,
              guestId,
              displayName: player.name
            },
            update: {
              displayName: player.name
            },
            select: {
              id: true,
              rating: true
            }
          })
          .then((user) => [player.id, user] as const)
      ];
    })
  );

  return Object.fromEntries(entries);
}

function calculatePersistedRatingChanges(persistedMatch: PersistedMatch, game: GameState) {
  const placementByPlayerId = getPlacementByPlayerId(game);
  const ratedResults: RatedPlayerResult[] = Object.entries(
    persistedMatch.ratingBeforeByPlayerId
  ).flatMap(([playerId, ratingBefore]) => {
    const placement = placementByPlayerId[playerId];

    if (placement !== 1 && placement !== 2 && placement !== 3 && placement !== 4) {
      return [];
    }

    return [
      {
        playerId,
        ratingBefore,
        placement
      }
    ];
  });

  if (ratedResults.length !== 4) {
    return [];
  }

  return calculatePlacementRatingChanges(ratedResults);
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
