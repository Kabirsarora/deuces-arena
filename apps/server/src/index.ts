import { createServer } from "node:http";

import {
  applyMove,
  chooseBotMove,
  createDeck,
  createInitialGame,
  type Card,
  type GameState,
  type PlayerState
} from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  InterServerEvents,
  PublicRoomPlayer,
  PublicRoomState,
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
  persistMoveEvent,
  type PersistedMatch
} from "./persistence.js";

type RoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
  readonly socketId: string | null;
};

type Room = {
  readonly code: string;
  readonly createdAt: Date;
  players: RoomPlayer[];
  game: GameState | null;
  persistedMatch: PersistedMatch | null;
};

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
const rooms = new Map<string, Room>();

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
    const room = createRoom(payload.playerName, socket.id);
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

    if (room.players.filter((player) => player.kind === "human").length >= 4) {
      callback(fail("Room is full."));
      return;
    }

    const player = addHumanPlayer(room, payload.playerName, socket.id);
    socket.data = {
      playerId: player.id,
      roomCode: room.code
    };
    socket.join(room.code);

    callback(ok(publicStateForSocket(room, socket.id)));
    emitRoomState(room);
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
    scheduleBotTurn(room);
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
  });
});

httpServer.listen(PORT, () => {
  console.log(`Deuces Arena server listening on http://localhost:${PORT}`);
});

function createRoom(playerName: string, socketId: string): Room {
  const code = createRoomCode();
  const room: Room = {
    code,
    createdAt: new Date(),
    players: [createHumanPlayer(playerName, socketId, 0)],
    game: null,
    persistedMatch: null
  };
  rooms.set(code, room);
  return room;
}

function addHumanPlayer(room: Room, playerName: string, socketId: string): RoomPlayer {
  const player = createHumanPlayer(playerName, socketId, room.players.length);
  room.players = [...room.players, player];
  return player;
}

function createHumanPlayer(playerName: string, socketId: string, seatIndex: number): RoomPlayer {
  return {
    id: `player-${seatIndex + 1}`,
    name: playerName.trim() || `Player ${seatIndex + 1}`,
    kind: "human",
    socketId
  };
}

function fillRoomWithBots(room: Room): void {
  while (room.players.length < 4) {
    const seatIndex = room.players.length;
    room.players = [
      ...room.players,
      {
        id: `player-${seatIndex + 1}`,
        name: `Bot ${seatIndex + 1}`,
        kind: "bot",
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

  void persistMoveEvent(room.persistedMatch, event);

  if (game.status === "complete") {
    void completePersistedMatch(room.persistedMatch, game);
  }
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

function toPublicPlayer(room: Room, player: RoomPlayer): PublicRoomPlayer {
  const gamePlayer = room.game?.players.find((candidate) => candidate.id === player.id);

  return {
    id: player.id,
    name: player.name,
    kind: player.kind,
    connected: player.kind === "bot" || player.socketId !== null,
    cardsRemaining: gamePlayer?.hand.length ?? 13
  };
}

function emitRoomState(room: Room): void {
  for (const player of room.players) {
    if (player.socketId !== null) {
      io.to(player.socketId).emit("room:state", publicStateForSocket(room, player.socketId));
    }
  }
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
