import { createHash } from "node:crypto";
import { createServer } from "node:http";

import {
  applyMove,
  chooseBotMove,
  calculatePlacementRatingChanges,
  createDeck,
  createInitialGame,
  evaluateLegalMovesByRandomRollouts,
  summarizeGame,
  type BotStrategy,
  type Card,
  type GameState,
  type PlayerState
} from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  InterServerEvents,
  MatchMode,
  PublicBotDifficulty,
  PublicChatMessage,
  PublicCoachEvaluationRecord,
  PublicCosmetic,
  PublicEquippedCosmetic,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicMoveEvaluation,
  PublicRankedQueueState,
  PublicRoomRules,
  PublicRoomPlayer,
  PublicRoomState,
  ProfileAvatarKey,
  RoomReplayExport,
  ServerAck,
  ServerToClientEvents,
  SocketData
} from "@deuces-arena/shared";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";

import { sanitizeChatMessage } from "./chat.js";
import {
  completePersistedMatch,
  createPersistedMatch,
  equipPersistedCosmetic,
  getPersistedCosmetics,
  getPersistedGuestProfile,
  getPersistedLeaderboard,
  getPersistedMatchHistory,
  persistCoachEvaluation,
  persistMoveEvent,
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
  avatarKey: ProfileAvatarKey;
  rating: number;
  gamesPlayed: number;
  wins: number;
  placementTotal: number;
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
  turnDeadlineAt: Date | null;
  timerTimeout: NodeJS.Timeout | null;
};

type RoomTimerSettings = {
  readonly enabled: boolean;
  readonly secondsPerTurn: number;
};

type RoomRuleSettings = PublicRoomRules;

type RankedQueuedPlayer = {
  readonly socketId: string;
  readonly playerName: string;
  readonly guestId: string | null;
  readonly joinedAt: Date;
};

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGINS = parseClientOrigins(process.env.CLIENT_ORIGIN);
const ADMIN_GUEST_IDS = [
  ...parseCommaList(process.env.ADMIN_GUEST_IDS),
  ...parseCommaList(process.env.ADMIN_EMAILS).map(createAuthProfileId)
];
const MAX_PLAYERS_PER_ROOM = 4;
const MAX_CHAT_MESSAGES_PER_ROOM = 50;
const MAX_COACH_EVALUATIONS_PER_ROOM = 50;
const DEFAULT_TIMER_SECONDS = 45;
const MIN_BOT_MOVE_DELAY_MS = 3_800;
const MAX_BOT_MOVE_DELAY_MS = 5_400;
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
    previewUrl: null
  }
];
const rooms = new Map<string, Room>();
const guestProfiles = new Map<string, GuestProfile>();
const guestEquippedCosmetics = new Map<string, readonly PublicEquippedCosmetic[]>();
let rankedQueue: RankedQueuedPlayer[] = [];

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "@deuces-arena/server",
    rooms: rooms.size,
    allowedOrigins: CLIENT_ORIGINS,
    activity: publicLobbyState().activity
  });
});

app.get("/lobby", (_request, response) => {
  response.json(publicLobbyState());
});

app.get("/cosmetics", async (_request, response) => {
  response.json(await publicCosmetics());
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

io.on("connection", (socket) => {
  function leaveCurrentRoomForSocket(): void {
    if (socket.data.roomCode === undefined || socket.data.playerId === undefined) {
      return;
    }

    const currentRoom = rooms.get(normalizeRoomCode(socket.data.roomCode));

    if (currentRoom !== undefined) {
      leaveRoom(currentRoom, socket.data.playerId);
      socket.leave(currentRoom.code);
    }

    socket.data = {};
  }

  socket.on("room:create", (payload, callback) => {
    removeRankedQueueEntry(socket.id);
    leaveCurrentRoomForSocket();
    const room = createRoom(payload.playerName, socket.id, payload.guestId);
    const player = room.players[0];

    if (player === undefined) {
      callback(fail("Unable to seat player."));
      return;
    }

    socket.data = {
      playerId: player.id,
      roomCode: room.code
    };
    socket.join(room.code);

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("room:join", (payload, callback) => {
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

    if (room.players.filter((player) => player.kind === "human").length >= MAX_PLAYERS_PER_ROOM) {
      callback(fail("Room is full."));
      return;
    }

    if (isPlayerInRoom(room, socket.id)) {
      callback(fail("You are already seated in this room."));
      return;
    }

    leaveCurrentRoomForSocket();
    const player = addHumanPlayer(room, payload.playerName, socket.id, payload.guestId);
    socket.data = {
      playerId: player.id,
      roomCode: room.code
    };
    socket.join(room.code);

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("room:reconnect", (payload, callback) => {
    const room = rooms.get(normalizeRoomCode(payload.roomCode));

    if (room === undefined) {
      callback(fail("Room not found."));
      return;
    }

    const player = room.players.find((candidate) => candidate.id === payload.playerId);

    if (player === undefined || player.kind !== "human") {
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
      playerId: player.id,
      roomCode: room.code
    };
    socket.join(room.code);

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
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

    const botCount = normalizeBotCount(payload.botCount, room.players.length);

    if (room.players.length + botCount < MAX_PLAYERS_PER_ROOM) {
      callback(fail("A game needs 4 seated players. Add more humans or bots."));
      return;
    }

    fillRoomWithBots(room, botCount);
    room.timer = normalizeTimerSettings(payload.timer);
    room.rules = normalizeRuleSettings(payload.rules);
    room.botDifficulty = normalizeBotDifficulty(payload.botDifficulty);
    room.game = createInitialGame(
      room.players.map((player) => player.id),
      shuffleDeck()
    );
    room.persistedMatch = await createPersistedMatch(room.code, room.players, room.mode);
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

    leaveRoom(room, player.id);
    socket.leave(room.code);
    socket.data = {};
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

    callback(ok(replayExportForRoom(room)));
  });

  socket.on("profile:get", async (payload, callback) => {
    const guestId = normalizeGuestId(payload.guestId);

    if (guestId === null) {
      callback(fail("Guest profile not found."));
      return;
    }

    callback(ok(await publicGuestProfile(guestId)));
  });

  socket.on("profile:update", async (payload, callback) => {
    const guestId = normalizeGuestId(payload.guestId);
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

  socket.on("leaderboard:list", async (payload, callback) => {
    callback(ok(await publicLeaderboard(payload.limit)));
  });

  socket.on("cosmetics:list", async (callback) => {
    callback(ok(await publicCosmetics()));
  });

  socket.on("cosmetics:equip", async (payload, callback) => {
    const guestId = normalizeGuestId(payload.guestId);
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

  socket.on("profile:history", async (payload, callback) => {
    const guestId = normalizeGuestId(payload.guestId);

    if (guestId === null) {
      callback(fail("Guest profile not found."));
      return;
    }

    callback(ok(await publicMatchHistory(guestId, payload.limit)));
  });

  socket.on("lobby:get", (callback) => {
    callback(ok(publicLobbyState()));
  });

  socket.on("ranked:get", (callback) => {
    callback(ok(publicRankedQueueState(socket.id)));
  });

  socket.on("ranked:join", async (payload, callback) => {
    if (socket.data.roomCode !== undefined) {
      callback(fail("Leave your current room before joining ranked."));
      return;
    }

    if (!rankedQueue.some((entry) => entry.socketId === socket.id)) {
      rankedQueue = [
        ...rankedQueue,
        {
          socketId: socket.id,
          playerName: payload.playerName.trim() || "Ranked Player",
          guestId: normalizeGuestId(payload.guestId),
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

    const message: PublicChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      playerId: player.id,
      playerName: player.name,
      body,
      createdAt: new Date().toISOString()
    };

    room.chatMessages = [...room.chatMessages, message].slice(-MAX_CHAT_MESSAGES_PER_ROOM);
    callback(ok(message));
    io.to(room.code).emit("chat:message", message);
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

    if (room.game.activePlayerId !== player.id) {
      callback(fail("Move evaluation is only available on your turn."));
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

  socket.on("disconnect", () => {
    removeRankedQueueEntry(socket.id);
    emitRankedQueueState();

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
      bombEndsTrick: false
    },
    botDifficulty: "normal",
    turnDeadlineAt: null,
    timerTimeout: null
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

function leaveRoom(room: Room, playerId: string): void {
  if (room.game === null) {
    room.players = room.players.filter((player) => player.id !== playerId);

    if (room.players.length === 0) {
      clearTurnTimer(room);
      rooms.delete(room.code);
      emitLobbyState();
      return;
    }

    emitRoomState(room);
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
  emitRoomState(room);
  emitLobbyState();
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

function fillRoomWithBots(room: Room, botCount: number): void {
  let botsAdded = 0;

  while (room.players.length < MAX_PLAYERS_PER_ROOM && botsAdded < botCount) {
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

function normalizeBotCount(botCount: number | undefined, seatedPlayers: number): number {
  return clampInteger(botCount ?? MAX_PLAYERS_PER_ROOM, 0, MAX_PLAYERS_PER_ROOM - seatedPlayers);
}

function normalizeTimerSettings(
  timer: { readonly enabled: boolean; readonly secondsPerTurn: number } | undefined
): RoomTimerSettings {
  return {
    enabled: timer?.enabled ?? false,
    secondsPerTurn: clampInteger(timer?.secondsPerTurn ?? DEFAULT_TIMER_SECONDS, 1, 120)
  };
}

function normalizeRuleSettings(rules: PublicRoomRules | undefined): RoomRuleSettings {
  return {
    bombEndsTrick: rules?.bombEndsTrick ?? false
  };
}

function normalizeBotDifficulty(difficulty: PublicBotDifficulty | undefined): PublicBotDifficulty {
  return difficulty === "easy" || difficulty === "hard" ? difficulty : "normal";
}

function resetTurnTimer(room: Room): void {
  clearTurnTimer(room);

  if (room.game === null || room.game.status === "complete" || !room.timer.enabled) {
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
  if (room.game === null || room.game.status === "complete") {
    clearTurnTimer(room);
    return;
  }

  const activePlayer = room.players.find((player) => player.id === room.game?.activePlayerId);

  if (activePlayer === undefined) {
    return;
  }

  if (activePlayer.kind === "bot") {
    clearTurnTimer(room);
    room.timerTimeout = setTimeout(
      () => applyAutomatedMove(room, activePlayer.id, botStrategyForDifficulty(room.botDifficulty)),
      botMoveDelayMs()
    );
    room.timerTimeout.unref();
    return;
  }

  if (!room.timer.enabled || room.turnDeadlineAt === null) {
    return;
  }

  clearTurnTimer(room);
  room.timerTimeout = setTimeout(
    () => applyAutomatedMove(room, activePlayer.id, "lowest-legal"),
    Math.max(0, room.turnDeadlineAt.getTime() - Date.now())
  );
  room.timerTimeout.unref();
}

function botMoveDelayMs(): number {
  return (
    MIN_BOT_MOVE_DELAY_MS +
    Math.floor(Math.random() * (MAX_BOT_MOVE_DELAY_MS - MIN_BOT_MOVE_DELAY_MS + 1))
  );
}

function applyAutomatedMove(room: Room, playerId: string, strategy: BotStrategy): void {
  if (room.game === null || room.game.activePlayerId !== playerId) {
    return;
  }

  const playerState = getGamePlayer(room.game, playerId);
  const decision = chooseBotMove({
    hand: playerState.hand,
    context: {
      isFirstMove: room.game.turnNumber === 0,
      currentTrick: room.game.currentTrick
    },
    strategy
  });
  const result = applyMove(room.game, playerId, decision.move, room.rules);

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
            placement: toPlacement(placements.indexOf(player.id) + 1)
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

    if (ratingChange !== undefined) {
      profile.rating = ratingChange.ratingAfter;
    }
  }

  room.statsApplied = true;
}

function publicStateForSocket(room: Room, socketId: string): PublicRoomState {
  const player = room.players.find((candidate) => candidate.socketId === socketId);
  const hand =
    room.game === null || player === undefined ? [] : getGamePlayer(room.game, player.id).hand;

  return {
    roomCode: room.code,
    mode: room.mode,
    status: room.game?.status ?? "waiting",
    rules: room.rules,
    botDifficulty: room.botDifficulty,
    players: room.players.map((roomPlayer) => toPublicPlayer(room, roomPlayer)),
    activePlayerId: room.game?.activePlayerId ?? null,
    currentTrick: room.game?.currentTrick ?? null,
    turnNumber: room.game?.turnNumber ?? 0,
    placements: room.game?.placements ?? [],
    recentEvents: room.game?.events.slice(-12) ?? [],
    recentChat: room.chatMessages.slice(-20),
    turnTimer: publicTurnTimer(room),
    yourPlayerId: player?.id ?? null,
    yourHand: hand
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
    coachEvaluations: room.coachEvaluations
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
            averagePlacement:
              profile.gamesPlayed === 0 ? null : profile.placementTotal / profile.gamesPlayed
          },
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
        room.players.length < MAX_PLAYERS_PER_ROOM &&
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
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        botSeatsAvailable: MAX_PLAYERS_PER_ROOM - seatedPlayers,
        createdAt: room.createdAt.toISOString()
      };
    });
  const activeRooms = roomList.filter(
    (room) => room.game !== null && room.game.status === "in-progress"
  );
  const completedRooms = roomList.filter((room) => room.game?.status === "complete");

  return {
    activity: {
      openRooms: openRooms.length,
      activeRooms: activeRooms.length,
      completedRooms: completedRooms.length,
      connectedUsers: io.engine.clientsCount,
      seatedHumans: roomList.reduce(
        (total, room) => total + room.players.filter((player) => player.kind === "human").length,
        0
      ),
      seatedBots: roomList.reduce(
        (total, room) => total + room.players.filter((player) => player.kind === "bot").length,
        0
      ),
      playersInOpenRooms: openRooms.reduce((total, room) => total + room.seatedPlayers, 0),
      playersInActiveGames: activeRooms.reduce((total, room) => total + room.players.length, 0)
    },
    openRooms
  };
}

function publicRankedQueueState(socketId: string): PublicRankedQueueState {
  const queuedPlayers = rankedQueue.length;
  const playersNeeded = Math.max(0, RANKED_REQUIRED_PLAYERS - queuedPlayers);

  return {
    queuedPlayers,
    requiredPlayers: RANKED_REQUIRED_PLAYERS,
    etaSeconds: playersNeeded === 0 ? 0 : playersNeeded * 20,
    joined: rankedQueue.some((entry) => entry.socketId === socketId)
  };
}

function removeRankedQueueEntry(socketId: string): void {
  rankedQueue = rankedQueue.filter((entry) => entry.socketId !== socketId);
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

function normalizeAvatarKey(avatarKey: ProfileAvatarKey): ProfileAvatarKey {
  if (avatarKey === "club" || avatarKey === "heart" || avatarKey === "spade") {
    return avatarKey;
  }

  return "diamond";
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
    avatarKey: "diamond",
    rating: 1000,
    gamesPlayed: 0,
    wins: 0,
    placementTotal: 0
  };
  guestProfiles.set(guestId, profile);
  return profile;
}

async function publicGuestProfile(guestId: string): Promise<PublicGuestProfile> {
  const persistedProfile = await getPersistedGuestProfile(guestId);

  if (persistedProfile !== null) {
    const profile = getOrCreateGuestProfile(guestId);
    profile.displayName = persistedProfile.displayName;
    profile.avatarKey = persistedProfile.avatarKey;
    profile.rating = persistedProfile.rating;
    profile.gamesPlayed = persistedProfile.gamesPlayed;
    profile.wins = persistedProfile.wins;
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
    avatarKey: profile.avatarKey,
    rating: profile.rating,
    gamesPlayed: profile.gamesPlayed,
    wins: profile.wins,
    averagePlacement:
      profile.gamesPlayed === 0 ? null : profile.placementTotal / profile.gamesPlayed,
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
    maxTurnsPerRollout: 300
  }).map((evaluation) => ({
    move: evaluation.move,
    rollouts: evaluation.rollouts,
    wins: evaluation.wins,
    winRate: evaluation.winRate,
    averagePlacement: evaluation.averagePlacement
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

function toPlacement(value: number): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  return 4;
}

function shuffleDeck(): Card[] {
  const deck = createDeck();

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = deck[index];
    const swap = deck[swapIndex];

    if (current !== undefined && swap !== undefined) {
      deck[index] = swap;
      deck[swapIndex] = current;
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
