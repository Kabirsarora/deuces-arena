import { createServer } from "node:http";

import {
  applyMove,
  chooseBotMove,
  calculatePlacementRatingChanges,
  createDeck,
  createInitialGame,
  summarizeGame,
  type Card,
  type GameState,
  type PlayerState
} from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  InterServerEvents,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
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

import {
  completePersistedMatch,
  createPersistedMatch,
  getPersistedGuestProfile,
  getPersistedLeaderboard,
  getPersistedMatchHistory,
  persistMoveEvent,
  type PersistedMatch
} from "./persistence.js";

type RoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
  readonly guestId: string | null;
  readonly socketId: string | null;
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
  game: GameState | null;
  persistedMatch: PersistedMatch | null;
  statsApplied: boolean;
};

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
const MAX_PLAYERS_PER_ROOM = 4;
const rooms = new Map<string, Room>();
const guestProfiles = new Map<string, GuestProfile>();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "@deuces-arena/server",
    rooms: rooms.size
  });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: CLIENT_ORIGIN
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

    fillRoomWithBots(room);
    room.game = createInitialGame(
      room.players.map((player) => player.id),
      shuffleDeck()
    );
    room.persistedMatch = await createPersistedMatch(room.code, room.players);

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
    scheduleBotTurn(room);
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
    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
    emitLobbyState();
    scheduleBotTurn(room);
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

    room.players = room.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            socketId: null
          }
        : player
    );
    emitRoomState(room);
    emitLobbyState();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Deuces Arena server listening on http://localhost:${PORT}`);
});

function createRoom(playerName: string, socketId: string, guestId: string | undefined): Room {
  const code = createRoomCode();
  const room: Room = {
    code,
    createdAt: new Date(),
    players: [createHumanPlayer(playerName, socketId, 0, guestId)],
    game: null,
    persistedMatch: null,
    statsApplied: false
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
    socketId
  };
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
        socketId: null
      }
    ];
  }
}

function scheduleBotTurn(room: Room): void {
  if (room.game === null || room.game.status === "complete") {
    return;
  }

  const activePlayer = room.players.find((player) => player.id === room.game?.activePlayerId);

  if (activePlayer?.kind !== "bot") {
    return;
  }

  setTimeout(() => {
    if (room.game === null || room.game.activePlayerId !== activePlayer.id) {
      return;
    }

    const botState = getGamePlayer(room.game, activePlayer.id);
    const decision = chooseBotMove({
      hand: botState.hand,
      context: {
        isFirstMove: room.game.turnNumber === 0,
        currentTrick: room.game.currentTrick
      },
      strategy: "lowest-legal"
    });
    const result = applyMove(room.game, activePlayer.id, decision.move);

    if (result.ok) {
      room.game = result.state;
      persistLastMove(room);
      emitRoomState(room);
      emitLobbyState();
      scheduleBotTurn(room);
    }
  }, 700);
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
    events: room.game?.events ?? []
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
          }
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

function publicLobbyState(): PublicLobbyState {
  const roomList = [...rooms.values()];
  const openRooms = roomList
    .filter((room) => room.game === null && room.players.length < MAX_PLAYERS_PER_ROOM)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((room) => {
      const seatedPlayers = room.players.filter((player) => player.kind === "human").length;

      return {
        roomCode: room.code,
        hostName: room.players[0]?.name ?? "Open table",
        seatedPlayers,
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

    return persistedProfile;
  }

  const profile = getOrCreateGuestProfile(guestId);

  return {
    guestId,
    rating: profile.rating,
    gamesPlayed: profile.gamesPlayed,
    wins: profile.wins,
    averagePlacement:
      profile.gamesPlayed === 0 ? null : profile.placementTotal / profile.gamesPlayed
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
