import { once } from "node:events";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  ClientToServerEvents,
  ChatPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  PublicChatMessage,
  PublicCosmetic,
  PublicGuestProfile,
  PublicLobbyState,
  PublicMoveEvaluation,
  PublicRankedQueueState,
  PublicRoomState,
  RoomReplayExport,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server as SocketServer } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ServerModule = {
  readonly httpServer: HttpServer;
  readonly io: SocketServer<ClientToServerEvents, ServerToClientEvents>;
};

let serverModule: ServerModule;
let serverUrl: string;
const sockets: TestSocket[] = [];

beforeAll(async () => {
  process.env.PORT = "0";
  process.env.DATABASE_URL = "";
  process.env.CLIENT_ORIGIN = "http://localhost:3000, https://preview.example.com ";
  process.env.ADMIN_GUEST_IDS = "guest-admin-cosmetics";
  serverModule = await import("./index.js");

  if (serverModule.httpServer.address() === null) {
    await once(serverModule.httpServer, "listening");
  }

  const address = serverModule.httpServer.address() as AddressInfo;
  serverUrl = `http://localhost:${address.port}`;
});

afterAll(async () => {
  for (const socket of sockets) {
    socket.disconnect();
  }

  await new Promise<void>((resolve) => {
    serverModule.io.close(() => resolve());
  });
});

describe("realtime rooms", () => {
  it("exposes configured client origins in health checks", async () => {
    const response = await fetch(`${serverUrl}/health`);

    expect(response.ok).toBe(true);

    const health = (await response.json()) as { readonly allowedOrigins: readonly string[] };

    expect(health.allowedOrigins).toEqual(["http://localhost:3000", "https://preview.example.com"]);
  });

  it("returns cosmetic ownership fields with guest profiles", async () => {
    const socket = await connectTestSocket();
    const profile = await getProfile(socket, "guest-profile-cosmetics");

    expect(profile.ok).toBe(true);

    if (!profile.ok) {
      return;
    }

    expect(profile.data.guestId).toBe("guest-profile-cosmetics");
    expect(profile.data.unlocks).toEqual([]);
    expect(profile.data.equippedCosmetics).toEqual([]);
  });

  it("updates guest profile display name and avatar", async () => {
    const socket = await connectTestSocket();
    const profile = await updateProfile(socket, {
      guestId: "guest-profile-editor",
      displayName: "Arena Ace",
      avatarKey: "spade"
    });

    expect(profile.ok).toBe(true);

    if (!profile.ok) {
      return;
    }

    expect(profile.data.displayName).toBe("Arena Ace");
    expect(profile.data.avatarKey).toBe("spade");
  });

  it("serves the cosmetic catalog over REST and Socket.IO", async () => {
    const socket = await connectTestSocket();
    const socketCatalog = await listCosmetics(socket);

    expect(socketCatalog.ok).toBe(true);

    if (!socketCatalog.ok) {
      return;
    }

    expect(socketCatalog.data.map((cosmetic) => cosmetic.slug)).toContain("classic-red-card-back");
    expect(socketCatalog.data.some((cosmetic) => cosmetic.isSupporter)).toBe(true);

    const restResponse = await fetch(`${serverUrl}/cosmetics`);

    expect(restResponse.ok).toBe(true);

    const restCatalog = (await restResponse.json()) as PublicCosmetic[];
    expect(restCatalog.map((cosmetic) => cosmetic.slug)).toEqual(
      socketCatalog.data.map((cosmetic) => cosmetic.slug)
    );
  });

  it("rejects cosmetic equip requests when persistence is unavailable", async () => {
    const socket = await connectTestSocket();
    const equipAck = await equipCosmetic(socket, {
      guestId: "guest-profile-cosmetics",
      cosmeticId: "starter-classic-red-card-back"
    });

    expect(equipAck.ok).toBe(false);

    if (equipAck.ok) {
      return;
    }

    expect(equipAck.error).toContain("database");
  });

  it("allows configured admin profiles to equip any cosmetic without progression", async () => {
    const socket = await connectTestSocket();
    const catalog = await listCosmetics(socket);

    expect(catalog.ok).toBe(true);

    if (!catalog.ok) {
      return;
    }

    const supporterCosmetic = catalog.data.find((cosmetic) => cosmetic.isSupporter);

    expect(supporterCosmetic).toBeDefined();

    if (supporterCosmetic === undefined) {
      return;
    }

    const profile = await getProfile(socket, "guest-admin-cosmetics");

    expect(profile.ok).toBe(true);

    if (!profile.ok) {
      return;
    }

    expect(profile.data.unlocks.map((unlock) => unlock.cosmetic.id)).toContain(
      supporterCosmetic.id
    );

    const equipAck = await equipCosmetic(socket, {
      guestId: "guest-admin-cosmetics",
      cosmeticId: supporterCosmetic.id
    });

    expect(equipAck.ok).toBe(true);

    if (!equipAck.ok) {
      return;
    }

    expect(equipAck.data.equippedCosmetics.map((equipped) => equipped.cosmetic.id)).toContain(
      supporterCosmetic.id
    );
  });

  it("creates rooms and exposes them through lobby activity", async () => {
    const host = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Host",
      guestId: "guest-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    expect(createdRoom.data.status).toBe("waiting");
    expect(createdRoom.data.players).toHaveLength(1);
    expect(createdRoom.data.yourPlayerId).toBe("player-1");
    expect(createdRoom.data.yourHand).toHaveLength(0);
    expect(createdRoom.data.players[0]?.equippedCosmetics).toEqual([]);

    const lobby = await emitLobbyGet(host);

    expect(lobby.ok).toBe(true);

    if (!lobby.ok) {
      return;
    }

    expect(lobby.data.activity.openRooms).toBeGreaterThanOrEqual(1);
    expect(lobby.data.openRooms.some((room) => room.roomCode === createdRoom.data.roomCode)).toBe(
      true
    );
  });

  it("cleans up a player's previous waiting room when they create a new room", async () => {
    const host = await connectTestSocket();
    const firstRoom = await createRoom(host, {
      playerName: "Host",
      guestId: "guest-room-switch"
    });

    expect(firstRoom.ok).toBe(true);

    if (!firstRoom.ok) {
      return;
    }

    const secondRoom = await createRoom(host, {
      playerName: "Host",
      guestId: "guest-room-switch"
    });

    expect(secondRoom.ok).toBe(true);

    if (!secondRoom.ok) {
      return;
    }

    const lobby = await emitLobbyGet(host);

    expect(lobby.ok).toBe(true);

    if (!lobby.ok) {
      return;
    }

    expect(lobby.data.openRooms.some((room) => room.roomCode === firstRoom.data.roomCode)).toBe(
      false
    );
    expect(lobby.data.openRooms.some((room) => room.roomCode === secondRoom.data.roomCode)).toBe(
      true
    );
  });

  it("cleans up a player's previous waiting room when they join another room", async () => {
    const switchingPlayer = await connectTestSocket();
    const otherHost = await connectTestSocket();
    const firstRoom = await createRoom(switchingPlayer, {
      playerName: "Switcher",
      guestId: "guest-join-switch"
    });
    const secondRoom = await createRoom(otherHost, {
      playerName: "Host",
      guestId: "guest-join-host"
    });

    expect(firstRoom.ok).toBe(true);
    expect(secondRoom.ok).toBe(true);

    if (!firstRoom.ok || !secondRoom.ok) {
      return;
    }

    const joinedRoom = await joinRoom(switchingPlayer, {
      roomCode: secondRoom.data.roomCode,
      playerName: "Switcher",
      guestId: "guest-join-switch"
    });

    expect(joinedRoom.ok).toBe(true);

    if (!joinedRoom.ok) {
      return;
    }

    expect(joinedRoom.data.players.map((player) => player.name)).toEqual(["Host", "Switcher"]);

    const lobby = await emitLobbyGet(switchingPlayer);

    expect(lobby.ok).toBe(true);

    if (!lobby.ok) {
      return;
    }

    expect(lobby.data.openRooms.some((room) => room.roomCode === firstRoom.data.roomCode)).toBe(
      false
    );
    expect(lobby.data.openRooms.some((room) => room.roomCode === secondRoom.data.roomCode)).toBe(
      true
    );
  });

  it("requires all connected humans to be ready before starting a multiplayer room", async () => {
    const host = await connectTestSocket();
    const guest = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Host",
      guestId: "guest-ready-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const joinedRoom = await joinRoom(guest, {
      roomCode: createdRoom.data.roomCode,
      playerName: "Guest",
      guestId: "guest-ready-guest"
    });

    expect(joinedRoom.ok).toBe(true);

    if (!joinedRoom.ok) {
      return;
    }

    expect(joinedRoom.data.players).toHaveLength(2);

    const prematureStart = await startRoom(host, {
      roomCode: createdRoom.data.roomCode
    });

    expect(prematureStart.ok).toBe(false);

    if (prematureStart.ok) {
      return;
    }

    expect(prematureStart.error).toContain("ready");

    const hostReady = await setReady(host, {
      roomCode: createdRoom.data.roomCode,
      ready: true
    });
    const guestReady = await setReady(guest, {
      roomCode: createdRoom.data.roomCode,
      ready: true
    });

    expect(hostReady.ok).toBe(true);
    expect(guestReady.ok).toBe(true);

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    expect(startedRoom.data.status).toBe("in-progress");
    expect(startedRoom.data.players).toHaveLength(4);
    expect(startedRoom.data.players.filter((player) => player.kind === "bot")).toHaveLength(2);
    expect(startedRoom.data.yourHand).toHaveLength(13);
    expect(startedRoom.data.turnTimer).toBeNull();
  });

  it("starts rooms with optional turn timer metadata", async () => {
    const host = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Timer Host",
      guestId: "guest-timer-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      timer: {
        enabled: true,
        secondsPerTurn: 30
      }
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    expect(startedRoom.data.turnTimer?.enabled).toBe(true);
    expect(startedRoom.data.turnTimer?.secondsPerTurn).toBe(30);
    expect(startedRoom.data.turnTimer?.deadlineAt).not.toBeNull();
  });

  it("uses the requested casual bot count when starting rooms", async () => {
    const host = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Bot Host",
      guestId: "guest-bot-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const tooFewBots = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      botCount: 1
    });

    expect(tooFewBots.ok).toBe(false);

    if (tooFewBots.ok) {
      return;
    }

    expect(tooFewBots.error).toContain("4 seated players");

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      botCount: 3
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    expect(startedRoom.data.players.filter((player) => player.kind === "bot")).toHaveLength(3);
  });

  it("publishes casual room rule variants in room and lobby state", async () => {
    const host = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Rules Host",
      guestId: "guest-rules-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const lobbyBeforeStart = await emitLobbyGet(host);

    expect(lobbyBeforeStart.ok).toBe(true);

    if (!lobbyBeforeStart.ok) {
      return;
    }

    expect(
      lobbyBeforeStart.data.openRooms.find((room) => room.roomCode === createdRoom.data.roomCode)
        ?.rules
    ).toEqual({ bombEndsTrick: false });

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      botCount: 3,
      rules: {
        bombEndsTrick: true
      }
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    expect(startedRoom.data.rules).toEqual({ bombEndsTrick: true });
  });

  it("matches ranked queues with four humans and no bots", async () => {
    const players = await Promise.all([
      connectTestSocket(),
      connectTestSocket(),
      connectTestSocket(),
      connectTestSocket()
    ]);
    const matchedStates = players.map((socket) => waitForRoomState(socket));

    const joins = await Promise.all(
      players.map((socket, index) =>
        joinRanked(socket, {
          playerName: `Ranked ${index + 1}`,
          guestId: `guest-ranked-${index + 1}`
        })
      )
    );

    expect(joins.every((ack) => ack.ok)).toBe(true);

    const states = await Promise.all(matchedStates);
    const roomCodes = new Set(states.map((state) => state.roomCode));

    expect(roomCodes.size).toBe(1);
    expect(states[0]?.mode).toBe("RANKED");
    expect(states[0]?.players).toHaveLength(4);
    expect(states[0]?.players.every((player) => player.kind === "human")).toBe(true);
    expect(states[0]?.turnTimer?.secondsPerTurn).toBe(45);
  });

  it("sanitizes chat and broadcasts accepted messages to seated players", async () => {
    const host = await connectTestSocket();
    const guest = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Host",
      guestId: "guest-chat-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const joinedRoom = await joinRoom(guest, {
      roomCode: createdRoom.data.roomCode,
      playerName: "Guest",
      guestId: "guest-chat-guest"
    });

    expect(joinedRoom.ok).toBe(true);

    const broadcastPromise = waitForChatMessage(guest);
    const chatAck = await sendChat(host, {
      roomCode: createdRoom.data.roomCode,
      body: "hello shit table"
    });

    expect(chatAck.ok).toBe(true);

    if (!chatAck.ok) {
      return;
    }

    expect(chatAck.data.body).toBe("hello **** table");

    const broadcast = await broadcastPromise;
    expect(broadcast.body).toBe("hello **** table");
    expect(broadcast.playerName).toBe("Host");
  });

  it("only evaluates moves for the active player and includes coach records in replay export", async () => {
    const players = await Promise.all([
      connectTestSocket(),
      connectTestSocket(),
      connectTestSocket(),
      connectTestSocket()
    ]);
    const [host, second, third, fourth] = players;

    if (host === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error("Expected four connected sockets.");
    }

    const createdRoom = await createRoom(host, {
      playerName: "Coach Host",
      guestId: "guest-coach-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const roomCode = createdRoom.data.roomCode;
    const joinedRooms = await Promise.all([
      joinRoom(second, {
        roomCode,
        playerName: "Coach Two",
        guestId: "guest-coach-two"
      }),
      joinRoom(third, {
        roomCode,
        playerName: "Coach Three",
        guestId: "guest-coach-three"
      }),
      joinRoom(fourth, {
        roomCode,
        playerName: "Coach Four",
        guestId: "guest-coach-four"
      })
    ]);

    expect(joinedRooms.every((ack) => ack.ok)).toBe(true);

    await Promise.all(players.map((socket) => setReady(socket, { roomCode, ready: true })));
    const startedRoom = await startRoom(host, { roomCode });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok || startedRoom.data.activePlayerId === null) {
      return;
    }

    const socketsByPlayerId = new Map<string, TestSocket>(
      players.map((socket, index) => [`player-${index + 1}`, socket] as const)
    );
    const activeSocket = socketsByPlayerId.get(startedRoom.data.activePlayerId);
    const inactiveSocket = players.find((socket) => socket !== activeSocket);

    if (activeSocket === undefined || inactiveSocket === undefined) {
      throw new Error("Unable to resolve active and inactive sockets.");
    }

    const inactiveEvaluation = await evaluateMoves(inactiveSocket, {
      roomCode,
      rollouts: 1,
      maxMoves: 2
    });

    expect(inactiveEvaluation.ok).toBe(false);

    if (inactiveEvaluation.ok) {
      return;
    }

    expect(inactiveEvaluation.error).toContain("only available on your turn");

    const activeEvaluation = await evaluateMoves(activeSocket, {
      roomCode,
      rollouts: 1,
      maxMoves: 2
    });

    expect(activeEvaluation.ok).toBe(true);

    if (!activeEvaluation.ok) {
      return;
    }

    expect(activeEvaluation.data.length).toBeGreaterThan(0);
    expect(activeEvaluation.data.length).toBeLessThanOrEqual(2);
    expect(activeEvaluation.data[0]?.rollouts).toBe(1);

    const replay = await exportReplay(activeSocket, { roomCode });

    expect(replay.ok).toBe(true);

    if (!replay.ok) {
      return;
    }

    expect(replay.data.coachEvaluations).toHaveLength(1);
    expect(replay.data.coachEvaluations[0]?.playerId).toBe(startedRoom.data.activePlayerId);
    expect(replay.data.coachEvaluations[0]?.evaluations).toHaveLength(activeEvaluation.data.length);
  });
});

async function connectTestSocket(): Promise<TestSocket> {
  const socket: TestSocket = createClient(serverUrl, {
    forceNew: true,
    transports: ["websocket"]
  });
  sockets.push(socket);

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

function createRoom(
  socket: TestSocket,
  payload: CreateRoomPayload
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:create", payload, (ack) => {
      resolve(ack);
    });
  });
}

function joinRoom(
  socket: TestSocket,
  payload: JoinRoomPayload
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:join", payload, (ack) => {
      resolve(ack);
    });
  });
}

function startRoom(
  socket: TestSocket,
  payload: {
    readonly roomCode: string;
    readonly botCount?: number;
    readonly timer?: {
      readonly enabled: boolean;
      readonly secondsPerTurn: number;
    };
    readonly rules?: {
      readonly bombEndsTrick: boolean;
    };
  }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:start", payload, (ack) => {
      resolve(ack);
    });
  });
}

function joinRanked(
  socket: TestSocket,
  payload: { readonly playerName: string; readonly guestId?: string }
): Promise<ServerAck<PublicRankedQueueState>> {
  return new Promise((resolve) => {
    socket.emit("ranked:join", payload, (ack) => {
      resolve(ack);
    });
  });
}

function setReady(
  socket: TestSocket,
  payload: { readonly roomCode: string; readonly ready: boolean }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:ready", payload, (ack) => {
      resolve(ack);
    });
  });
}

function waitForRoomState(socket: TestSocket): Promise<PublicRoomState> {
  return new Promise((resolve) => {
    socket.once("room:state", (state) => {
      resolve(state);
    });
  });
}

function sendChat(socket: TestSocket, payload: ChatPayload): Promise<ServerAck<PublicChatMessage>> {
  return new Promise((resolve) => {
    socket.emit("chat:send", payload, (ack) => {
      resolve(ack);
    });
  });
}

function listCosmetics(socket: TestSocket): Promise<ServerAck<readonly PublicCosmetic[]>> {
  return new Promise((resolve) => {
    socket.emit("cosmetics:list", (ack) => {
      resolve(ack);
    });
  });
}

function getProfile(socket: TestSocket, guestId: string): Promise<ServerAck<PublicGuestProfile>> {
  return new Promise((resolve) => {
    socket.emit("profile:get", { guestId }, (ack) => {
      resolve(ack);
    });
  });
}

function updateProfile(
  socket: TestSocket,
  payload: { readonly guestId: string; readonly displayName: string; readonly avatarKey: "spade" }
): Promise<ServerAck<PublicGuestProfile>> {
  return new Promise((resolve) => {
    socket.emit("profile:update", payload, (ack) => {
      resolve(ack);
    });
  });
}

function equipCosmetic(
  socket: TestSocket,
  payload: { readonly guestId: string; readonly cosmeticId: string }
): Promise<ServerAck<PublicGuestProfile>> {
  return new Promise((resolve) => {
    socket.emit("cosmetics:equip", payload, (ack) => {
      resolve(ack);
    });
  });
}

function evaluateMoves(
  socket: TestSocket,
  payload: { readonly roomCode: string; readonly rollouts?: number; readonly maxMoves?: number }
): Promise<ServerAck<readonly PublicMoveEvaluation[]>> {
  return new Promise((resolve) => {
    socket.emit("coach:evaluate", payload, (ack) => {
      resolve(ack);
    });
  });
}

function exportReplay(
  socket: TestSocket,
  payload: { readonly roomCode: string }
): Promise<ServerAck<RoomReplayExport>> {
  return new Promise((resolve) => {
    socket.emit("room:replay", payload, (ack) => {
      resolve(ack);
    });
  });
}

function emitLobbyGet(socket: TestSocket): Promise<ServerAck<PublicLobbyState>> {
  return new Promise((resolve) => {
    socket.emit("lobby:get", (ack) => {
      resolve(ack);
    });
  });
}

function waitForChatMessage(socket: TestSocket): Promise<PublicChatMessage> {
  return new Promise((resolve) => {
    socket.once("chat:message", (message) => {
      resolve(message);
    });
  });
}
