import {
  calculatePlacementRatingChanges,
  detectHand,
  getRankedCoinBonus,
  summarizeGame,
  type GameEvent,
  type GameState,
  type RatedPlayerResult
} from "@deuces-arena/game-engine";
import type { Prisma } from "@deuces-arena/db";
import type * as DbModule from "@deuces-arena/db";
import type {
  AdminModerationQueue,
  CommunityFeedbackModerationReason,
  CommunityFeedbackStatus,
  FeedbackKind,
  MatchMode,
  PlayerReportReason,
  PlayerReportStatus,
  PublicCoachEvaluationRecord,
  PublicCommunityFeedback,
  PublicCosmetic,
  PublicFeedbackReceipt,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicMatchHistoryItem,
  PublicModerationReceipt,
  PublicTournamentHistoryItem,
  ProfileAvatarKey,
  TournamentStage
} from "@deuces-arena/shared";

type PersistableRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
  readonly guestId?: string | null;
};

type PersistableTournamentParticipant = {
  readonly guestId: string;
  readonly playerName: string;
};

type PersistedTournamentContext = {
  readonly tournamentId: string;
  readonly stage: TournamentStage;
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

export type SavePushSubscriptionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "database-unavailable" | "profile-not-found";
    };

export type PersistedPushSubscription = {
  readonly id: string;
  readonly expoPushToken: string;
};

export type PersistedPushDeliveryTicket = {
  readonly receiptId: string;
  readonly subscriptionId: string;
};

type CosmeticProgressionStats = {
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly rating: number;
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
  },
  {
    slug: "aqua-pulse-avatar",
    source: "EARNED",
    isUnlocked: (stats) => stats.gamesPlayed >= 10
  },
  {
    slug: "lagoon-table",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 8
  },
  {
    slug: "neon-grid-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.gamesPlayed >= 20
  },
  {
    slug: "aqua-profile-border",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 15
  },
  {
    slug: "crown-chip-avatar",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 25
  },
  {
    slug: "obsidian-table",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 50
  },
  {
    slug: "ember-court-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.gamesPlayed >= 50
  },
  {
    slug: "pool-shark-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.gamesPlayed >= 30
  },
  {
    slug: "koi-current-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 40
  },
  {
    slug: "orchard-salon-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 65
  },
  {
    slug: "blackberry-bandit-avatar",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 45
  },
  {
    slug: "koi-garden-table",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 55
  },
  {
    slug: "bengal-bloom-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 70
  },
  {
    slug: "jungle-club-table",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 80
  },
  {
    slug: "arena-six-crest-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 75
  },
  {
    slug: "celestial-vault-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 90
  },
  {
    slug: "koi-guardian-avatar",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 100
  },
  {
    slug: "celestial-observatory-table",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 110
  },
  {
    slug: "ember-sovereign-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 125
  },
  {
    slug: "voidglass-prism-card-back",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 175
  },
  {
    slug: "ember-throne-table",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 200
  },
  {
    slug: "ember-regent-avatar",
    source: "EARNED",
    isUnlocked: (stats) => stats.wins >= 225
  },
  {
    slug: "gold-division-border",
    source: "EARNED",
    isUnlocked: (stats) => stats.rating >= 1100
  },
  {
    slug: "platinum-division-border",
    source: "EARNED",
    isUnlocked: (stats) => stats.rating >= 1300
  },
  {
    slug: "diamond-division-border",
    source: "EARNED",
    isUnlocked: (stats) => stats.rating >= 1500
  },
  {
    slug: "arena-master-border",
    source: "EARNED",
    isUnlocked: (stats) => stats.rating >= 1800
  }
];

export function getEarnedCosmeticUnlockSlugs(stats: CosmeticProgressionStats): readonly string[] {
  return COSMETIC_UNLOCK_RULES.filter((rule) => rule.isUnlocked(stats)).map((rule) => rule.slug);
}

let dbModulePromise: Promise<typeof DbModule> | null = null;

export async function createPersistedMatch(
  roomCode: string,
  players: readonly PersistableRoomPlayer[],
  mode: MatchMode = "CASUAL",
  tournament: PersistedTournamentContext | null = null
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
        ...(tournament === null
          ? {}
          : {
              tournamentId: tournament.tournamentId,
              tournamentStage: toDbTournamentStage(tournament.stage)
            }),
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

export async function createPersistedTournament(
  publicId: string,
  participants: readonly PersistableTournamentParticipant[]
): Promise<string | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const users = await db.prisma.user.findMany({
      where: { guestId: { in: participants.map((participant) => participant.guestId) } },
      select: { id: true, guestId: true }
    });
    const userIdByGuestId = new Map(
      users.flatMap((user) => (user.guestId === null ? [] : [[user.guestId, user.id] as const]))
    );
    const tournament = await db.prisma.tournament.create({
      data: {
        publicId,
        participants: {
          create: participants.map((participant, index) => ({
            guestId: participant.guestId,
            playerName: participant.playerName,
            seed: index + 1,
            semifinalStage: index < 4 ? "SEMIFINAL_A" : "SEMIFINAL_B",
            ...(userIdByGuestId.get(participant.guestId) === undefined
              ? {}
              : { userId: userIdByGuestId.get(participant.guestId) })
          }))
        }
      },
      select: { id: true }
    });

    return tournament.id;
  } catch (error) {
    console.error("Unable to persist tournament start.", error);
    return null;
  }
}

export async function recordPersistedTournamentStage(input: {
  readonly tournamentId: string | null;
  readonly stage: TournamentStage;
  readonly placedGuestIds: readonly string[];
  readonly status: "semifinals" | "final" | "complete";
  readonly championName?: string | null;
}): Promise<void> {
  const db = await getDb();

  if (db === null || input.tournamentId === null) {
    return;
  }

  try {
    const tournamentId = input.tournamentId;
    const placementUpdates = input.placedGuestIds.map((guestId, index) =>
      db.prisma.tournamentParticipant.updateMany({
        where: { tournamentId, guestId },
        data:
          input.stage === "final"
            ? { finalPlacement: index + 1 }
            : { semifinalPlacement: index + 1, advancedToFinal: index < 2 }
      })
    );
    const championGuestId = input.status === "complete" ? input.placedGuestIds[0] : undefined;
    const champion =
      championGuestId === undefined
        ? null
        : await db.prisma.user.findUnique({
            where: { guestId: championGuestId },
            select: { id: true }
          });

    await db.prisma.$transaction([
      ...placementUpdates,
      db.prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: toDbTournamentStatus(input.status),
          ...(input.status === "complete"
            ? {
                completedAt: new Date(),
                championUserId: champion?.id ?? null,
                championName: input.championName ?? null
              }
            : {})
        }
      })
    ]);
  } catch (error) {
    console.error("Unable to persist tournament stage.", error);
  }
}

export async function getPersistedTournamentHistory(
  guestId: string,
  limit = 10
): Promise<readonly PublicTournamentHistoryItem[] | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const entries = await db.prisma.tournamentParticipant.findMany({
      where: { guestId },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(limit, 25)),
      select: {
        seed: true,
        semifinalStage: true,
        semifinalPlacement: true,
        advancedToFinal: true,
        finalPlacement: true,
        tournament: {
          select: {
            publicId: true,
            status: true,
            championName: true,
            createdAt: true,
            completedAt: true
          }
        }
      }
    });

    return entries.map((entry) => ({
      tournamentId: entry.tournament.publicId,
      status: fromDbTournamentStatus(entry.tournament.status),
      seed: entry.seed,
      semifinalStage: entry.semifinalStage === "SEMIFINAL_B" ? "semifinal-b" : "semifinal-a",
      semifinalPlacement: entry.semifinalPlacement,
      advancedToFinal: entry.advancedToFinal,
      finalPlacement: entry.finalPlacement,
      championName: entry.tournament.championName,
      createdAt: entry.tournament.createdAt.toISOString(),
      completedAt: entry.tournament.completedAt?.toISOString() ?? null
    }));
  } catch (error) {
    console.error("Unable to read tournament history.", error);
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
        imageUrl: true,
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
      imageUrl: user.imageUrl,
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

export async function savePersistedPushSubscription(input: {
  readonly authProfileId: string;
  readonly expoPushToken: string;
  readonly platform: "ios" | "android";
}): Promise<SavePushSubscriptionResult> {
  const db = await getDb();

  if (db === null) {
    return { ok: false, reason: "database-unavailable" };
  }

  try {
    const user = await db.prisma.user.findUnique({
      where: { guestId: input.authProfileId },
      select: { id: true }
    });

    if (user === null) {
      return { ok: false, reason: "profile-not-found" };
    }

    await db.prisma.pushSubscription.upsert({
      where: { expoPushToken: input.expoPushToken },
      create: {
        userId: user.id,
        expoPushToken: input.expoPushToken,
        platform: input.platform
      },
      update: {
        userId: user.id,
        platform: input.platform,
        lastSeenAt: new Date()
      }
    });
    return { ok: true };
  } catch (error) {
    console.error("Unable to save push subscription.", error);
    return { ok: false, reason: "database-unavailable" };
  }
}

export async function deletePersistedPushSubscription(input: {
  readonly authProfileId: string;
  readonly expoPushToken: string;
}): Promise<SavePushSubscriptionResult> {
  const db = await getDb();

  if (db === null) {
    return { ok: false, reason: "database-unavailable" };
  }

  try {
    const user = await db.prisma.user.findUnique({
      where: { guestId: input.authProfileId },
      select: { id: true }
    });

    if (user === null) {
      return { ok: false, reason: "profile-not-found" };
    }

    await db.prisma.pushSubscription.deleteMany({
      where: {
        userId: user.id,
        expoPushToken: input.expoPushToken
      }
    });
    return { ok: true };
  } catch (error) {
    console.error("Unable to delete push subscription.", error);
    return { ok: false, reason: "database-unavailable" };
  }
}

export async function getPersistedPushSubscriptions(
  authProfileIds: readonly string[]
): Promise<readonly PersistedPushSubscription[]> {
  const db = await getDb();

  if (db === null || authProfileIds.length === 0) {
    return [];
  }

  try {
    return await db.prisma.pushSubscription.findMany({
      where: {
        user: {
          guestId: { in: [...new Set(authProfileIds)] }
        }
      },
      select: {
        id: true,
        expoPushToken: true
      }
    });
  } catch (error) {
    console.error("Unable to read push subscriptions.", error);
    return [];
  }
}

export async function savePersistedPushDeliveryTickets(
  tickets: readonly {
    readonly subscriptionId: string;
    readonly receiptId: string;
  }[]
): Promise<void> {
  const db = await getDb();

  if (db === null || tickets.length === 0) {
    return;
  }

  try {
    await db.prisma.pushDeliveryTicket.createMany({
      data: tickets.map((ticket) => ({
        subscriptionId: ticket.subscriptionId,
        receiptId: ticket.receiptId
      })),
      skipDuplicates: true
    });
  } catch (error) {
    console.error("Unable to save push delivery tickets.", error);
  }
}

export async function getPendingPersistedPushDeliveryTickets(
  limit = 500
): Promise<readonly PersistedPushDeliveryTicket[]> {
  const db = await getDb();

  if (db === null) {
    return [];
  }

  try {
    const now = Date.now();
    const cutoff = new Date(now - 15 * 60_000);
    const receiptExpiration = new Date(now - 24 * 60 * 60_000);
    const auditExpiration = new Date(now - 7 * 24 * 60 * 60_000);

    await db.prisma.pushDeliveryTicket.deleteMany({
      where: {
        OR: [
          { checkedAt: { lt: auditExpiration } },
          { checkedAt: null, createdAt: { lt: receiptExpiration } }
        ]
      }
    });

    const tickets = await db.prisma.pushDeliveryTicket.findMany({
      where: {
        checkedAt: null,
        createdAt: { gte: receiptExpiration, lte: cutoff }
      },
      orderBy: { createdAt: "asc" },
      take: Math.min(Math.max(limit, 1), 1_000),
      select: {
        receiptId: true,
        subscriptionId: true
      }
    });

    return tickets;
  } catch (error) {
    console.error("Unable to read push delivery tickets.", error);
    return [];
  }
}

export async function resolvePersistedPushDeliveryTickets(input: {
  readonly checkedReceiptIds: readonly string[];
  readonly invalidSubscriptionIds: readonly string[];
}): Promise<void> {
  const db = await getDb();

  if (db === null || input.checkedReceiptIds.length === 0) {
    return;
  }

  try {
    await db.prisma.$transaction([
      db.prisma.pushDeliveryTicket.updateMany({
        where: { receiptId: { in: [...input.checkedReceiptIds] } },
        data: { checkedAt: new Date() }
      }),
      db.prisma.pushSubscription.deleteMany({
        where: { id: { in: [...new Set(input.invalidSubscriptionIds)] } }
      })
    ]);
  } catch (error) {
    console.error("Unable to resolve push delivery tickets.", error);
  }
}

export async function deletePersistedPushSubscriptionsByIds(
  subscriptionIds: readonly string[]
): Promise<void> {
  const db = await getDb();

  if (db === null || subscriptionIds.length === 0) {
    return;
  }

  try {
    await db.prisma.pushSubscription.deleteMany({
      where: { id: { in: [...new Set(subscriptionIds)] } }
    });
  } catch (error) {
    console.error("Unable to delete invalid push subscriptions.", error);
  }
}

export async function updatePersistedGuestProfile(input: {
  readonly guestId: string;
  readonly displayName: string;
  readonly avatarKey: ProfileAvatarKey;
  readonly imageUrl?: string | null;
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
        avatarKey: input.avatarKey,
        ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl })
      },
      update: {
        displayName: input.displayName,
        avatarKey: input.avatarKey,
        ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl })
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

export async function syncPersistedCosmetics(
  catalog: readonly PublicCosmetic[]
): Promise<readonly PublicCosmetic[] | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    await db.prisma.$transaction(
      catalog.map((cosmetic) =>
        db.prisma.cosmetic.upsert({
          where: { slug: cosmetic.slug },
          create: {
            slug: cosmetic.slug,
            kind: cosmetic.kind,
            name: cosmetic.name,
            description: cosmetic.description,
            rarity: cosmetic.rarity,
            isSupporter: cosmetic.isSupporter,
            coinPrice: cosmetic.coinPrice,
            previewUrl: cosmetic.previewUrl
          },
          update: {
            kind: cosmetic.kind,
            name: cosmetic.name,
            description: cosmetic.description,
            rarity: cosmetic.rarity,
            isSupporter: cosmetic.isSupporter,
            coinPrice: cosmetic.coinPrice,
            previewUrl: cosmetic.previewUrl,
            isActive: true
          }
        })
      )
    );

    return getPersistedCosmetics();
  } catch (error) {
    console.error("Unable to sync cosmetic catalog.", error);
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

export async function equipPersistedAdminCosmetic(
  guestId: string,
  cosmeticId: string
): Promise<PublicGuestProfile | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const profileExists = await db.prisma.$transaction(async (tx) => {
      const [user, cosmetic] = await Promise.all([
        tx.user.findUnique({ where: { guestId }, select: { id: true } }),
        tx.cosmetic.findFirst({
          where: { id: cosmeticId, isActive: true },
          select: { id: true, kind: true }
        })
      ]);

      if (user === null || cosmetic === null) {
        return false;
      }

      await tx.userCosmeticUnlock.upsert({
        where: { userId_cosmeticId: { userId: user.id, cosmeticId: cosmetic.id } },
        create: {
          userId: user.id,
          cosmeticId: cosmetic.id,
          source: "ADMIN_GRANT",
          metadata: { reason: "creator-access" }
        },
        update: { source: "ADMIN_GRANT" }
      });
      await tx.userEquippedCosmetic.upsert({
        where: { userId_kind: { userId: user.id, kind: cosmetic.kind } },
        create: {
          userId: user.id,
          cosmeticId: cosmetic.id,
          kind: cosmetic.kind
        },
        update: {
          cosmeticId: cosmetic.id,
          equippedAt: new Date()
        }
      });

      return true;
    });

    return profileExists ? await getPersistedGuestProfile(guestId) : null;
  } catch (error) {
    console.error("Unable to persist admin cosmetic equipment.", error);
    return null;
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

export async function persistCommunityFeedback(input: {
  readonly id: string;
  readonly kind: FeedbackKind;
  readonly body: string;
  readonly authProfileId: string;
  readonly isAnonymous: boolean;
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
    const user = await db.prisma.user.upsert({
      where: { guestId: input.authProfileId },
      create: {
        username: `auth:${input.authProfileId.slice(5)}`,
        guestId: input.authProfileId,
        displayName: "Arena Player"
      },
      update: {},
      select: { id: true }
    });

    await db.prisma.feedbackReport.create({
      data: {
        id: input.id,
        userId: user.id,
        guestId: input.authProfileId,
        kind: input.kind,
        body: input.body,
        userAgent: input.userAgent,
        isPublic: true,
        isAnonymous: input.isAnonymous,
        createdAt: input.createdAt
      }
    });

    return {
      id: input.id,
      stored: true,
      createdAt: input.createdAt.toISOString()
    };
  } catch (error) {
    console.error("Unable to persist community feedback.", error);
    return {
      id: input.id,
      stored: false,
      createdAt: input.createdAt.toISOString()
    };
  }
}

export async function getPersistedCommunityFeedback(
  requestedLimit: number
): Promise<readonly PublicCommunityFeedback[] | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  const limit = Math.max(1, Math.min(requestedLimit, 100));

  try {
    const feedback = await db.prisma.feedbackReport.findMany({
      where: {
        isPublic: true,
        hiddenAt: null
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        body: true,
        isAnonymous: true,
        publicStatus: true,
        creatorReply: true,
        createdAt: true,
        repliedAt: true,
        user: {
          select: {
            displayName: true
          }
        }
      }
    });

    return feedback.map((report) => ({
      id: report.id,
      kind: normalizeStoredFeedbackKind(report.kind),
      body: report.body,
      authorName: report.isAnonymous
        ? "Anonymous player"
        : report.user?.displayName?.trim() || "Arena Player",
      isAnonymous: report.isAnonymous,
      status: normalizeStoredCommunityFeedbackStatus(report.publicStatus),
      creatorReply: report.creatorReply,
      createdAt: report.createdAt.toISOString(),
      repliedAt: report.repliedAt?.toISOString() ?? null
    }));
  } catch (error) {
    console.error("Unable to read community feedback.", error);
    return null;
  }
}

export async function updatePersistedCommunityFeedback(input: {
  readonly feedbackId: string;
  readonly status: CommunityFeedbackStatus;
  readonly creatorReply: string | null;
  readonly visibility: "preserve" | "hide" | "restore";
  readonly hiddenReason: CommunityFeedbackModerationReason | null;
}): Promise<boolean> {
  const db = await getDb();

  if (db === null) {
    return false;
  }

  try {
    const result = await db.prisma.feedbackReport.updateMany({
      where: {
        id: input.feedbackId,
        isPublic: true
      },
      data: {
        publicStatus: input.status,
        creatorReply: input.creatorReply,
        repliedAt: input.creatorReply === null ? null : new Date(),
        ...(input.visibility === "preserve"
          ? {}
          : input.visibility === "hide"
            ? {
                hiddenAt: new Date(),
                hiddenReason: input.hiddenReason
              }
            : {
                hiddenAt: null,
                hiddenReason: null
              })
      }
    });

    return result.count === 1;
  } catch (error) {
    console.error("Unable to update community feedback.", error);
    return false;
  }
}

export async function getPersistedBlockedGuestIds(
  blockerGuestId: string
): Promise<readonly string[] | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  try {
    const blocks = await db.prisma.userBlock.findMany({
      where: {
        blocker: {
          guestId: blockerGuestId
        }
      },
      select: {
        blocked: {
          select: {
            guestId: true
          }
        }
      }
    });

    return blocks.flatMap((block) =>
      block.blocked.guestId === null ? [] : [block.blocked.guestId]
    );
  } catch (error) {
    console.error("Unable to read player blocks.", error);
    return null;
  }
}

export async function setPersistedUserBlock(input: {
  readonly blockerGuestId: string;
  readonly blockedGuestId: string;
  readonly blocked: boolean;
}): Promise<boolean> {
  const db = await getDb();

  if (db === null) {
    return false;
  }

  try {
    const [blocker, blocked] = await Promise.all([
      ensureModerationUser(db, input.blockerGuestId),
      ensureModerationUser(db, input.blockedGuestId)
    ]);

    if (input.blocked) {
      await db.prisma.userBlock.upsert({
        where: {
          blockerUserId_blockedUserId: {
            blockerUserId: blocker.id,
            blockedUserId: blocked.id
          }
        },
        create: {
          blockerUserId: blocker.id,
          blockedUserId: blocked.id
        },
        update: {}
      });
    } else {
      await db.prisma.userBlock.deleteMany({
        where: {
          blockerUserId: blocker.id,
          blockedUserId: blocked.id
        }
      });
    }

    return true;
  } catch (error) {
    console.error("Unable to update player block.", error);
    return false;
  }
}

export async function persistPlayerReport(input: {
  readonly id: string;
  readonly reporterGuestId: string;
  readonly reportedGuestId: string;
  readonly roomCode: string;
  readonly messageId: string | null;
  readonly messageBody: string | null;
  readonly reason: PlayerReportReason;
  readonly details: string | null;
  readonly createdAt: Date;
}): Promise<PublicModerationReceipt> {
  const db = await getDb();

  if (db === null) {
    return {
      id: input.id,
      stored: false,
      createdAt: input.createdAt.toISOString()
    };
  }

  try {
    const [reporter, reported] = await Promise.all([
      ensureModerationUser(db, input.reporterGuestId),
      ensureModerationUser(db, input.reportedGuestId)
    ]);

    await db.prisma.playerReport.create({
      data: {
        id: input.id,
        reporterUserId: reporter.id,
        reportedUserId: reported.id,
        reporterGuestId: input.reporterGuestId,
        reportedGuestId: input.reportedGuestId,
        roomCode: input.roomCode,
        messageId: input.messageId,
        messageBody: input.messageBody,
        reason: input.reason,
        details: input.details,
        createdAt: input.createdAt
      }
    });

    return {
      id: input.id,
      stored: true,
      createdAt: input.createdAt.toISOString()
    };
  } catch (error) {
    console.error("Unable to persist player report.", error);
    return {
      id: input.id,
      stored: false,
      createdAt: input.createdAt.toISOString()
    };
  }
}

export async function getPersistedAdminModerationQueue(
  requestedLimit: number
): Promise<AdminModerationQueue | null> {
  const db = await getDb();

  if (db === null) {
    return null;
  }

  const limit = Math.max(1, Math.min(requestedLimit, 100));

  try {
    const [feedback, playerReports] = await Promise.all([
      db.prisma.feedbackReport.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          kind: true,
          body: true,
          guestId: true,
          user: {
            select: {
              displayName: true
            }
          },
          roomCode: true,
          contactEmail: true,
          isPublic: true,
          isAnonymous: true,
          publicStatus: true,
          creatorReply: true,
          repliedAt: true,
          hiddenAt: true,
          hiddenReason: true,
          createdAt: true
        }
      }),
      db.prisma.playerReport.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          reporterGuestId: true,
          reportedGuestId: true,
          roomCode: true,
          messageId: true,
          messageBody: true,
          reason: true,
          details: true,
          status: true,
          createdAt: true
        }
      })
    ]);

    return {
      feedback: feedback.map((report) => ({
        id: report.id,
        kind: normalizeStoredFeedbackKind(report.kind),
        body: report.body,
        guestId: report.guestId,
        authorName: report.user?.displayName ?? null,
        roomCode: report.roomCode,
        contactEmail: report.contactEmail,
        isPublic: report.isPublic,
        isAnonymous: report.isAnonymous,
        publicStatus: normalizeStoredCommunityFeedbackStatus(report.publicStatus),
        creatorReply: report.creatorReply,
        repliedAt: report.repliedAt?.toISOString() ?? null,
        hiddenAt: report.hiddenAt?.toISOString() ?? null,
        hiddenReason: normalizeStoredCommunityFeedbackModerationReason(report.hiddenReason),
        createdAt: report.createdAt.toISOString()
      })),
      playerReports: playerReports.map((report) => ({
        ...report,
        createdAt: report.createdAt.toISOString()
      }))
    };
  } catch (error) {
    console.error("Unable to read moderation queue.", error);
    return null;
  }
}

export async function updatePersistedPlayerReportStatus(
  reportId: string,
  status: PlayerReportStatus
): Promise<boolean> {
  const db = await getDb();

  if (db === null) {
    return false;
  }

  try {
    const result = await db.prisma.playerReport.updateMany({
      where: { id: reportId },
      data: { status }
    });
    return result.count === 1;
  } catch (error) {
    console.error("Unable to update player report status.", error);
    return false;
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
                increment: getArenaCoinReward(placement, persistedMatch.mode)
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

export async function grantPersistedTournamentRewards(
  rewards: readonly { readonly guestId: string; readonly coins: number }[],
  championGuestId: string | null
): Promise<void> {
  const db = await getDb();

  if (db === null) {
    return;
  }

  try {
    await db.prisma.$transaction(
      rewards.map((reward) =>
        db.prisma.user.updateMany({
          where: { guestId: reward.guestId },
          data: { arenaCoins: { increment: reward.coins } }
        })
      )
    );

    if (championGuestId === null) {
      return;
    }

    const [champion, cosmetic] = await Promise.all([
      db.prisma.user.findUnique({ where: { guestId: championGuestId }, select: { id: true } }),
      db.prisma.cosmetic.findUnique({
        where: { slug: "tournament-champion-border" },
        select: { id: true }
      })
    ]);

    if (champion !== null && cosmetic !== null) {
      await db.prisma.userCosmeticUnlock.upsert({
        where: {
          userId_cosmeticId: { userId: champion.id, cosmeticId: cosmetic.id }
        },
        create: {
          userId: champion.id,
          cosmeticId: cosmetic.id,
          source: "EARNED",
          metadata: { reason: "tournament-champion" }
        },
        update: {}
      });
    }
  } catch (error) {
    console.error("Unable to grant tournament rewards.", error);
  }
}

export async function abandonPersistedMatch(persistedMatch: PersistedMatch | null): Promise<void> {
  const db = await getDb();

  if (db === null || persistedMatch === null) {
    return;
  }

  try {
    await db.prisma.match.updateMany({
      where: {
        id: persistedMatch.matchId,
        status: "IN_PROGRESS"
      },
      data: {
        status: "ABANDONED",
        completedAt: new Date()
      }
    });
  } catch (error) {
    console.error("Unable to abandon persisted match.", error);
  }
}

function getArenaCoinReward(placement: number, mode: MatchMode): number {
  const rankedBonus = mode === "RANKED" ? getRankedCoinBonus(placement as 1 | 2 | 3 | 4) : 0;

  if (placement === 1) {
    return ARENA_COIN_REWARDS.first + rankedBonus;
  }

  if (placement === 2) {
    return ARENA_COIN_REWARDS.second + rankedBonus;
  }

  if (placement === 3) {
    return ARENA_COIN_REWARDS.third + rankedBonus;
  }

  return ARENA_COIN_REWARDS.other + rankedBonus;
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
      wins: true,
      rating: true
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

async function ensureModerationUser(db: typeof DbModule, guestId: string) {
  const authBacked = isAuthProfileId(guestId);

  return db.prisma.user.upsert({
    where: {
      guestId
    },
    create: {
      username: authBacked ? `auth:${guestId.slice(5)}` : `guest:${guestId}`,
      guestId
    },
    update: {},
    select: {
      id: true
    }
  });
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

function toDbTournamentStage(stage: TournamentStage): "SEMIFINAL_A" | "SEMIFINAL_B" | "FINAL" {
  if (stage === "semifinal-a") {
    return "SEMIFINAL_A";
  }

  if (stage === "semifinal-b") {
    return "SEMIFINAL_B";
  }

  return "FINAL";
}

function toDbTournamentStatus(
  status: "semifinals" | "final" | "complete"
): "SEMIFINALS" | "FINAL" | "COMPLETED" {
  if (status === "semifinals") {
    return "SEMIFINALS";
  }

  if (status === "final") {
    return "FINAL";
  }

  return "COMPLETED";
}

function fromDbTournamentStatus(
  status: "SEMIFINALS" | "FINAL" | "COMPLETED" | "ABANDONED"
): PublicTournamentHistoryItem["status"] {
  if (status === "SEMIFINALS") {
    return "semifinals";
  }

  if (status === "FINAL") {
    return "final";
  }

  if (status === "COMPLETED") {
    return "complete";
  }

  return "abandoned";
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

function normalizeStoredFeedbackKind(value: string): FeedbackKind {
  if (value === "IDEA" || value === "BALANCE" || value === "UI" || value === "PRAISE") {
    return value;
  }

  return "BUG";
}

function normalizeStoredCommunityFeedbackStatus(value: string): CommunityFeedbackStatus {
  if (value === "PLANNED" || value === "IN_PROGRESS" || value === "FIXED") {
    return value;
  }

  return "OPEN";
}

function normalizeStoredCommunityFeedbackModerationReason(
  value: string | null
): CommunityFeedbackModerationReason | null {
  if (
    value === "SPAM" ||
    value === "HARASSMENT" ||
    value === "HATE_SPEECH" ||
    value === "PERSONAL_INFORMATION" ||
    value === "OTHER_POLICY_VIOLATION"
  ) {
    return value;
  }

  return null;
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
