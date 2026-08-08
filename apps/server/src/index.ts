import { createHash } from "node:crypto";
import { createServer } from "node:http";

import {
  analyzeReplayDecisions,
  applyMove,
  applyPreGameCardTrade,
  ARENA_SUITS,
  chooseBotMove,
  chooseSimulationGuidedMove,
  CLASSIC_SUITS,
  calculatePlacementRatingChanges,
  createDeck,
  createInitialGame,
  evaluateLegalMovesByRandomRollouts,
  isSameCard,
  RANKS,
  summarizeGame,
  type BotStrategy,
  type Card,
  type DeckType,
  type GameEvent,
  type GameState,
  type PlayerState,
  type Rank
} from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  FeedbackKind,
  InterServerEvents,
  MatchMode,
  PlayerReportReason,
  PublicBotDifficulty,
  PublicBotPace,
  PublicChatMessage,
  PublicCardTradeRequest,
  PublicCoachEvaluationRecord,
  PublicCompletedCardTrade,
  PublicCosmetic,
  PublicEquippedCosmetic,
  PublicGameEvent,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicModerationReceipt,
  PublicMoveEvaluation,
  PublicRankedQueueState,
  PublicReplayDecisionReview,
  PublicRoomRules,
  PublicRoomPlayer,
  PublicRoomState,
  PublicTradePhaseState,
  ProfileAvatarKey,
  RoomReplayExport,
  ServerAck,
  ServerToClientEvents,
  SocketData
} from "@deuces-arena/shared";
import { verifyRealtimeAuthToken } from "@deuces-arena/shared";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";

import { sanitizeChatMessage } from "./chat.js";
import {
  abandonPersistedMatch,
  completePersistedMatch,
  createPersistedMatch,
  equipPersistedCosmetic,
  getPersistedCosmetics,
  getPersistedBlockedGuestIds,
  getPersistedGuestProfile,
  getPersistedLeaderboard,
  getPersistedMatchHistory,
  persistCoachEvaluation,
  persistFeedbackReport,
  persistPlayerReport,
  persistMoveEvent,
  purchasePersistedCosmetic,
  savePersistedReplayLabel,
  setPersistedUserBlock,
  updatePersistedGuestProfile,
  type PersistedMatch
} from "./persistence.js";

type RoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
  readonly guestId: string | null;
  readonly socketId: string | null;
  readonly ready: boolean;
};

type GuestProfile = {
  readonly guestId: string;
  displayName: string | null;
  imageUrl: string | null;
  avatarKey: ProfileAvatarKey;
  rating: number;
  gamesPlayed: number;
  wins: number;
  placementTotal: number;
  arenaCoins: number;
};

type Room = {
  readonly code: string;
  readonly mode: MatchMode;
  readonly createdAt: Date;
  players: RoomPlayer[];
  chatMessages: PublicChatMessage[];
  coachEvaluations: PublicCoachEvaluationRecord[];
  game: GameState | null;
  persistedMatch: PersistedMatch | null;
  statsApplied: boolean;
  timer: RoomTimerSettings;
  rules: RoomRuleSettings;
  botDifficulty: PublicBotDifficulty;
  botPace: PublicBotPace;
  turnDeadlineAt: Date | null;
  timerTimeout: NodeJS.Timeout | null;
  trade: RoomTradeState;
};

type RoomTimerSettings = {
  readonly enabled: boolean;
  readonly secondsPerTurn: number;
};

type RoomRuleSettings = PublicRoomRules;

type RoomTradeState = {
  status: PublicTradePhaseState["status"];
  deadlineAt: Date | null;
  requests: PublicCardTradeRequest[];
  requestUsedPlayerIds: Set<string>;
  completedPlayerIds: Set<string>;
  completedTrades: PublicCompletedCardTrade[];
  timeout: NodeJS.Timeout | null;
};

type RateLimitBucket = "chat" | "coach" | "feedback" | "moderation-report" | "replay-label";

type RateLimitRule = {
  readonly maxEvents: number;
  readonly windowMs: number;
  readonly message: string;
};

type RankedQueuedPlayer = {
  readonly socketId: string;
  readonly playerName: string;
  readonly guestId: string | null;
  readonly joinedAt: Date;
};

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGINS = parseClientOrigins(process.env.CLIENT_ORIGIN);
const SERVICE_VERSION = process.env.npm_package_version ?? "0.1.0";
const ADMIN_GUEST_IDS = [
  ...parseCommaList(process.env.ADMIN_GUEST_IDS),
  ...parseCommaList(process.env.ADMIN_EMAILS).map(createAuthProfileId)
];
const DATABASE_CONFIGURED = isConfiguredEnvironmentValue(process.env.DATABASE_URL);
const REDIS_CONFIGURED = isConfiguredEnvironmentValue(process.env.REDIS_URL);
const REALTIME_AUTH_SECRET = normalizeRealtimeAuthSecret(process.env.REALTIME_AUTH_SECRET);
const CLASSIC_PLAYER_COUNT = 4;
const MAX_CASUAL_PLAYERS_PER_ROOM = 6;
const DEFAULT_CARDS_PER_PLAYER = 13;
const TRADE_WINDOW_MS = 20_000;
const MAX_CHAT_MESSAGES_PER_ROOM = 50;
const MAX_COACH_EVALUATIONS_PER_ROOM = 50;
const DEFAULT_TIMER_SECONDS = 45;
const DISCONNECTED_AUTO_MOVE_DELAY_MS = parseIntegerSetting(
  process.env.DISCONNECTED_AUTO_MOVE_DELAY_MS,
  15_000,
  10,
  120_000
);
const RATE_LIMITS: Readonly<Record<RateLimitBucket, RateLimitRule>> = {
  chat: {
    maxEvents: 8,
    windowMs: 10_000,
    message: "Slow down before sending more chat messages."
  },
  coach: {
    maxEvents: 6,
    windowMs: 60_000,
    message: "Move Lab is cooling down. Try again in a moment."
  },
  feedback: {
    maxEvents: 3,
    windowMs: 60_000,
    message: "Please wait before sending more feedback."
  },
  "moderation-report": {
    maxEvents: 5,
    windowMs: 60 * 60_000,
    message: "You have submitted several reports. Please wait before sending another."
  },
  "replay-label": {
    maxEvents: 10,
    windowMs: 60_000,
    message: "Please wait before saving more replay labels."
  }
};
const ARENA_COIN_REWARDS: Readonly<Record<"first" | "second" | "third" | "other", number>> = {
  first: 120,
  second: 80,
  third: 50,
  other: 25
};
const BOT_MOVE_DELAY_RANGES: Readonly<
  Record<PublicBotPace, { readonly minMs: number; readonly maxMs: number }>
> = {
  quick: { minMs: 2_200, maxMs: 3_400 },
  normal: { minMs: 3_800, maxMs: 5_400 },
  relaxed: { minMs: 5_800, maxMs: 8_000 }
};
const RANKED_REQUIRED_PLAYERS = 4;
const STARTER_COSMETICS: readonly PublicCosmetic[] = [
  {
    id: "starter-classic-red-card-back",
    slug: "classic-red-card-back",
    kind: "CARD_BACK",
    name: "Classic Red",
    description: "A clean starter card back for every table.",
    rarity: "common",
    isSupporter: false,
    coinPrice: 0,
    previewUrl: null
  },
  {
    id: "starter-midnight-felt-table",
    slug: "midnight-felt-table",
    kind: "TABLE_THEME",
    name: "Midnight Felt",
    description: "The default dark table theme.",
    rarity: "common",
    isSupporter: false,
    coinPrice: 500,
    previewUrl: null
  },
  {
    id: "starter-lagoon-table",
    slug: "lagoon-table",
    kind: "TABLE_THEME",
    name: "Lagoon Table",
    description: "A bright teal table theme with a softer casino glow.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 450,
    previewUrl: null
  },
  {
    id: "starter-obsidian-table",
    slug: "obsidian-table",
    kind: "TABLE_THEME",
    name: "Obsidian Table",
    description: "A low-light table theme with gold edge lighting.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 800,
    previewUrl: null
  },
  {
    id: "starter-neon-grid-card-back",
    slug: "neon-grid-card-back",
    kind: "CARD_BACK",
    name: "Neon Grid",
    description: "A blue circuit-style card back for sharper tables.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 350,
    previewUrl: null
  },
  {
    id: "starter-ember-court-card-back",
    slug: "ember-court-card-back",
    kind: "CARD_BACK",
    name: "Ember Court",
    description: "A warm red-gold card back for endgame drama.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 650,
    previewUrl: null
  },
  {
    id: "starter-aqua-pulse-avatar",
    slug: "aqua-pulse-avatar",
    kind: "AVATAR",
    name: "Aqua Pulse",
    description: "A clean glowing avatar mark for table seats.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 300,
    previewUrl: null
  },
  {
    id: "starter-crown-chip-avatar",
    slug: "crown-chip-avatar",
    kind: "AVATAR",
    name: "Crown Chip",
    description: "A gold chip avatar mark for players who like a little pressure.",
    rarity: "epic",
    isSupporter: false,
    coinPrice: 700,
    previewUrl: null
  },
  {
    id: "starter-aqua-profile-border",
    slug: "aqua-profile-border",
    kind: "PROFILE_BORDER",
    name: "Aqua Rail",
    description: "A cool cyan seat border for online tables.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 550,
    previewUrl: null
  },
  {
    id: "starter-founder-gold-border",
    slug: "founder-gold-border",
    kind: "PROFILE_BORDER",
    name: "Founder Gold",
    description: "A future supporter profile border with no gameplay advantage.",
    rarity: "supporter",
    isSupporter: true,
    coinPrice: null,
    previewUrl: null
  }
];
const rooms = new Map<string, Room>();
const guestProfiles = new Map<string, GuestProfile>();
const guestEquippedCosmetics = new Map<string, readonly PublicEquippedCosmetic[]>();
const guestReplayLabels = new Map<string, readonly string[]>();
const blockedGuestIdsByGuestId = new Map<string, Set<string>>();
const socketRateLimitEvents = new Map<
  string,
  Partial<Record<RateLimitBucket, readonly number[]>>
>();
let rankedQueue: RankedQueuedPlayer[] = [];

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "@deuces-arena/server",
    version: SERVICE_VERSION,
    environment: process.env.NODE_ENV ?? "development",
    uptimeSeconds: Math.floor(process.uptime()),
    rooms: rooms.size,
    allowedOrigins: CLIENT_ORIGINS,
    config: {
      database: DATABASE_CONFIGURED ? "configured" : "memory-fallback",
      redis: REDIS_CONFIGURED ? "configured" : "disabled",
      realtimeAuth: REALTIME_AUTH_SECRET === null ? "disabled" : "configured",
      disconnectedAutoMoveDelayMs: DISCONNECTED_AUTO_MOVE_DELAY_MS
    },
    activity: publicLobbyState().activity
  });
});

app.get("/lobby", (_request, response) => {
  response.json(publicLobbyState());
});

app.get("/leaderboard", async (request, response) => {
  const limit =
    typeof request.query.limit === "string" ? Number.parseInt(request.query.limit, 10) : undefined;
  response.json(await publicLeaderboard(Number.isNaN(limit) ? undefined : limit));
});

app.get("/cosmetics", async (_request, response) => {
  response.json(await publicCosmetics());
});

app.get("/profiles/:guestId", async (request, response) => {
  const guestId = normalizeGuestId(request.params.guestId);

  if (guestId === null) {
    response.status(400).json({ error: "Profile not found." });
    return;
  }

  response.json(await publicGuestProfile(guestId));
});

app.get("/profiles/:guestId/history", async (request, response) => {
  const guestId = normalizeGuestId(request.params.guestId);
  const limit =
    typeof request.query.limit === "string" ? Number.parseInt(request.query.limit, 10) : undefined;

  if (guestId === null) {
    response.status(400).json({ error: "Profile not found." });
    return;
  }

  response.json(await publicMatchHistory(guestId, Number.isNaN(limit) ? undefined : limit));
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: CLIENT_ORIGINS
    }
  }
);

io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (REALTIME_AUTH_SECRET === null || typeof token !== "string" || token.trim() === "") {
    next();
    return;
  }

  const identity = verifyRealtimeAuthToken(token, REALTIME_AUTH_SECRET);

  if (identity === null) {
    next(new Error("Invalid or expired account session."));
    return;
  }

  socket.data.authProfileId = identity.profileId;
  next();
});

io.on("connection", (socket) => {
  emitLobbyState();

  function profileIdForSocket(requestedProfileId: string | undefined): string | null {
    return resolveSocketProfileId(socket.data.authProfileId, requestedProfileId);
  }

  function clearSocketRoomData(): void {
    const authProfileId = socket.data.authProfileId;
    socket.data = authProfileId === undefined ? {} : { authProfileId };
  }

  function leaveCurrentRoomForSocket(): void {
    if (socket.data.roomCode === undefined || socket.data.playerId === undefined) {
      return;
    }

    const currentRoom = rooms.get(normalizeRoomCode(socket.data.roomCode));

    if (currentRoom !== undefined) {
      leaveRoom(currentRoom, socket.data.playerId, true);
      socket.leave(currentRoom.code);
    }

    clearSocketRoomData();
  }

  socket.on("room:create", async (payload, callback) => {
    removeRankedQueueEntry(socket.id);
    leaveCurrentRoomForSocket();
    const room = createRoom(
      payload.playerName,
      socket.id,
      profileIdForSocket(payload.guestId) ?? undefined
    );
    const player = room.players[0];

    if (player === undefined) {
      callback(fail("Unable to seat player."));
      return;
    }

    socket.data = {
      ...socket.data,
      playerId: player.id,
      roomCode: room.code
    };
    socket.join(room.code);
    if (player.guestId !== null) {
      await hydrateBlockedGuestIds(player.guestId);
    }

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("room:join", async (payload, callback) => {
    removeRankedQueueEntry(socket.id);
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    if (room.game !== null) {
      callback(fail("This room has already started."));
      return;
    }

    if (
      room.players.filter((player) => player.kind === "human").length >= MAX_CASUAL_PLAYERS_PER_ROOM
    ) {
      callback(fail("Room is full."));
      return;
    }

    if (isPlayerInRoom(room, socket.id)) {
      callback(fail("You are already seated in this room."));
      return;
    }

    leaveCurrentRoomForSocket();
    const player = addHumanPlayer(
      room,
      payload.playerName,
      socket.id,
      profileIdForSocket(payload.guestId) ?? undefined
    );
    socket.data = {
      ...socket.data,
      playerId: player.id,
      roomCode: room.code
    };
    socket.join(room.code);
    if (player.guestId !== null) {
      await hydrateBlockedGuestIds(player.guestId);
    }

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("room:reconnect", async (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.id === payload.playerId);
    const profileId = profileIdForSocket(payload.guestId);

    if (
      player === undefined ||
      player.kind !== "human" ||
      profileId === null ||
      player.guestId !== profileId
    ) {
      callback(fail("Seat not found."));
      return;
    }

    room.players = room.players.map((candidate) =>
      candidate.id === player.id
        ? {
            ...candidate,
            socketId: socket.id
          }
        : candidate
    );
    socket.data = {
      ...socket.data,
      playerId: player.id,
      roomCode: room.code
    };
    socket.join(room.code);
    if (player.guestId !== null) {
      await hydrateBlockedGuestIds(player.guestId);
    }

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
    scheduleAutomatedTurn(room);
  });

  socket.on("room:start", async (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    if (!isPlayerInRoom(room, socket.id)) {
      callback(fail("You are not seated in this room."));
      return;
    }

    if (room.game !== null) {
      callback(fail("Room already started."));
      return;
    }

    if (!canStartRoom(room)) {
      callback(fail("All connected players must be ready before starting."));
      return;
    }

    const rules = normalizeRuleSettings(payload.rules, room.players.length);
    const botCount = normalizeBotCount(payload.botCount, room.players.length, rules.playerCount);

    if (createDeck(rules.deckType).length < rules.playerCount * rules.cardsPerPlayer) {
      callback(fail("Selected deck does not have enough cards for this table setup."));
      return;
    }

    if (room.players.length + botCount < rules.playerCount) {
      callback(fail(`A game needs ${rules.playerCount} seated players. Add more humans or bots.`));
      return;
    }

    fillRoomWithBots(room, botCount, rules.playerCount);
    room.timer = normalizeTimerSettings(payload.timer);
    room.rules = rules;
    room.botDifficulty = normalizeBotDifficulty(payload.botDifficulty);
    room.botPace = normalizeBotPace(payload.botPace);
    room.game = createInitialGame(
      room.players.map((player) => player.id),
      shuffleDeck(room.rules.deckType, room.rules.playerCount, room.rules.cardsPerPlayer),
      {
        cardsPerPlayer: room.rules.cardsPerPlayer
      }
    );
    room.persistedMatch = await createPersistedMatch(room.code, room.players, room.mode);
    startTradePhase(room, payload.trade?.enabled === true);
    resetTurnTimer(room);

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
    scheduleAutomatedTurn(room);
  });

  socket.on("room:ready", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    if (room.game !== null) {
      callback(fail("Ready state can only be changed before a game starts."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    room.players = room.players.map((candidate) =>
      candidate.id === player.id
        ? {
            ...candidate,
            ready: payload.ready
          }
        : candidate
    );

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("room:leave", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    leaveRoom(room, player.id, true);
    socket.leave(room.code);
    clearSocketRoomData();
    callback(ok(undefined));
  });

  socket.on("room:replay", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    if (!isPlayerInRoom(room, socket.id)) {
      callback(fail("You are not seated in this room."));
      return;
    }

    if (room.game?.status !== "complete") {
      callback(fail("Replay export is available after the match is complete."));
      return;
    }

    callback(ok(replayExportForRoom(room)));
  });

  socket.on("profile:get", async (payload, callback) => {
    const guestId = profileIdForSocket(payload.guestId);

    if (guestId === null) {
      callback(fail("Guest profile not found."));
      return;
    }

    await hydrateBlockedGuestIds(guestId);
    callback(ok(await publicGuestProfile(guestId)));
  });

  socket.on("profile:update", async (payload, callback) => {
    const guestId = profileIdForSocket(payload.guestId);
    const displayName = normalizeDisplayName(payload.displayName);
    const avatarKey = normalizeAvatarKey(payload.avatarKey);

    if (guestId === null) {
      callback(fail("Guest profile not found."));
      return;
    }

    if (displayName === null) {
      callback(fail("Display name must be 2-18 characters."));
      return;
    }

    const inMemoryProfile = getOrCreateGuestProfile(guestId);
    inMemoryProfile.displayName = displayName;
    inMemoryProfile.avatarKey = avatarKey;

    const persistedProfile = await updatePersistedGuestProfile({
      guestId,
      displayName,
      avatarKey
    });
    const profile = persistedProfile.ok
      ? persistedProfile.profile
      : await publicGuestProfile(guestId);

    callback(ok(profile));
    emitRoomStatesForGuest(guestId);
  });

  socket.on("profile:sync-account", async (payload, callback) => {
    const guestId = socket.data.authProfileId ?? null;

    if (guestId === null) {
      callback(fail("Sign in before syncing an account profile."));
      return;
    }

    const currentProfile = await publicGuestProfile(guestId);
    const displayName = normalizeDisplayName(
      payload.displayName ?? currentProfile.displayName ?? "Player"
    );
    const imageUrl = normalizeAccountImageUrl(payload.imageUrl);

    if (displayName === null) {
      callback(fail("Account display name must be 2-18 characters."));
      return;
    }

    if (payload.imageUrl !== null && imageUrl === null) {
      callback(fail("Account profile photo is not a valid secure image URL."));
      return;
    }

    const inMemoryProfile = getOrCreateGuestProfile(guestId);
    inMemoryProfile.displayName = displayName;
    inMemoryProfile.imageUrl = imageUrl;
    const persistedProfile = await updatePersistedGuestProfile({
      guestId,
      displayName,
      avatarKey: currentProfile.avatarKey,
      imageUrl
    });
    const profile = persistedProfile.ok
      ? persistedProfile.profile
      : await publicGuestProfile(guestId);

    callback(ok(profile));
    emitRoomStatesForGuest(guestId);
  });

  socket.on("leaderboard:list", async (payload, callback) => {
    callback(ok(await publicLeaderboard(payload.limit)));
  });

  socket.on("cosmetics:list", async (callback) => {
    callback(ok(await publicCosmetics()));
  });

  socket.on("cosmetics:equip", async (payload, callback) => {
    const guestId = profileIdForSocket(payload.guestId);
    const cosmeticId = payload.cosmeticId.trim();

    if (guestId === null || cosmeticId === "") {
      callback(fail("Cosmetic not found."));
      return;
    }

    if (isAdminGuestId(guestId)) {
      const adminProfile = await equipAdminCosmetic(guestId, cosmeticId);

      if (adminProfile === null) {
        callback(fail("Cosmetic not found."));
        return;
      }

      callback(ok(adminProfile));
      emitRoomStatesForGuest(guestId);
      return;
    }

    const result = await equipPersistedCosmetic(guestId, cosmeticId);

    if (result.ok) {
      guestEquippedCosmetics.set(guestId, result.profile.equippedCosmetics);
      callback(ok(result.profile));
      emitRoomStatesForGuest(guestId);
      return;
    }

    callback(fail(getEquipCosmeticError(result.reason)));
  });

  socket.on("cosmetics:purchase", async (payload, callback) => {
    const guestId = profileIdForSocket(payload.guestId);
    const cosmeticId = payload.cosmeticId.trim();

    if (guestId === null || cosmeticId === "") {
      callback(fail("Cosmetic not found."));
      return;
    }

    if (isAdminGuestId(guestId)) {
      callback(ok(await publicGuestProfile(guestId)));
      return;
    }

    const result = await purchasePersistedCosmetic(guestId, cosmeticId);

    if (result.ok) {
      guestEquippedCosmetics.set(guestId, result.profile.equippedCosmetics);
      callback(ok(result.profile));
      emitRoomStatesForGuest(guestId);
      return;
    }

    callback(fail(getPurchaseCosmeticError(result.reason)));
  });

  socket.on("profile:history", async (payload, callback) => {
    const guestId = profileIdForSocket(payload.guestId);

    if (guestId === null) {
      callback(fail("Guest profile not found."));
      return;
    }

    callback(ok(await publicMatchHistory(guestId, payload.limit)));
  });

  socket.on("profile:label-replay", async (payload, callback) => {
    const guestId = profileIdForSocket(payload.guestId);
    const matchId = payload.matchId.trim();
    const label = normalizeReplayLabel(payload.label);

    if (guestId === null || matchId === "") {
      callback(fail("Match not found."));
      return;
    }

    if (label === null) {
      callback(fail("Replay label must be 2-24 characters."));
      return;
    }

    const rateLimitError = checkSocketRateLimit(socket.id, "replay-label");

    if (rateLimitError !== null) {
      callback(fail(rateLimitError));
      return;
    }

    const persistedLabel = await savePersistedReplayLabel(guestId, matchId, label);

    if (persistedLabel.ok || persistedLabel.reason === "database-unavailable") {
      if (!persistedLabel.ok) {
        addInMemoryReplayLabel(guestId, matchId, label);
      }

      callback(ok(await publicMatchHistory(guestId, 10)));
      return;
    }

    callback(fail(getSaveReplayLabelError(persistedLabel.reason)));
  });

  socket.on("lobby:get", (callback) => {
    callback(ok(publicLobbyState()));
  });

  socket.on("ranked:get", (callback) => {
    callback(ok(publicRankedQueueState(socket.id)));
  });

  socket.on("ranked:join", async (payload, callback) => {
    const authenticatedProfileId = socket.data.authProfileId;

    if (authenticatedProfileId === undefined) {
      callback(fail("Sign in with Google to join ranked."));
      return;
    }

    if (socket.data.roomCode !== undefined) {
      callback(fail("Leave your current room before joining ranked."));
      return;
    }

    const queuedAccount = rankedQueue.find(
      (entry) => entry.guestId === authenticatedProfileId && entry.socketId !== socket.id
    );

    if (queuedAccount !== undefined) {
      callback(fail("This account is already in the ranked queue."));
      return;
    }

    if (isProfileSeatedElsewhere(authenticatedProfileId, socket.id)) {
      callback(fail("This account is already seated at another table."));
      return;
    }

    await hydrateBlockedGuestIds(authenticatedProfileId);

    if (!rankedQueue.some((entry) => entry.socketId === socket.id)) {
      rankedQueue = [
        ...rankedQueue,
        {
          socketId: socket.id,
          playerName: payload.playerName.trim() || "Ranked Player",
          guestId: authenticatedProfileId,
          joinedAt: new Date()
        }
      ];
    }

    callback(ok(publicRankedQueueState(socket.id)));
    emitRankedQueueState();
    await maybeStartRankedMatch();
    emitRankedQueueState();
  });

  socket.on("ranked:leave", (callback) => {
    removeRankedQueueEntry(socket.id);
    callback(ok(publicRankedQueueState(socket.id)));
    emitRankedQueueState();
  });

  socket.on("trade:request", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined || room.game === null) {
      callback(fail("Game not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);
    const target = room.players.find((candidate) => candidate.id === payload.toPlayerId);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    if (room.mode !== "CASUAL" || room.trade.status !== "open") {
      callback(fail("The card trade window is closed."));
      return;
    }

    if (
      target === undefined ||
      target.kind !== "human" ||
      target.socketId === null ||
      target.id === player.id
    ) {
      callback(fail("Choose another connected human player."));
      return;
    }

    if (
      room.trade.requestUsedPlayerIds.has(player.id) ||
      room.trade.completedPlayerIds.has(player.id)
    ) {
      callback(fail("You can send only one trade request per game."));
      return;
    }

    if (room.trade.completedPlayerIds.has(target.id)) {
      callback(fail("That player has already completed a trade."));
      return;
    }

    if (!isValidRoomCard(payload.offeredCard, room.rules.deckType)) {
      callback(fail("Choose a valid card to offer."));
      return;
    }

    if (!isValidRank(payload.requestedRank)) {
      callback(fail("Choose a valid requested rank."));
      return;
    }

    const playerState = getGamePlayer(room.game, player.id);

    if (!playerState.hand.some((card) => isSameCard(card, payload.offeredCard))) {
      callback(fail("You do not hold the offered card."));
      return;
    }

    const request: PublicCardTradeRequest = {
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromPlayerId: player.id,
      toPlayerId: target.id,
      offeredCard: payload.offeredCard,
      requestedRank: payload.requestedRank,
      createdAt: new Date().toISOString()
    };

    room.trade.requests = [...room.trade.requests, request];
    room.trade.requestUsedPlayerIds.add(player.id);
    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
  });

  socket.on("trade:respond", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined || room.game === null) {
      callback(fail("Game not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);
    const request = room.trade.requests.find((candidate) => candidate.id === payload.requestId);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    if (room.mode !== "CASUAL" || room.trade.status !== "open") {
      callback(fail("The card trade window is closed."));
      return;
    }

    if (request === undefined || request.toPlayerId !== player.id) {
      callback(fail("Trade request not found."));
      return;
    }

    if (!payload.accept) {
      room.trade.requests = room.trade.requests.filter((candidate) => candidate.id !== request.id);
      callback(ok(publicStateForSocket(room, socket.id)));
      emitRoomState(room);
      return;
    }

    if (
      room.trade.completedPlayerIds.has(request.fromPlayerId) ||
      room.trade.completedPlayerIds.has(request.toPlayerId)
    ) {
      callback(fail("One of these players has already completed a trade."));
      return;
    }

    if (
      payload.requestedCard === undefined ||
      !isValidRoomCard(payload.requestedCard, room.rules.deckType) ||
      payload.requestedCard.rank !== request.requestedRank
    ) {
      callback(fail(`Choose one of your ${request.requestedRank} cards to accept.`));
      return;
    }

    const result = applyPreGameCardTrade(room.game, {
      fromPlayerId: request.fromPlayerId,
      toPlayerId: request.toPlayerId,
      offeredCard: request.offeredCard,
      requestedCard: payload.requestedCard
    });

    if (!result.ok) {
      callback(fail(result.reason));
      return;
    }

    room.game = result.state;
    room.trade.completedPlayerIds.add(request.fromPlayerId);
    room.trade.completedPlayerIds.add(request.toPlayerId);
    room.trade.completedTrades = [
      ...room.trade.completedTrades,
      {
        id: request.id,
        fromPlayerId: request.fromPlayerId,
        toPlayerId: request.toPlayerId,
        offeredCard: request.offeredCard,
        receivedCard: payload.requestedCard,
        completedAt: new Date().toISOString()
      }
    ];
    room.trade.requests = room.trade.requests.filter(
      (candidate) =>
        ![request.fromPlayerId, request.toPlayerId].includes(candidate.fromPlayerId) &&
        ![request.fromPlayerId, request.toPlayerId].includes(candidate.toPlayerId)
    );
    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
  });

  socket.on("game:move", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined || room.game === null) {
      callback(fail("Game not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    if (room.trade.status === "open") {
      callback(fail("Wait for the card trade window to close."));
      return;
    }

    const result = applyMove(room.game, player.id, payload.move, room.rules);

    if (!result.ok) {
      callback(fail(result.reason));
      socket.emit("game:error", { message: result.reason });
      return;
    }

    room.game = result.state;
    persistLastMove(room);
    resetTurnTimer(room);
    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
    scheduleAutomatedTurn(room);
  });

  socket.on("chat:send", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    const body = sanitizeChatMessage(payload.body);

    if (body === null) {
      callback(fail("Message is empty."));
      return;
    }

    const rateLimitError = checkSocketRateLimit(socket.id, "chat");

    if (rateLimitError !== null) {
      callback(fail(rateLimitError));
      return;
    }

    const message: PublicChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: player.id,
      playerName: player.name,
      body,
      createdAt: new Date().toISOString()
    };

    room.chatMessages = [...room.chatMessages, message].slice(-MAX_CHAT_MESSAGES_PER_ROOM);
    callback(ok(message));
    emitChatMessage(room, message);
  });

  socket.on("moderation:block", async (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));
    const player = room?.players.find((candidate) => candidate.socketId === socket.id);
    const target = room?.players.find((candidate) => candidate.id === payload.targetPlayerId);

    if (room === undefined || player === undefined || target === undefined) {
      callback(fail("Player not found."));
      return;
    }

    if (
      player.id === target.id ||
      player.guestId === null ||
      target.guestId === null ||
      target.kind === "bot"
    ) {
      callback(fail("This player cannot be blocked."));
      return;
    }

    const blockedGuestIds = blockedGuestIdsByGuestId.get(player.guestId) ?? new Set<string>();

    if (payload.blocked) {
      blockedGuestIds.add(target.guestId);
    } else {
      blockedGuestIds.delete(target.guestId);
    }

    blockedGuestIdsByGuestId.set(player.guestId, blockedGuestIds);
    void setPersistedUserBlock({
      blockerGuestId: player.guestId,
      blockedGuestId: target.guestId,
      blocked: payload.blocked
    });
    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
  });

  socket.on("moderation:report", async (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));
    const player = room?.players.find((candidate) => candidate.socketId === socket.id);
    const target = room?.players.find((candidate) => candidate.id === payload.targetPlayerId);
    const reason = normalizePlayerReportReason(payload.reason);

    if (room === undefined || player === undefined || target === undefined) {
      callback(fail("Player not found."));
      return;
    }

    if (
      player.id === target.id ||
      player.guestId === null ||
      target.guestId === null ||
      target.kind === "bot"
    ) {
      callback(fail("This player cannot be reported."));
      return;
    }

    if (reason === null) {
      callback(fail("Choose a valid report reason."));
      return;
    }

    const rateLimitError = checkSocketRateLimit(socket.id, "moderation-report");

    if (rateLimitError !== null) {
      callback(fail(rateLimitError));
      return;
    }

    const message =
      typeof payload.messageId === "string"
        ? (room.chatMessages.find(
            (candidate) => candidate.id === payload.messageId && candidate.playerId === target.id
          ) ?? null)
        : null;
    const createdAt = new Date();
    const receipt: PublicModerationReceipt = await persistPlayerReport({
      id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reporterGuestId: player.guestId,
      reportedGuestId: target.guestId,
      roomCode: room.code,
      messageId: message?.id ?? null,
      messageBody: message?.body ?? null,
      reason,
      details: normalizeReportDetails(payload.details),
      createdAt
    });

    callback(ok(receipt));
  });

  socket.on("coach:evaluate", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined || room.game === null) {
      callback(fail("Game not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    if (room.trade.status === "open") {
      callback(fail("Move evaluation starts after the card trade window."));
      return;
    }

    if (room.game.activePlayerId !== player.id) {
      callback(fail("Move evaluation is only available on your turn."));
      return;
    }

    const rateLimitError = checkSocketRateLimit(socket.id, "coach");

    if (rateLimitError !== null) {
      callback(fail(rateLimitError));
      return;
    }

    const evaluations = publicMoveEvaluations(
      room.game,
      player.id,
      payload.rollouts,
      payload.maxMoves
    );
    const gamePlayer = getGamePlayer(room.game, player.id);
    const record: PublicCoachEvaluationRecord = {
      id: `coach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: player.id,
      playerName: player.name,
      turnNumber: room.game.turnNumber,
      createdAt: new Date().toISOString(),
      handBefore: gamePlayer.hand,
      currentTrickBefore: room.game.currentTrick,
      evaluations
    };

    room.coachEvaluations = [...room.coachEvaluations, record].slice(
      -MAX_COACH_EVALUATIONS_PER_ROOM
    );
    void persistCoachEvaluation(room.persistedMatch, record);
    callback(ok(evaluations));
  });

  socket.on("coach:review", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined || room.game === null) {
      callback(fail("Game not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.socketId === socket.id);

    if (player === undefined) {
      callback(fail("You are not seated in this room."));
      return;
    }

    if (room.game.status !== "complete") {
      callback(fail("Decision review is available after the match."));
      return;
    }

    const rateLimitError = checkSocketRateLimit(socket.id, "coach");

    if (rateLimitError !== null) {
      callback(fail(rateLimitError));
      return;
    }

    try {
      const reviews: readonly PublicReplayDecisionReview[] = analyzeReplayDecisions({
        finalState: room.game,
        playerId: player.id,
        rolloutsPerMove: clampInteger(payload.rollouts ?? 6, 1, 12),
        maxDecisions: clampInteger(payload.maxDecisions ?? 3, 1, 5),
        maxMovesPerDecision: clampInteger(payload.maxMoves ?? 10, 2, 16),
        maxTurnsPerRollout: 120,
        rules: {
          bombEndsTrick: room.rules.bombEndsTrick
        }
      });

      callback(ok(reviews));
    } catch (error) {
      callback(fail(error instanceof Error ? error.message : "Unable to analyze this replay."));
    }
  });

  socket.on("feedback:submit", async (payload, callback) => {
    const body = normalizeFeedbackBody(payload.body);

    if (body === null) {
      callback(fail("Feedback must be 6-800 characters."));
      return;
    }

    const rateLimitError = checkSocketRateLimit(socket.id, "feedback");

    if (rateLimitError !== null) {
      callback(fail(rateLimitError));
      return;
    }

    const roomCode =
      payload.roomCode === undefined || payload.roomCode.trim() === ""
        ? null
        : normalizeRoomCode(payload.roomCode).slice(0, 16);
    const receipt = await persistFeedbackReport({
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: normalizeFeedbackKind(payload.kind),
      body,
      guestId: profileIdForSocket(payload.guestId),
      roomCode,
      contactEmail: normalizeContactEmail(payload.contactEmail),
      userAgent: normalizeUserAgent(socket.handshake.headers["user-agent"]),
      createdAt: new Date()
    });

    callback(ok(receipt));
  });

  socket.on("disconnect", () => {
    clearSocketRateLimits(socket.id);
    removeRankedQueueEntry(socket.id);
    emitRankedQueueState();
    emitLobbyState();

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;

    if (roomCode === undefined || playerId === undefined) {
      return;
    }

    const room = rooms.get(roomCode);

    if (room === undefined) {
      return;
    }

    leaveRoom(room, playerId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Deuces Arena server listening on http://localhost:${PORT}`);
});

export { app, httpServer, io };

process.once("SIGINT", () => closeServer("SIGINT"));
process.once("SIGTERM", () => closeServer("SIGTERM"));

let isClosing = false;

function closeServer(signal: NodeJS.Signals): void {
  if (isClosing) {
    return;
  }

  isClosing = true;
  console.log(`Received ${signal}. Closing Deuces Arena server.`);
  for (const room of rooms.values()) {
    clearTurnTimer(room);
    clearTradeTimer(room);
  }
  io.close(() => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
}

function createRoom(playerName: string, socketId: string, guestId: string | undefined): Room {
  const room = createEmptyRoom();
  room.players = [createHumanPlayer(playerName, socketId, 0, guestId)];
  rooms.set(room.code, room);
  return room;
}

function createEmptyRoom(mode: MatchMode = "CASUAL"): Room {
  return {
    code: createRoomCode(),
    mode,
    createdAt: new Date(),
    players: [],
    chatMessages: [],
    coachEvaluations: [],
    game: null,
    persistedMatch: null,
    statsApplied: false,
    timer: {
      enabled: false,
      secondsPerTurn: DEFAULT_TIMER_SECONDS
    },
    rules: {
      bombEndsTrick: false,
      deckType: "classic",
      playerCount: CLASSIC_PLAYER_COUNT,
      cardsPerPlayer: DEFAULT_CARDS_PER_PLAYER
    },
    botDifficulty: "normal",
    botPace: "relaxed",
    turnDeadlineAt: null,
    timerTimeout: null,
    trade: createDisabledTradeState()
  };
}

function addHumanPlayer(
  room: Room,
  playerName: string,
  socketId: string,
  guestId: string | undefined
): RoomPlayer {
  const player = createHumanPlayer(playerName, socketId, room.players.length, guestId);
  room.players = [...room.players, player];
  return player;
}

function leaveRoom(room: Room, playerId: string, explicitlyLeft = false): void {
  if (room.game === null) {
    room.players = room.players.filter((player) => player.id !== playerId);

    if (room.players.length === 0) {
      clearTurnTimer(room);
      clearTradeTimer(room);
      rooms.delete(room.code);
      emitLobbyState();
      return;
    }

    emitRoomState(room);
    emitLobbyState();
    return;
  }

  const hasAnotherConnectedHuman = room.players.some(
    (player) => player.id !== playerId && player.kind === "human" && player.socketId !== null
  );

  if (explicitlyLeft && !hasAnotherConnectedHuman) {
    clearTurnTimer(room);
    clearTradeTimer(room);
    rooms.delete(room.code);
    void abandonPersistedMatch(room.persistedMatch);
    emitLobbyState();
    return;
  }

  room.players = room.players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          socketId: null,
          ready: false
        }
      : player
  );
  room.trade.requests = room.trade.requests.filter(
    (request) => request.fromPlayerId !== playerId && request.toPlayerId !== playerId
  );

  if (
    room.trade.status === "open" &&
    room.players.filter((player) => player.kind === "human" && player.socketId !== null).length < 2
  ) {
    closeTradePhase(room);
    return;
  }

  emitRoomState(room);
  emitLobbyState();
  scheduleAutomatedTurn(room);
}

function createHumanPlayer(
  playerName: string,
  socketId: string,
  seatIndex: number,
  guestId: string | undefined
): RoomPlayer {
  const normalizedGuestId = normalizeGuestId(guestId);

  if (normalizedGuestId !== null) {
    getOrCreateGuestProfile(normalizedGuestId);
  }

  return {
    id: `player-${seatIndex + 1}`,
    name: playerName.trim() || `Player ${seatIndex + 1}`,
    kind: "human",
    guestId: normalizedGuestId,
    socketId,
    ready: false
  };
}

function canStartRoom(room: Room): boolean {
  const connectedHumans = room.players.filter(
    (player) => player.kind === "human" && player.socketId !== null
  );

  if (connectedHumans.length <= 1) {
    return true;
  }

  return connectedHumans.every((player) => player.ready);
}

function fillRoomWithBots(room: Room, botCount: number, targetPlayerCount: number): void {
  let botsAdded = 0;

  while (room.players.length < targetPlayerCount && botsAdded < botCount) {
    const seatIndex = room.players.length;
    room.players = [
      ...room.players,
      {
        id: `player-${seatIndex + 1}`,
        name: `Bot ${seatIndex + 1}`,
        kind: "bot",
        guestId: null,
        socketId: null,
        ready: true
      }
    ];
    botsAdded += 1;
  }
}

function normalizeBotCount(
  botCount: number | undefined,
  seatedPlayers: number,
  targetPlayerCount: number
): number {
  return clampInteger(botCount ?? targetPlayerCount, 0, targetPlayerCount - seatedPlayers);
}

function normalizeTimerSettings(
  timer: { readonly enabled: boolean; readonly secondsPerTurn: number } | undefined
): RoomTimerSettings {
  return {
    enabled: timer?.enabled ?? false,
    secondsPerTurn: clampInteger(timer?.secondsPerTurn ?? DEFAULT_TIMER_SECONDS, 1, 120)
  };
}

function normalizeRuleSettings(
  rules: PublicRoomRules | undefined,
  seatedPlayers = 1
): RoomRuleSettings {
  const deckType = normalizeDeckType(rules?.deckType);
  const cardsPerPlayer = clampInteger(rules?.cardsPerPlayer ?? DEFAULT_CARDS_PER_PLAYER, 1, 20);
  const maximumPlayersByDeck = Math.floor(createDeck(deckType).length / cardsPerPlayer);
  const playerCount = clampInteger(
    rules?.playerCount ?? CLASSIC_PLAYER_COUNT,
    Math.max(2, seatedPlayers),
    Math.min(MAX_CASUAL_PLAYERS_PER_ROOM, maximumPlayersByDeck)
  );

  return {
    bombEndsTrick: rules?.bombEndsTrick ?? false,
    deckType,
    playerCount,
    cardsPerPlayer
  };
}

function normalizeDeckType(deckType: DeckType | undefined): DeckType {
  return deckType === "arena-six" ? "arena-six" : "classic";
}

function isValidRank(rank: unknown): rank is Rank {
  return typeof rank === "string" && (RANKS as readonly string[]).includes(rank);
}

function isValidRoomCard(card: unknown, deckType: DeckType): card is Card {
  if (typeof card !== "object" || card === null || !("rank" in card) || !("suit" in card)) {
    return false;
  }

  const suits = deckType === "arena-six" ? ARENA_SUITS : CLASSIC_SUITS;
  return (
    isValidRank(card.rank) &&
    typeof card.suit === "string" &&
    (suits as readonly string[]).includes(card.suit)
  );
}

function normalizeBotDifficulty(difficulty: PublicBotDifficulty | undefined): PublicBotDifficulty {
  return difficulty === "easy" || difficulty === "hard" ? difficulty : "normal";
}

function normalizeBotPace(pace: PublicBotPace | undefined): PublicBotPace {
  return pace === "quick" || pace === "normal" ? pace : "relaxed";
}

function createDisabledTradeState(): RoomTradeState {
  return {
    status: "disabled",
    deadlineAt: null,
    requests: [],
    requestUsedPlayerIds: new Set(),
    completedPlayerIds: new Set(),
    completedTrades: [],
    timeout: null
  };
}

function startTradePhase(room: Room, enabled: boolean): void {
  clearTradeTimer(room);
  const connectedHumans = room.players.filter(
    (player) => player.kind === "human" && player.socketId !== null
  );

  if (!enabled || room.mode !== "CASUAL" || connectedHumans.length < 2) {
    room.trade = createDisabledTradeState();
    return;
  }

  const deadlineAt = new Date(Date.now() + TRADE_WINDOW_MS);
  room.trade = {
    status: "open",
    deadlineAt,
    requests: [],
    requestUsedPlayerIds: new Set(),
    completedPlayerIds: new Set(),
    completedTrades: [],
    timeout: setTimeout(() => closeTradePhase(room), TRADE_WINDOW_MS)
  };
  room.trade.timeout?.unref();
}

function closeTradePhase(room: Room): void {
  if (room.trade.status !== "open") {
    return;
  }

  clearTradeTimer(room);
  room.trade.status = "closed";
  room.trade.deadlineAt = null;
  room.trade.requests = [];
  resetTurnTimer(room);
  emitRoomState(room);
  emitLobbyState();
  scheduleAutomatedTurn(room);
}

function clearTradeTimer(room: Room): void {
  if (room.trade.timeout !== null) {
    clearTimeout(room.trade.timeout);
    room.trade.timeout = null;
  }
}

function resetTurnTimer(room: Room): void {
  clearTurnTimer(room);

  if (
    room.game === null ||
    room.game.status === "complete" ||
    room.trade.status === "open" ||
    !room.timer.enabled
  ) {
    room.turnDeadlineAt = null;
    return;
  }

  room.turnDeadlineAt = new Date(Date.now() + room.timer.secondsPerTurn * 1000);
}

function clearTurnTimer(room: Room): void {
  if (room.timerTimeout !== null) {
    clearTimeout(room.timerTimeout);
    room.timerTimeout = null;
  }
}

function publicTurnTimer(room: Room) {
  if (!room.timer.enabled) {
    return null;
  }

  return {
    enabled: true,
    secondsPerTurn: room.timer.secondsPerTurn,
    deadlineAt: room.turnDeadlineAt?.toISOString() ?? null
  };
}

function scheduleAutomatedTurn(room: Room): void {
  clearTurnTimer(room);

  if (room.game === null || room.game.status === "complete" || room.trade.status === "open") {
    return;
  }

  const activePlayer = room.players.find((player) => player.id === room.game?.activePlayerId);

  if (activePlayer === undefined) {
    return;
  }

  if (activePlayer.kind === "bot") {
    room.timerTimeout = setTimeout(
      () => applyAutomatedMove(room, activePlayer.id, botStrategyForDifficulty(room.botDifficulty)),
      botMoveDelayMs(room.botPace)
    );
    room.timerTimeout.unref();
    return;
  }

  if (activePlayer.socketId === null) {
    room.timerTimeout = setTimeout(
      () => applyAutomatedMove(room, activePlayer.id, "lowest-legal"),
      DISCONNECTED_AUTO_MOVE_DELAY_MS
    );
    room.timerTimeout.unref();
    return;
  }

  if (!room.timer.enabled || room.turnDeadlineAt === null) {
    return;
  }

  room.timerTimeout = setTimeout(
    () => applyAutomatedMove(room, activePlayer.id, "lowest-legal"),
    Math.max(0, room.turnDeadlineAt.getTime() - Date.now())
  );
  room.timerTimeout.unref();
}

function botMoveDelayMs(pace: PublicBotPace): number {
  const range = BOT_MOVE_DELAY_RANGES[pace];

  return range.minMs + Math.floor(Math.random() * (range.maxMs - range.minMs + 1));
}

function applyAutomatedMove(room: Room, playerId: string, strategy: BotStrategy): void {
  if (room.game === null || room.trade.status === "open" || room.game.activePlayerId !== playerId) {
    return;
  }

  const playerState = getGamePlayer(room.game, playerId);
  const fallbackDecision = chooseBotMove({
    hand: playerState.hand,
    context: {
      isFirstMove: room.game.turnNumber === 0,
      currentTrick: room.game.currentTrick
    },
    strategy
  });
  const simulationDecision =
    strategy === "simple-heuristic" && !room.rules.bombEndsTrick
      ? chooseSimulationGuidedMove({
          state: room.game,
          playerId,
          rolloutsPerMove: 2,
          maxMoves: 8,
          maxTurnsPerRollout: 180,
          rolloutPolicy: "heuristic-mixed",
          explorationRate: 0.15
        })
      : null;
  const result = applyMove(
    room.game,
    playerId,
    simulationDecision?.move ?? fallbackDecision.move,
    room.rules
  );

  if (result.ok) {
    room.game = result.state;
    persistLastMove(room);
    resetTurnTimer(room);
    emitRoomState(room);
    emitLobbyState();
    scheduleAutomatedTurn(room);
  }
}

function botStrategyForDifficulty(difficulty: PublicBotDifficulty): BotStrategy {
  if (difficulty === "easy") {
    return "random-legal";
  }

  if (difficulty === "hard") {
    return "simple-heuristic";
  }

  return "lowest-legal";
}

function persistLastMove(room: Room): void {
  const game = room.game;
  const event = game?.events.at(-1);

  if (game === null || event === undefined) {
    return;
  }

  void persistMoveEvent(room.persistedMatch, event, game);

  if (game.status === "complete") {
    applyGuestStats(room, game);
    void completePersistedMatch(room.persistedMatch, game);
  }
}

function applyGuestStats(room: Room, game: GameState): void {
  if (room.statsApplied) {
    return;
  }

  const placements = inferPlacements(game);
  const ratingChanges =
    room.mode === "RANKED"
      ? calculatePlacementRatingChanges(
          room.players.map((player) => ({
            playerId: player.id,
            ratingBefore:
              player.guestId === null ? 1000 : getOrCreateGuestProfile(player.guestId).rating,
            placement: toRankedPlacement(placements.indexOf(player.id) + 1)
          }))
        )
      : [];

  for (const player of room.players) {
    if (player.guestId === null) {
      continue;
    }

    const profile = getOrCreateGuestProfile(player.guestId);
    const ratingChange = ratingChanges.find((change) => change.playerId === player.id);
    const placement = toPlacement(placements.indexOf(player.id) + 1);

    profile.gamesPlayed += 1;
    profile.wins += placement === 1 ? 1 : 0;
    profile.placementTotal += placement;
    profile.arenaCoins += getArenaCoinReward(placement);

    if (ratingChange !== undefined) {
      profile.rating = ratingChange.ratingAfter;
    }
  }

  room.statsApplied = true;
}

function publicStateForSocket(room: Room, socketId: string): PublicRoomState {
  const player = room.players.find((candidate) => candidate.socketId === socketId);
  const blockedGuestIds =
    player?.guestId === null || player?.guestId === undefined
      ? new Set<string>()
      : (blockedGuestIdsByGuestId.get(player.guestId) ?? new Set<string>());
  const hand =
    room.game === null || player === undefined ? [] : getGamePlayer(room.game, player.id).hand;

  return {
    roomCode: room.code,
    mode: room.mode,
    status: room.game?.status ?? "waiting",
    rules: room.rules,
    botDifficulty: room.botDifficulty,
    botPace: room.botPace,
    players: room.players.map((roomPlayer) => toPublicPlayer(room, roomPlayer)),
    activePlayerId: room.trade.status === "open" ? null : (room.game?.activePlayerId ?? null),
    currentTrick: room.game?.currentTrick ?? null,
    turnNumber: room.game?.turnNumber ?? 0,
    placements: room.game?.placements ?? [],
    recentEvents: (room.game?.status === "complete"
      ? room.game.events
      : (room.game?.events.slice(-12) ?? [])
    ).map(toPublicGameEvent),
    recentChat: room.chatMessages
      .filter((message) => {
        const sender = room.players.find((candidate) => candidate.id === message.playerId);
        return sender?.guestId === null || sender?.guestId === undefined
          ? true
          : !blockedGuestIds.has(sender.guestId);
      })
      .slice(-20),
    blockedPlayerIds: room.players.flatMap((candidate) =>
      candidate.guestId !== null && blockedGuestIds.has(candidate.guestId) ? [candidate.id] : []
    ),
    tradePhase: publicTradePhase(room, player?.id ?? null),
    turnTimer: publicTurnTimer(room),
    yourPlayerId: player?.id ?? null,
    yourHand: hand
  };
}

function toPublicGameEvent(event: GameEvent): PublicGameEvent {
  return {
    turnNumber: event.turnNumber,
    playerId: event.playerId,
    move: event.move,
    wasPass: event.wasPass,
    currentTrickBefore: event.currentTrickBefore,
    cardsRemainingBefore: event.cardsRemainingBefore,
    cardsRemainingAfter: event.cardsRemainingAfter,
    legalMoveCount: event.legalMoveCount
  };
}

function replayExportForRoom(room: Room): RoomReplayExport {
  return {
    roomCode: room.code,
    mode: room.mode,
    status: room.game?.status ?? "waiting",
    players: room.players.map((roomPlayer) => toPublicPlayer(room, roomPlayer)),
    placements: room.game?.placements ?? [],
    turnNumber: room.game?.turnNumber ?? 0,
    events: room.game?.events ?? [],
    tradeHistory: room.trade.completedTrades,
    coachEvaluations: room.coachEvaluations
  };
}

function publicTradePhase(room: Room, playerId: string | null): PublicTradePhaseState {
  return {
    status: room.trade.status,
    deadlineAt: room.trade.deadlineAt?.toISOString() ?? null,
    requests:
      playerId === null
        ? []
        : room.trade.requests.filter(
            (request) => request.fromPlayerId === playerId || request.toPlayerId === playerId
          ),
    yourRequestUsed: playerId !== null && room.trade.requestUsedPlayerIds.has(playerId),
    yourTradeCompleted: playerId !== null && room.trade.completedPlayerIds.has(playerId),
    completedTradeCount: room.trade.completedTrades.length
  };
}

function toPublicPlayer(room: Room, player: RoomPlayer): PublicRoomPlayer {
  const gamePlayer = room.game?.players.find((candidate) => candidate.id === player.id);
  const profile = player.guestId === null ? null : getOrCreateGuestProfile(player.guestId);

  return {
    id: player.id,
    name: player.name,
    kind: player.kind,
    connected: player.kind === "bot" || player.socketId !== null,
    ready: player.ready,
    cardsRemaining: gamePlayer?.hand.length ?? 13,
    stats:
      profile === null
        ? null
        : {
            rating: profile.rating,
            gamesPlayed: profile.gamesPlayed,
            wins: profile.wins,
            arenaCoins: profile.arenaCoins,
            averagePlacement:
              profile.gamesPlayed === 0 ? null : profile.placementTotal / profile.gamesPlayed
          },
    imageUrl: profile?.imageUrl ?? null,
    equippedCosmetics:
      player.guestId === null ? [] : (guestEquippedCosmetics.get(player.guestId) ?? [])
  };
}

function emitRoomState(room: Room): void {
  for (const player of room.players) {
    if (player.socketId !== null) {
      io.to(player.socketId).emit("room:state", publicStateForSocket(room, player.socketId));
    }
  }
}

function emitChatMessage(room: Room, message: PublicChatMessage): void {
  const sender = room.players.find((candidate) => candidate.id === message.playerId);

  for (const recipient of room.players) {
    if (recipient.socketId === null) {
      continue;
    }

    const blockedGuestIds =
      recipient.guestId === null ? undefined : blockedGuestIdsByGuestId.get(recipient.guestId);

    if (
      sender?.guestId !== null &&
      sender?.guestId !== undefined &&
      blockedGuestIds?.has(sender.guestId)
    ) {
      continue;
    }

    io.to(recipient.socketId).emit("chat:message", message);
  }
}

async function hydrateBlockedGuestIds(guestId: string): Promise<void> {
  const persistedBlockedGuestIds = await getPersistedBlockedGuestIds(guestId);

  if (persistedBlockedGuestIds !== null) {
    blockedGuestIdsByGuestId.set(guestId, new Set(persistedBlockedGuestIds));
  }
}

function emitLobbyState(): void {
  io.emit("lobby:state", publicLobbyState());
}

function emitRankedQueueState(): void {
  for (const entry of rankedQueue) {
    io.to(entry.socketId).emit("ranked:state", publicRankedQueueState(entry.socketId));
  }
}

function emitRoomStatesForGuest(guestId: string): void {
  for (const room of rooms.values()) {
    if (room.players.some((player) => player.guestId === guestId)) {
      emitRoomState(room);
    }
  }
}

function publicLobbyState(): PublicLobbyState {
  const roomList = [...rooms.values()];
  const openRooms = roomList
    .filter(
      (room) =>
        room.game === null &&
        room.players.length < MAX_CASUAL_PLAYERS_PER_ROOM &&
        room.players.some((player) => player.socketId !== null)
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((room) => {
      const seatedPlayers = room.players.filter((player) => player.kind === "human").length;
      const readyPlayers = room.players.filter(
        (player) => player.kind === "human" && player.ready
      ).length;

      return {
        roomCode: room.code,
        hostName: room.players[0]?.name ?? "Open table",
        rules: room.rules,
        seatedPlayers,
        readyPlayers,
        maxPlayers: room.rules.playerCount,
        botSeatsAvailable: Math.max(0, room.rules.playerCount - seatedPlayers),
        createdAt: room.createdAt.toISOString()
      };
    });
  const activeRooms = roomList.filter(
    (room) => room.game !== null && room.game.status === "in-progress"
  );
  const completedRooms = roomList.filter((room) => room.game?.status === "complete");
  const connectedUsers = io.engine.clientsCount;

  return {
    activity: {
      openRooms: openRooms.length,
      activeRooms: activeRooms.length,
      completedRooms: completedRooms.length,
      connectedUsers,
      seatedHumans: roomList.reduce(
        (total, room) => total + room.players.filter((player) => player.kind === "human").length,
        0
      ),
      seatedBots: roomList.reduce(
        (total, room) => total + room.players.filter((player) => player.kind === "bot").length,
        0
      ),
      playersInOpenRooms: openRooms.reduce((total, room) => total + room.seatedPlayers, 0),
      playersInActiveGames: activeRooms.reduce(
        (total, room) => total + room.players.filter((player) => player.kind === "human").length,
        0
      )
    },
    openRooms
  };
}

function publicRankedQueueState(socketId: string): PublicRankedQueueState {
  const queuedPlayers = rankedQueue.length;
  const playersNeeded = Math.max(0, RANKED_REQUIRED_PLAYERS - queuedPlayers);
  const queueIndex = rankedQueue.findIndex((entry) => entry.socketId === socketId);

  return {
    queuedPlayers,
    requiredPlayers: RANKED_REQUIRED_PLAYERS,
    etaSeconds: playersNeeded === 0 ? 0 : playersNeeded * 20,
    joined: queueIndex >= 0,
    queuePosition: queueIndex >= 0 ? queueIndex + 1 : null
  };
}

function removeRankedQueueEntry(socketId: string): void {
  rankedQueue = rankedQueue.filter((entry) => entry.socketId !== socketId);
}

function isProfileSeatedElsewhere(profileId: string, socketId: string): boolean {
  return [...rooms.values()].some(
    (room) =>
      room.game?.status !== "complete" &&
      room.players.some(
        (player) =>
          player.guestId === profileId && player.socketId !== null && player.socketId !== socketId
      )
  );
}

async function maybeStartRankedMatch(): Promise<void> {
  while (rankedQueue.length >= RANKED_REQUIRED_PLAYERS) {
    const matchedPlayers = rankedQueue.slice(0, RANKED_REQUIRED_PLAYERS);
    rankedQueue = rankedQueue.slice(RANKED_REQUIRED_PLAYERS);
    await createRankedRoom(matchedPlayers);
  }
}

async function createRankedRoom(queuedPlayers: readonly RankedQueuedPlayer[]): Promise<void> {
  const room = createEmptyRoom("RANKED");
  room.players = queuedPlayers.map((player, index) => ({
    ...createHumanPlayer(player.playerName, player.socketId, index, player.guestId ?? undefined),
    ready: true
  }));
  room.timer = {
    enabled: true,
    secondsPerTurn: DEFAULT_TIMER_SECONDS
  };
  room.game = createInitialGame(
    room.players.map((player) => player.id),
    shuffleDeck()
  );
  room.persistedMatch = await createPersistedMatch(room.code, room.players, room.mode);
  resetTurnTimer(room);
  rooms.set(room.code, room);

  for (const player of room.players) {
    if (player.socketId === null) {
      continue;
    }

    const matchedSocket = io.sockets.sockets.get(player.socketId);
    matchedSocket?.join(room.code);

    if (matchedSocket !== undefined) {
      matchedSocket.data = {
        ...matchedSocket.data,
        playerId: player.id,
        roomCode: room.code
      };
      matchedSocket.emit("room:state", publicStateForSocket(room, matchedSocket.id));
    }
  }

  emitRoomState(room);
  emitLobbyState();
  scheduleAutomatedTurn(room);
}

function getGamePlayer(game: GameState, playerId: string): PlayerState {
  const player = game.players.find((candidate) => candidate.id === playerId);

  if (player === undefined) {
    throw new Error(`Missing game player: ${playerId}`);
  }

  return player;
}

function createRoomCode(): string {
  let code: string;

  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms.has(code));

  return code;
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

function isPlayerInRoom(room: Room, socketId: string): boolean {
  return room.players.some((player) => player.socketId === socketId);
}

function normalizeGuestId(guestId: string | undefined): string | null {
  const normalized = guestId?.trim();
  return normalized === undefined || normalized === "" ? null : normalized.slice(0, 80);
}

function normalizeDisplayName(displayName: string): string | null {
  const normalized = displayName.replace(/\s+/g, " ").trim();

  if (normalized.length < 2 || normalized.length > 18) {
    return null;
  }

  return normalized;
}

function normalizeAccountImageUrl(imageUrl: string | null): string | null {
  if (imageUrl === null) {
    return null;
  }

  try {
    const url = new URL(imageUrl);
    return url.protocol === "https:" && url.toString().length <= 500 ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeAvatarKey(avatarKey: ProfileAvatarKey): ProfileAvatarKey {
  if (avatarKey === "club" || avatarKey === "heart" || avatarKey === "spade") {
    return avatarKey;
  }

  return "diamond";
}

function normalizeFeedbackKind(kind: FeedbackKind): FeedbackKind {
  if (kind === "IDEA" || kind === "BALANCE" || kind === "UI") {
    return kind;
  }

  return "BUG";
}

function normalizeFeedbackBody(body: string): string | null {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length < 6 || normalized.length > 800) {
    return null;
  }

  return normalized;
}

function normalizePlayerReportReason(reason: PlayerReportReason): PlayerReportReason | null {
  if (
    reason === "HARASSMENT" ||
    reason === "HATE_SPEECH" ||
    reason === "SPAM" ||
    reason === "CHEATING" ||
    reason === "INAPPROPRIATE_NAME" ||
    reason === "OTHER"
  ) {
    return reason;
  }

  return null;
}

function normalizeReportDetails(details: string | undefined): string | null {
  if (details === undefined) {
    return null;
  }

  const normalized = details.replace(/\s+/g, " ").trim().slice(0, 500);
  return normalized === "" ? null : normalized;
}

function normalizeContactEmail(email: string | undefined): string | null {
  const normalized = email?.trim().toLowerCase();

  if (normalized === undefined || normalized === "") {
    return null;
  }

  return normalized.length <= 254 && normalized.includes("@") ? normalized : null;
}

function normalizeReplayLabel(label: string | undefined): string | null {
  const normalized = label?.replace(/\s+/g, " ").trim();

  if (normalized === undefined || normalized.length < 2 || normalized.length > 24) {
    return null;
  }

  return normalized;
}

function normalizeUserAgent(userAgent: string | undefined): string | null {
  const normalized = userAgent?.trim();
  return normalized === undefined || normalized === "" ? null : normalized.slice(0, 320);
}

function checkSocketRateLimit(socketId: string, bucket: RateLimitBucket): string | null {
  const rule = RATE_LIMITS[bucket];
  const now = Date.now();
  const socketBuckets = socketRateLimitEvents.get(socketId) ?? {};
  const recentEvents = (socketBuckets[bucket] ?? []).filter(
    (timestamp) => now - timestamp < rule.windowMs
  );

  if (recentEvents.length >= rule.maxEvents) {
    socketRateLimitEvents.set(socketId, {
      ...socketBuckets,
      [bucket]: recentEvents
    });
    return rule.message;
  }

  socketRateLimitEvents.set(socketId, {
    ...socketBuckets,
    [bucket]: [...recentEvents, now]
  });
  return null;
}

function clearSocketRateLimits(socketId: string): void {
  socketRateLimitEvents.delete(socketId);
}

function parseClientOrigins(value: string | undefined): string[] {
  const origins = parseCommaList(value);

  return origins.length === 0 ? ["http://localhost:3000"] : origins;
}

function parseCommaList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "") ?? []
  );
}

function parseIntegerSetting(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = value === undefined ? Number.NaN : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clampInteger(parsed, min, max);
}

function isConfiguredEnvironmentValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

function normalizeRealtimeAuthSecret(value: string | undefined): string | null {
  const normalized = value?.trim();

  if (normalized === undefined || normalized === "") {
    return null;
  }

  if (normalized.length < 32) {
    throw new Error("REALTIME_AUTH_SECRET must contain at least 32 characters.");
  }

  return normalized;
}

function resolveSocketProfileId(
  authenticatedProfileId: string | undefined,
  requestedProfileId: string | undefined
): string | null {
  if (authenticatedProfileId !== undefined) {
    return authenticatedProfileId;
  }

  const normalized = normalizeGuestId(requestedProfileId);

  if (REALTIME_AUTH_SECRET !== null && normalized?.startsWith("auth-") === true) {
    return null;
  }

  return normalized;
}

function isAdminGuestId(guestId: string): boolean {
  return ADMIN_GUEST_IDS.includes(guestId);
}

function createAuthProfileId(identifier: string): string {
  return `auth-${createHash("sha256").update(identifier.toLowerCase()).digest("hex").slice(0, 32)}`;
}

function getOrCreateGuestProfile(guestId: string): GuestProfile {
  const existingProfile = guestProfiles.get(guestId);

  if (existingProfile !== undefined) {
    return existingProfile;
  }

  const profile: GuestProfile = {
    guestId,
    displayName: null,
    imageUrl: null,
    avatarKey: "diamond",
    rating: 1000,
    gamesPlayed: 0,
    wins: 0,
    placementTotal: 0,
    arenaCoins: 0
  };
  guestProfiles.set(guestId, profile);
  return profile;
}

function addInMemoryReplayLabel(guestId: string, matchId: string, label: string): void {
  const key = getReplayLabelKey(guestId, matchId);
  const labels = guestReplayLabels.get(key) ?? [];

  if (labels.includes(label)) {
    return;
  }

  guestReplayLabels.set(key, [label, ...labels].slice(0, 5));
}

function getInMemoryReplayLabels(guestId: string, matchId: string): readonly string[] {
  return guestReplayLabels.get(getReplayLabelKey(guestId, matchId)) ?? [];
}

function getReplayLabelKey(guestId: string, matchId: string): string {
  return `${guestId}:${matchId}`;
}

async function publicGuestProfile(guestId: string): Promise<PublicGuestProfile> {
  const persistedProfile = await getPersistedGuestProfile(guestId);

  if (persistedProfile !== null) {
    const profile = getOrCreateGuestProfile(guestId);
    profile.displayName = persistedProfile.displayName;
    profile.imageUrl = persistedProfile.imageUrl ?? null;
    profile.avatarKey = persistedProfile.avatarKey;
    profile.rating = persistedProfile.rating;
    profile.gamesPlayed = persistedProfile.gamesPlayed;
    profile.wins = persistedProfile.wins;
    profile.arenaCoins = persistedProfile.arenaCoins;
    profile.placementTotal =
      persistedProfile.averagePlacement === null
        ? 0
        : persistedProfile.averagePlacement * persistedProfile.gamesPlayed;
    guestEquippedCosmetics.set(guestId, persistedProfile.equippedCosmetics);

    return isAdminGuestId(guestId) ? withAdminCosmeticAccess(persistedProfile) : persistedProfile;
  }

  const profile = getOrCreateGuestProfile(guestId);

  const fallbackProfile: PublicGuestProfile = {
    guestId,
    displayName: profile.displayName,
    imageUrl: profile.imageUrl,
    avatarKey: profile.avatarKey,
    rating: profile.rating,
    gamesPlayed: profile.gamesPlayed,
    wins: profile.wins,
    arenaCoins: profile.arenaCoins,
    averagePlacement:
      profile.gamesPlayed === 0 ? null : profile.placementTotal / profile.gamesPlayed,
    isAdmin: false,
    unlocks: [],
    equippedCosmetics: []
  };

  return isAdminGuestId(guestId) ? withAdminCosmeticAccess(fallbackProfile) : fallbackProfile;
}

async function publicLeaderboard(
  limit: number | undefined
): Promise<readonly PublicLeaderboardEntry[]> {
  const leaderboardLimit = Math.max(1, Math.min(limit ?? 10, 25));
  const persistedLeaderboard = await getPersistedLeaderboard(leaderboardLimit);

  if (persistedLeaderboard !== null) {
    return persistedLeaderboard;
  }

  return [...guestProfiles.values()]
    .filter((profile) => profile.gamesPlayed > 0)
    .sort((left, right) => right.rating - left.rating || right.wins - left.wins)
    .slice(0, leaderboardLimit)
    .map((profile) => ({
      guestId: profile.guestId,
      displayName: null,
      rating: profile.rating,
      gamesPlayed: profile.gamesPlayed,
      wins: profile.wins,
      arenaCoins: profile.arenaCoins,
      averagePlacement:
        profile.gamesPlayed === 0 ? null : profile.placementTotal / profile.gamesPlayed
    }));
}

async function publicCosmetics(): Promise<readonly PublicCosmetic[]> {
  return (await getPersistedCosmetics()) ?? STARTER_COSMETICS;
}

async function equipAdminCosmetic(
  guestId: string,
  cosmeticId: string
): Promise<PublicGuestProfile | null> {
  const cosmetic = (await publicCosmetics()).find((candidate) => candidate.id === cosmeticId);

  if (cosmetic === undefined) {
    return null;
  }

  const equippedCosmetics: PublicEquippedCosmetic[] = [
    ...(guestEquippedCosmetics.get(guestId) ?? []).filter(
      (equipped) => equipped.kind !== cosmetic.kind
    ),
    {
      kind: cosmetic.kind,
      cosmetic,
      equippedAt: new Date().toISOString()
    }
  ];

  guestEquippedCosmetics.set(guestId, equippedCosmetics);

  return withAdminCosmeticAccess(await publicGuestProfile(guestId));
}

async function withAdminCosmeticAccess(profile: PublicGuestProfile): Promise<PublicGuestProfile> {
  const unlockedAt = new Date().toISOString();

  return {
    ...profile,
    isAdmin: true,
    unlocks: (await publicCosmetics()).map((cosmetic) => ({
      cosmetic,
      source: "ADMIN_GRANT",
      earnedAt: unlockedAt
    })),
    equippedCosmetics: guestEquippedCosmetics.get(profile.guestId) ?? profile.equippedCosmetics
  };
}

function getEquipCosmeticError(
  reason: "database-unavailable" | "profile-not-found" | "cosmetic-not-owned"
): string {
  if (reason === "database-unavailable") {
    return "Cosmetic equipment requires a connected database.";
  }

  if (reason === "profile-not-found") {
    return "Guest profile not found.";
  }

  return "You have not unlocked this cosmetic.";
}

function getPurchaseCosmeticError(
  reason:
    | "database-unavailable"
    | "profile-not-found"
    | "cosmetic-not-found"
    | "cosmetic-not-purchasable"
    | "cosmetic-already-owned"
    | "insufficient-coins"
): string {
  if (reason === "database-unavailable") {
    return "Cosmetic purchases require a connected database.";
  }

  if (reason === "profile-not-found") {
    return "Guest profile not found.";
  }

  if (reason === "cosmetic-not-purchasable") {
    return "This cosmetic is not available for Arena Coins.";
  }

  if (reason === "cosmetic-already-owned") {
    return "You already own this cosmetic.";
  }

  if (reason === "insufficient-coins") {
    return "Not enough Arena Coins.";
  }

  return "Cosmetic not found.";
}

function getSaveReplayLabelError(reason: "profile-not-found" | "match-not-found"): string {
  if (reason === "profile-not-found") {
    return "Guest profile not found.";
  }

  return "Match not found.";
}

async function publicMatchHistory(
  guestId: string,
  limit: number | undefined
): Promise<readonly PublicMatchHistoryItem[]> {
  const historyLimit = Math.max(1, Math.min(limit ?? 10, 25));
  const persistedHistory = await getPersistedMatchHistory(guestId, historyLimit);

  if (persistedHistory !== null) {
    return persistedHistory;
  }

  return [...rooms.values()]
    .filter(
      (room) =>
        room.game?.status === "complete" &&
        room.players.some((player) => player.guestId === guestId)
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, historyLimit)
    .map((room) => toInMemoryMatchHistoryItem(room, guestId));
}

function publicMoveEvaluations(
  game: GameState,
  playerId: string,
  rollouts: number | undefined,
  maxMoves: number | undefined
): readonly PublicMoveEvaluation[] {
  return evaluateLegalMovesByRandomRollouts({
    state: game,
    playerId,
    rolloutsPerMove: clampInteger(rollouts ?? 8, 1, 25),
    maxMoves: clampInteger(maxMoves ?? 12, 1, 25),
    maxTurnsPerRollout: 300,
    rolloutPolicy: "heuristic-mixed"
  }).map((evaluation) => ({
    move: evaluation.move,
    rollouts: evaluation.rollouts,
    wins: evaluation.wins,
    winRate: evaluation.winRate,
    winRateLow: evaluation.winRateLow,
    winRateHigh: evaluation.winRateHigh,
    averagePlacement: evaluation.averagePlacement,
    completedRollouts: evaluation.completedRollouts,
    completionRate: evaluation.completionRate,
    rolloutPolicy: evaluation.rolloutPolicy
  }));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.trunc(value), max));
}

function toInMemoryMatchHistoryItem(room: Room, guestId: string): PublicMatchHistoryItem {
  const game = room.game;
  const player = room.players.find((candidate) => candidate.guestId === guestId);

  if (game === null || player === undefined) {
    throw new Error("Cannot create history for an incomplete room.");
  }

  const placements = inferPlacements(game);
  const summaries = summarizeGame(game);
  const summary = summaries.find((candidate) => candidate.playerId === player.id);
  const profile = getOrCreateGuestProfile(guestId);

  return {
    matchId: room.persistedMatch?.matchId ?? room.code,
    roomCode: room.code,
    mode: room.mode,
    completedAt: room.createdAt.toISOString(),
    placement: placements.indexOf(player.id) + 1,
    ratingBefore: null,
    ratingAfter: profile.rating,
    ratingDelta: null,
    cardsRemaining: summary?.cardsRemaining ?? null,
    bombsPlayed: summary?.bombsPlayed ?? 0,
    movesPlayed: summary?.movesPlayed ?? null,
    labels: getInMemoryReplayLabels(guestId, room.persistedMatch?.matchId ?? room.code),
    opponents: room.players.map((roomPlayer) => ({
      name: roomPlayer.name,
      kind: roomPlayer.kind,
      placement: placements.indexOf(roomPlayer.id) + 1
    }))
  };
}

function inferPlacements(game: GameState): readonly string[] {
  return [
    ...game.placements,
    ...game.players
      .filter((player) => !game.placements.includes(player.id))
      .sort((left, right) => left.hand.length - right.hand.length)
      .map((player) => player.id)
  ];
}

function toPlacement(value: number): number {
  return Math.max(1, value);
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

function toRankedPlacement(value: number): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  return 4;
}

function shuffleDeck(
  deckType: DeckType = "classic",
  playerCount = CLASSIC_PLAYER_COUNT,
  cardsPerPlayer = DEFAULT_CARDS_PER_PLAYER
): Card[] {
  const deck = createDeck(deckType);

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = deck[index];
    const swap = deck[swapIndex];

    if (current !== undefined && swap !== undefined) {
      deck[index] = swap;
      deck[swapIndex] = current;
    }
  }

  const dealtCardCount = playerCount * cardsPerPlayer;
  const lowestCardIndex = deck.findIndex((card) => card.rank === "3" && card.suit === "diamonds");

  if (lowestCardIndex >= dealtCardCount && lowestCardIndex !== -1) {
    const firstCard = deck[0];
    const lowestCard = deck[lowestCardIndex];

    if (firstCard !== undefined && lowestCard !== undefined) {
      deck[0] = lowestCard;
      deck[lowestCardIndex] = firstCard;
    }
  }

  return deck;
}

function ok<T>(data: T): ServerAck<T> {
  return {
    ok: true,
    data
  };
}

function fail(error: string): ServerAck<never> {
  return {
    ok: false,
    error
  };
}
