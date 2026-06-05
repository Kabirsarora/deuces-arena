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
import type {
  FeedbackKind,
  MatchMode,
  PublicCoachEvaluationRecord,
  PublicCosmetic,
  PublicFeedbackReceipt,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicMatchHistoryItem,
  ProfileAvatarKey
} from "@deuces-arena/shared";

type PersistableRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
  readonly guestId?: string | null;
};

export type PersistedMatch = {
  readonly matchId: string;
  readonly roomCode: string;
  readonly mode: MatchMode;
  readonly matchPlayerIds: Readonly<Record<string, string>>;
  readonly userIds: Readonly<Record<string, string>>;
  readonly ratingBeforeByPlayerId: Readonly<Record<string, number>>;
};

export type EquipCosmeticResult =
  | {
      readonly ok: true;
      readonly profile: PublicGuestProfile;
    }
  | {
      readonly ok: false;
      readonly reason: "database-unavailable" | "profile-not-found" | "cosmetic-not-owned";
    };

export type PurchaseCosmeticResult =
  | {
      readonly ok: true;
      readonly profile: PublicGuestProfile;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "database-unavailable"
        | "profile-not-found"
        | "cosmetic-not-found"
        | "cosmetic-not-purchasable"
        | "cosmetic-already-owned"
        | "insufficient-coins";
    };

export type UpdateProfileResult =
  | {
      readonly ok: true;
      readonly profile: PublicGuestProfile;
    }
  | {
      readonly ok: false;
      readonly reason: "database-unavailable";
    };

export type SaveReplayLabelResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: "database-unavailable" | "profile-not-found" | "match-not-found";
    };

type CosmeticProgressionStats = {
  readonly gamesPlayed: number;
  readonly wins: number;
};

const ARENA_COIN_REWARDS: Readonly<Record<"first" | "second" | "third" | "other", number>> = {
  first: 120,
  second: 80,
  third: 50,
  other: 25
};

const COSMETIC_UNLOCK_RULES: readonly {
  readonly slug: string;
  readonly source: "EARNED";
  readonly isUnlocked: (stats: CosmeticProgressionStats) => boolean;
}[] = [
  {
    slug: "classic-red-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.gamesPlayed >= 1
  },
  {
    slug: "midnight-felt-table",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 1
  }
];

export function getEarnedCosmeticUnlockSlugs(stats: CosmeticProgressionStats): readonly string[] {
  return COSMETIC_UNLOCK_RULES.filter((rule) => rule.isUnlocked(stats)).map((rule) => rule.slug);
}

let dbModulePromise: Promise<typeof DbModule> | null = null;

export async function createPersistedMatch(
  roomCode: string,
  players: readonly PersistableRoomPlayer[],
  mode: MatchMode = "CASUAL"
): Promise<PersistedMatch | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const usersByPlayerId = await getUsersByPlayerId(db, players);
    const match = await db.prisma.match.create({
      data: {
        mode,
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
      roomCode,
      mode,
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
        displayName: true,
        avatarKey: true,
        rating: true,
        gamesPlayed: true,
        wins: true,
        arenaCoins: true,
        placementTotal: true,
        cosmeticUnlocks: {
          orderBy: {
            earnedAt: "desc"
          },
          select: {
            source: true,
            earnedAt: true,
            cosmetic: {
              select: {
                id: true,
                slug: true,
                kind: true,
                name: true,
                description: true,
                rarity: true,
                isSupporter: true,
                coinPrice: true,
                previewUrl: true
              }
            }
          }
        },
        equippedCosmetics: {
          orderBy: {
            equippedAt: "desc"
          },
          select: {
            kind: true,
            equippedAt: true,
            cosmetic: {
              select: {
                id: true,
                slug: true,
                kind: true,
                name: true,
                description: true,
                rarity: true,
                isSupporter: true,
                coinPrice: true,
                previewUrl: true
              }
            }
          }
        }
      }
    });

    if (user?.guestId === null || user?.guestId === undefined) {
      return null;
    }

    return {
      guestId: user.guestId,
      displayName: user.displayName,
      avatarKey: toProfileAvatarKey(user.avatarKey),
      rating: user.rating,
      gamesPlayed: user.gamesPlayed,
      wins: user.wins,
      averagePlacement: user.gamesPlayed === 0 ? null : user.placementTotal / user.gamesPlayed,
      arenaCoins: user.arenaCoins,
      isAdmin: false,
      unlocks: user.cosmeticUnlocks.map((unlock) => ({
        cosmetic: unlock.cosmetic,
        source: unlock.source,
        earnedAt: unlock.earnedAt.toISOString()
      })),
      equippedCosmetics: user.equippedCosmetics.map((equippedCosmetic) => ({
        kind: equippedCosmetic.kind,
        cosmetic: equippedCosmetic.cosmetic,
        equippedAt: equippedCosmetic.equippedAt.toISOString()
      }))
    };
  } catch (error) {
    console.error("Unable to read guest profile.", error);
    return null;
  }
}

export async function updatePersistedGuestProfile(input: {
  readonly guestId: string;
  readonly displayName: string;
  readonly avatarKey: ProfileAvatarKey;
}): Promise<UpdateProfileResult> {
  const db = await getDb();

  if (db === null) {
    return {
      ok: false,
      reason: "database-unavailable"
    };
  }

  try {
    await db.prisma.user.upsert({
      where: {
        guestId: input.guestId
      },
      create: {
        username: isAuthProfileId(input.guestId)
          ? `auth:${input.guestId.slice(5)}`
          : `guest:${input.guestId}`,
        guestId: input.guestId,
        displayName: input.displayName,
        avatarKey: input.avatarKey
      },
      update: {
        displayName: input.displayName,
        avatarKey: input.avatarKey
      }
    });

    const profile = await getPersistedGuestProfile(input.guestId);

    if (profile === null) {
      return {
        ok: false,
        reason: "database-unavailable"
      };
    }

    return {
      ok: true,
      profile
    };
  } catch (error) {
    console.error("Unable to update guest profile.", error);
    return {
      ok: false,
      reason: "database-unavailable"
    };
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
        arenaCoins: true,
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
              arenaCoins: user.arenaCoins,
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

export async function getPersistedCosmetics(): Promise<readonly PublicCosmetic[] | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const cosmetics = await db.prisma.cosmetic.findMany({
      where: {
        isActive: true
      },
      orderBy: [
        {
          kind: "asc"
        },
        {
          rarity: "asc"
        },
        {
          name: "asc"
        }
      ],
      select: {
        id: true,
        slug: true,
        kind: true,
        name: true,
        description: true,
        rarity: true,
        isSupporter: true,
        coinPrice: true,
        previewUrl: true
      }
    });

    return cosmetics;
  } catch (error) {
    console.error("Unable to read cosmetics.", error);
    return null;
  }
}

export async function equipPersistedCosmetic(
  guestId: string,
  cosmeticId: string
): Promise<EquipCosmeticResult> {
  const db = await getDb();

  if (db === null) {
    return {
      ok: false,
      reason: "database-unavailable"
    };
  }

  try {
    const user = await db.prisma.user.findUnique({
      where: {
        guestId
      },
      select: {
        id: true
      }
    });

    if (user === null) {
      return {
        ok: false,
        reason: "profile-not-found"
      };
    }

    const unlock = await db.prisma.userCosmeticUnlock.findFirst({
      where: {
        userId: user.id,
        cosmeticId,
        cosmetic: {
          isActive: true
        }
      },
      select: {
        cosmetic: {
          select: {
            kind: true
          }
        }
      }
    });

    if (unlock === null) {
      return {
        ok: false,
        reason: "cosmetic-not-owned"
      };
    }

    await db.prisma.userEquippedCosmetic.upsert({
      where: {
        userId_kind: {
          userId: user.id,
          kind: unlock.cosmetic.kind
        }
      },
      create: {
        userId: user.id,
        cosmeticId,
        kind: unlock.cosmetic.kind
      },
      update: {
        cosmeticId,
        equippedAt: new Date()
      }
    });

    const profile = await getPersistedGuestProfile(guestId);

    if (profile === null) {
      return {
        ok: false,
        reason: "profile-not-found"
      };
    }

    return {
      ok: true,
      profile
    };
  } catch (error) {
    console.error("Unable to equip cosmetic.", error);
    return {
      ok: false,
      reason: "profile-not-found"
    };
  }
}

export async function purchasePersistedCosmetic(
  guestId: string,
  cosmeticId: string
): Promise<PurchaseCosmeticResult> {
  const db = await getDb();

  if (db === null) {
    return {
      ok: false,
      reason: "database-unavailable"
    };
  }

  try {
    const result = await db.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          guestId
        },
        select: {
          id: true,
          arenaCoins: true
        }
      });

      if (user === null) {
        return { ok: false as const, reason: "profile-not-found" as const };
      }

      const cosmetic = await tx.cosmetic.findFirst({
        where: {
          id: cosmeticId,
          isActive: true
        },
        select: {
          id: true,
          coinPrice: true,
          isSupporter: true
        }
      });

      if (cosmetic === null) {
        return { ok: false as const, reason: "cosmetic-not-found" as const };
      }

      if (cosmetic.isSupporter || cosmetic.coinPrice === null) {
        return { ok: false as const, reason: "cosmetic-not-purchasable" as const };
      }

      const existingUnlock = await tx.userCosmeticUnlock.findUnique({
        where: {
          userId_cosmeticId: {
            userId: user.id,
            cosmeticId
          }
        },
        select: {
          id: true
        }
      });

      if (existingUnlock !== null) {
        return { ok: false as const, reason: "cosmetic-already-owned" as const };
      }

      if (user.arenaCoins < cosmetic.coinPrice) {
        return { ok: false as const, reason: "insufficient-coins" as const };
      }

      await tx.user.update({
        where: {
          id: user.id
        },
        data: {
          arenaCoins: {
            decrement: cosmetic.coinPrice
          }
        }
      });

      await tx.userCosmeticUnlock.create({
        data: {
          userId: user.id,
          cosmeticId,
          source: "EARNED"
        }
      });

      return { ok: true as const };
    });

    if (!result.ok) {
      return result;
    }

    const profile = await getPersistedGuestProfile(guestId);

    if (profile === null) {
      return {
        ok: false,
        reason: "profile-not-found"
      };
    }

    return {
      ok: true,
      profile
    };
  } catch (error) {
    console.error("Unable to purchase cosmetic.", error);
    return {
      ok: false,
      reason: "profile-not-found"
    };
  }
}

export async function getPersistedMatchHistory(
  guestId: string,
  limit: number
): Promise<readonly PublicMatchHistoryItem[] | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const matches = await db.prisma.matchPlayer.findMany({
      where: {
        user: {
          guestId
        },
        match: {
          status: "COMPLETED"
        }
      },
      orderBy: {
        match: {
          completedAt: "desc"
        }
      },
      take: limit,
      select: {
        matchId: true,
        placement: true,
        ratingBefore: true,
        ratingAfter: true,
        cardsRemaining: true,
        bombsPlayed: true,
        averageMoveCount: true,
        match: {
          select: {
            roomCode: true,
            mode: true,
            completedAt: true,
            players: {
              orderBy: {
                playerSeat: "asc"
              },
              select: {
                playerLabel: true,
                kind: true,
                placement: true
              }
            },
            replayLabels: {
              where: {
                user: {
                  guestId
                }
              },
              orderBy: {
                createdAt: "desc"
              },
              select: {
                label: true
              }
            }
          }
        }
      }
    });

    return matches.map((matchPlayer) => ({
      matchId: matchPlayer.matchId,
      roomCode: matchPlayer.match.roomCode,
      mode: matchPlayer.match.mode,
      completedAt: matchPlayer.match.completedAt?.toISOString() ?? null,
      placement: matchPlayer.placement,
      ratingBefore: matchPlayer.ratingBefore,
      ratingAfter: matchPlayer.ratingAfter,
      ratingDelta:
        matchPlayer.ratingBefore === null || matchPlayer.ratingAfter === null
          ? null
          : matchPlayer.ratingAfter - matchPlayer.ratingBefore,
      cardsRemaining: matchPlayer.cardsRemaining,
      bombsPlayed: matchPlayer.bombsPlayed,
      movesPlayed: matchPlayer.averageMoveCount,
      labels: matchPlayer.match.replayLabels.map((replayLabel) => replayLabel.label),
      opponents: matchPlayer.match.players.map((player) => ({
        name: player.playerLabel,
        kind: fromDbPlayerKind(player.kind),
        placement: player.placement
      }))
    }));
  } catch (error) {
    console.error("Unable to read match history.", error);
    return null;
  }
}

export async function persistCoachEvaluation(
  persistedMatch: PersistedMatch | null,
  record: PublicCoachEvaluationRecord
): Promise<void> {
  const db = await getDb();

  if (db === null || persistedMatch === null) {
    return;
  }

  const matchPlayerId = persistedMatch.matchPlayerIds[record.playerId];

  if (matchPlayerId === undefined) {
    return;
  }

  try {
    await db.prisma.coachEvaluation.create({
      data: {
        matchId: persistedMatch.matchId,
        matchPlayerId,
        roomCode: persistedMatch.roomCode,
        playerId: record.playerId,
        playerLabel: record.playerName,
        turnNumber: record.turnNumber,
        handBefore: toPrismaJson(record.handBefore),
        currentTrickBefore: toPrismaJson(record.currentTrickBefore),
        evaluations: toPrismaJson(record.evaluations),
        rolloutsPerMove: record.evaluations[0]?.rollouts ?? 0,
        evaluatedMoveCount: record.evaluations.length
      }
    });
  } catch (error) {
    console.error("Unable to persist coach evaluation.", error);
  }
}

export async function savePersistedReplayLabel(
  guestId: string,
  matchId: string,
  label: string
): Promise<SaveReplayLabelResult> {
  const db = await getDb();

  if (db === null) {
    return {
      ok: false,
      reason: "database-unavailable"
    };
  }

  try {
    const user = await db.prisma.user.findUnique({
      where: {
        guestId
      },
      select: {
        id: true
      }
    });

    if (user === null) {
      return {
        ok: false,
        reason: "profile-not-found"
      };
    }

    const matchPlayer = await db.prisma.matchPlayer.findFirst({
      where: {
        matchId,
        userId: user.id,
        match: {
          status: "COMPLETED"
        }
      },
      select: {
        id: true
      }
    });

    if (matchPlayer === null) {
      return {
        ok: false,
        reason: "match-not-found"
      };
    }

    await db.prisma.replayLabel.upsert({
      where: {
        userId_matchId_label: {
          userId: user.id,
          matchId,
          label
        }
      },
      create: {
        userId: user.id,
        matchId,
        label
      },
      update: {}
    });

    return {
      ok: true
    };
  } catch (error) {
    console.error("Unable to save replay label.", error);
    return {
      ok: false,
      reason: "match-not-found"
    };
  }
}

export async function persistFeedbackReport(input: {
  readonly id: string;
  readonly kind: FeedbackKind;
  readonly body: string;
  readonly guestId: string | null;
  readonly roomCode: string | null;
  readonly contactEmail: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
}): Promise<PublicFeedbackReceipt> {
  const db = await getDb();

  if (db === null) {
    return {
      id: input.id,
      stored: false,
      createdAt: input.createdAt.toISOString()
    };
  }

  try {
    const user =
      input.guestId === null
        ? null
        : await db.prisma.user.findUnique({
            where: {
              guestId: input.guestId
            },
            select: {
              id: true
            }
          });

    await db.prisma.$executeRaw`
      INSERT INTO "FeedbackReport" (
        "id",
        "userId",
        "guestId",
        "roomCode",
        "kind",
        "body",
        "contactEmail",
        "userAgent",
        "createdAt"
      )
      VALUES (
        ${input.id},
        ${user?.id ?? null},
        ${input.guestId},
        ${input.roomCode},
        ${input.kind},
        ${input.body},
        ${input.contactEmail},
        ${input.userAgent},
        ${input.createdAt}
      )
    `;

    return {
      id: input.id,
      stored: true,
      createdAt: input.createdAt.toISOString()
    };
  } catch (error) {
    console.error("Unable to persist feedback report.", error);
    return {
      id: input.id,
      stored: false,
      createdAt: input.createdAt.toISOString()
    };
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
  const shouldApplyRating = persistedMatch.mode === "RANKED";
  const ratingChanges = shouldApplyRating
    ? calculatePersistedRatingChanges(persistedMatch, game)
    : [];

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
              ratingAfter: shouldApplyRating
                ? (ratingChanges.find((change) => change.playerId === summary.playerId)
                    ?.ratingAfter ?? null)
                : null,
              cardsRemaining: summary.cardsRemaining,
              bombsPlayed: summary.bombsPlayed,
              averageMoveCount: summary.movesPlayed
            }
          })
        ];
      }),
      ...Object.entries(persistedMatch.userIds).flatMap(([playerId, userId]) => {
        const placement = placementByPlayerId[playerId];

        if (placement !== 1 && placement !== 2 && placement !== 3 && placement !== 4) {
          return [];
        }

        const ratingChange = ratingChanges.find((change) => change.playerId === playerId);

        return [
          db.prisma.user.update({
            where: {
              id: userId
            },
            data: {
              ...(shouldApplyRating && ratingChange !== undefined
                ? {
                    rating: ratingChange.ratingAfter
                  }
                : {}),
              gamesPlayed: {
                increment: 1
              },
              wins: {
                increment: placement === 1 ? 1 : 0
              },
              losses: {
                increment: placement === 4 ? 1 : 0
              },
              placementTotal: {
                increment: placement
              },
              arenaCoins: {
                increment: getArenaCoinReward(placement)
              }
            }
          })
        ];
      })
    ]);
    await awardEarnedCosmetics(db, Object.values(persistedMatch.userIds));
  } catch (error) {
    console.error("Unable to persist match completion.", error);
  }
}

function getArenaCoinReward(placement: number): number {
  if (placement === 1) {
    return ARENA_COIN_REWARDS.first;
  }

  if (placement === 2) {
    return ARENA_COIN_REWARDS.second;
  }

  if (placement === 3) {
    return ARENA_COIN_REWARDS.third;
  }

  return ARENA_COIN_REWARDS.other;
}

async function awardEarnedCosmetics(
  db: typeof DbModule,
  userIds: readonly string[]
): Promise<void> {
  const uniqueUserIds = [...new Set(userIds)];

  if (uniqueUserIds.length === 0) {
    return;
  }

  const users = await db.prisma.user.findMany({
    where: {
      id: {
        in: uniqueUserIds
      }
    },
    select: {
      id: true,
      gamesPlayed: true,
      wins: true
    }
  });
  const unlockSlugs = [...new Set(users.flatMap(getEarnedCosmeticUnlockSlugs))];

  if (unlockSlugs.length === 0) {
    return;
  }

  const cosmetics = await db.prisma.cosmetic.findMany({
    where: {
      slug: {
        in: unlockSlugs
      },
      isActive: true,
      isSupporter: false
    },
    select: {
      id: true,
      slug: true
    }
  });
  const cosmeticIdBySlug = new Map(cosmetics.map((cosmetic) => [cosmetic.slug, cosmetic.id]));

  await Promise.all(
    users.flatMap((user) =>
      getEarnedCosmeticUnlockSlugs(user).flatMap((slug) => {
        const cosmeticId = cosmeticIdBySlug.get(slug);

        if (cosmeticId === undefined) {
          return [];
        }

        return [
          db.prisma.userCosmeticUnlock.upsert({
            where: {
              userId_cosmeticId: {
                userId: user.id,
                cosmeticId
              }
            },
            create: {
              userId: user.id,
              cosmeticId,
              source: "EARNED"
            },
            update: {}
          })
        ];
      })
    )
  );
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
      const authBacked = isAuthProfileId(guestId);

      return [
        db.prisma.user
          .upsert({
            where: {
              guestId
            },
            create: {
              username: authBacked ? `auth:${guestId.slice(5)}` : `guest:${guestId}`,
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

function isAuthProfileId(profileId: string): boolean {
  return /^auth-[a-f0-9]{32}$/.test(profileId);
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

function fromDbPlayerKind(kind: "HUMAN" | "BOT" | "GUEST"): "human" | "bot" | "guest" {
  if (kind === "BOT") {
    return "bot";
  }

  if (kind === "GUEST") {
    return "guest";
  }

  return "human";
}

function toProfileAvatarKey(value: string): ProfileAvatarKey {
  if (value === "club" || value === "heart" || value === "spade") {
    return value;
  }

  return "diamond";
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
