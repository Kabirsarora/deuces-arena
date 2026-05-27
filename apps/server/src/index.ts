import { createServer } from "node:http";

import {
  applyMove,
  chooseBotMove,
  calculatePlacementRatingChanges,
  createDeck,
  createInitialGame,
  evaluateLegalMovesByRandomRollouts,
  summarizeGame,
  type Card,
  type GameState,
  type PlayerState
} from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  InterServerEvents,
  PublicChatMessage,
  PublicCoachEvaluationRecord,
  PublicCosmetic,
  PublicEquippedCosmetic,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicMoveEvaluation,
  PublicRoomPlayer,
  PublicRoomState,
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
  rating: number;
  gamesPlayed: number;
  wins: number;
  placementTotal: number;
};

type Room = {
  readonly code: string;
  readonly createdAt: Date;
  players: RoomPlayer[];
  chatMessages: PublicChatMessage[];
  coachEvaluations: PublicCoachEvaluationRecord[];
  game: GameState | null;
  persistedMatch: PersistedMatch | null;
  statsApplied: boolean;
  timer: RoomTimerSettings;
  turnDeadlineAt: Date | null;
  timerTimeout: NodeJS.Timeout | null;
};

type RoomTimerSettings = {
  readonly enabled: boolean;
  readonly secondsPerTurn: number;
};

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGINS = parseClientOrigins(process.env.CLIENT_ORIGIN);
const MAX_PLAYERS_PER_ROOM = 4;
const MAX_CHAT_MESSAGES_PER_ROOM = 50;
const MAX_COACH_EVALUATIONS_PER_ROOM = 50;
const DEFAULT_TIMER_SECONDS = 45;
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
  socket.on("room:create", (payload, callback) => {
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

    fillRoomWithBots(room);
    room.timer = normalizeTimerSettings(payload.timer);
    room.game = createInitialGame(
      room.players.map((player) => player.id),
      shuffleDeck()
    );
    room.persistedMatch = await createPersistedMatch(room.code, room.players);
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

    const result = applyMove(room.game, player.id, payload.move);

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
  const code = createRoomCode();
  const room: Room = {
    code,
    createdAt: new Date(),
    players: [createHumanPlayer(playerName, socketId, 0, guestId)],
    chatMessages: [],
    coachEvaluations: [],
    game: null,
    persistedMatch: null,
    statsApplied: false,
    timer: {
      enabled: false,
      secondsPerTurn: DEFAULT_TIMER_SECONDS
    },
    turnDeadlineAt: null,
    timerTimeout: null
  };
  rooms.set(code, room);
  return room;
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

function fillRoomWithBots(room: Room): void {
  while (room.players.length < MAX_PLAYERS_PER_ROOM) {
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
  }
}

function normalizeTimerSettings(
  timer: { readonly enabled: boolean; readonly secondsPerTurn: number } | undefined
): RoomTimerSettings {
  return {
    enabled: timer?.enabled ?? false,
    secondsPerTurn: clampInteger(timer?.secondsPerTurn ?? DEFAULT_TIMER_SECONDS, 1, 120)
  };
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
    const botTimeout = setTimeout(
      () => applyAutomatedMove(room, activePlayer.id, "simple-heuristic"),
      700
    );
    botTimeout.unref();
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

function applyAutomatedMove(
  room: Room,
  playerId: string,
  strategy: "lowest-legal" | "simple-heuristic"
): void {
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
  const result = applyMove(room.game, playerId, decision.move);

  if (result.ok) {
    room.game = result.state;
    persistLastMove(room);
    resetTurnTimer(room);
    emitRoomState(room);
    emitLobbyState();
    scheduleAutomatedTurn(room);
  }
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
  const ratingChanges = calculatePlacementRatingChanges(
    room.players.map((player) => ({
      playerId: player.id,
      ratingBefore: player.guestId === null ? 1000 : getOrCreateGuestProfile(player.guestId).rating,
      placement: toPlacement(placements.indexOf(player.id) + 1)
    }))
  );

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
    status: room.game?.status ?? "waiting",
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

function parseClientOrigins(value: string | undefined): string[] {
  const origins =
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== "") ?? [];

  return origins.length === 0 ? ["http://localhost:3000"] : origins;
}

function getOrCreateGuestProfile(guestId: string): GuestProfile {
  const existingProfile = guestProfiles.get(guestId);

  if (existingProfile !== undefined) {
    return existingProfile;
  }

  const profile: GuestProfile = {
    guestId,
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
    profile.rating = persistedProfile.rating;
    profile.gamesPlayed = persistedProfile.gamesPlayed;
    profile.wins = persistedProfile.wins;
    profile.placementTotal =
      persistedProfile.averagePlacement === null
        ? 0
        : persistedProfile.averagePlacement * persistedProfile.gamesPlayed;
    guestEquippedCosmetics.set(guestId, persistedProfile.equippedCosmetics);

    return persistedProfile;
  }

  const profile = getOrCreateGuestProfile(guestId);

  return {
    guestId,
    rating: profile.rating,
    gamesPlayed: profile.gamesPlayed,
    wins: profile.wins,
    averagePlacement:
      profile.gamesPlayed === 0 ? null : profile.placementTotal / profile.gamesPlayed,
    unlocks: [],
    equippedCosmetics: []
  };
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
    mode: "CASUAL",
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
