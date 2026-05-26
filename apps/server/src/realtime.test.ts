import { once } from "node:events";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  ClientToServerEvents,
  ChatPayload,
  CreateRoomPayload,
  JoinRoomPayload,
  PublicChatMessage,
  PublicLobbyState,
  PublicRoomState,
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
  payload: { readonly roomCode: string }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:start", payload, (ack) => {
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

function sendChat(socket: TestSocket, payload: ChatPayload): Promise<ServerAck<PublicChatMessage>> {
  return new Promise((resolve) => {
    socket.emit("chat:send", payload, (ack) => {
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
