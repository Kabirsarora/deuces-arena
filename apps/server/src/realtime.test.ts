import { once } from "node:events";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { generateLegalMoves, type Card, type Move, type Rank } from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  ChatPayload,
  ConfigureRoomPayload,
  CreateRoomPayload,
  FeedbackPayload,
  JoinRoomPayload,
  PublicChatMessage,
  PublicCosmetic,
  PublicFeedbackReceipt,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicModerationReceipt,
  PublicMoveEvaluation,
  PublicRankedQueueState,
  PublicReplayDecisionReview,
  PublicRoomState,
  PublicTournamentQueueState,
  RoomReplayExport,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
import {
  createMobileAuthHandoffToken,
  createRealtimeAuthToken,
  verifyRealtimeAuthToken
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
const TEST_REALTIME_AUTH_SECRET = "test-realtime-auth-secret-with-at-least-32-characters";

beforeAll(async () => {
  process.env.PORT = "0";
  process.env.DATABASE_URL = "";
  process.env.CLIENT_ORIGIN = "http://localhost:3000, https://preview.example.com ";
  process.env.ADMIN_GUEST_IDS = "guest-admin-cosmetics";
  process.env.ADMIN_EMAILS = "creator@example.com";
  process.env.DISCONNECTED_AUTO_MOVE_DELAY_MS = "10";
  process.env.REALTIME_AUTH_SECRET = TEST_REALTIME_AUTH_SECRET;
  process.env.PUSH_NOTIFICATIONS_ENABLED = "false";
  delete process.env.EXPO_ACCESS_TOKEN;
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
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-powered-by")).toBeNull();

    const health = (await response.json()) as {
      readonly allowedOrigins: readonly string[];
      readonly config: {
        readonly database: string;
        readonly redis: string;
        readonly realtimeAuth: string;
        readonly pushNotifications: string;
        readonly disconnectedAutoMoveDelayMs: number;
      };
      readonly environment: string;
      readonly service: string;
      readonly uptimeSeconds: number;
    };

    expect(health.allowedOrigins).toEqual(["http://localhost:3000", "https://preview.example.com"]);
    expect(health.service).toBe("@deuces-arena/server");
    expect(health.environment).toBe("test");
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(health.config).toEqual({
      database: "memory-fallback",
      redis: "disabled",
      realtimeAuth: "configured",
      pushNotifications: "disabled",
      disconnectedAutoMoveDelayMs: 10
    });
  });

  it("exchanges only purpose-limited mobile account handoffs", async () => {
    const identity = { profileId: "auth-abcdefabcdefabcdefabcdefabcdefab" };
    const handoffToken = createMobileAuthHandoffToken(identity, TEST_REALTIME_AUTH_SECRET);
    const response = await fetch(`${serverUrl}/auth/mobile/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoffToken })
    });
    const session = (await response.json()) as {
      readonly token: string;
      readonly profileId: string;
    };

    expect(response.ok).toBe(true);
    expect(session.profileId).toBe(identity.profileId);
    expect(verifyRealtimeAuthToken(session.token, TEST_REALTIME_AUTH_SECRET)).toEqual(identity);

    const ordinaryToken = createRealtimeAuthToken(identity, TEST_REALTIME_AUTH_SECRET);
    const rejected = await fetch(`${serverUrl}/auth/mobile/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handoffToken: ordinaryToken })
    });
    expect(rejected.status).toBe(401);
  });

  it("protects the moderation queue with signed admin access", async () => {
    const unauthenticatedResponse = await fetch(`${serverUrl}/admin/moderation`);

    expect(unauthenticatedResponse.status).toBe(401);

    const playerToken = createRealtimeAuthToken(
      { profileId: "auth-11111111111111111111111111111111" },
      TEST_REALTIME_AUTH_SECRET
    );
    const playerResponse = await fetch(`${serverUrl}/admin/moderation`, {
      headers: { authorization: `Bearer ${playerToken}` }
    });

    expect(playerResponse.status).toBe(403);

    const adminToken = createRealtimeAuthToken(
      { profileId: "auth-758f27d1f066779a62a65665242b8780" },
      TEST_REALTIME_AUTH_SECRET
    );
    const adminResponse = await fetch(`${serverUrl}/admin/moderation`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });

    expect(adminResponse.status).toBe(503);
  });

  it("validates moderation status updates before persistence", async () => {
    const adminToken = createRealtimeAuthToken(
      { profileId: "auth-758f27d1f066779a62a65665242b8780" },
      TEST_REALTIME_AUTH_SECRET
    );
    const response = await fetch(`${serverUrl}/admin/player-reports/report-1`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ status: "INVALID" })
    });

    expect(response.status).toBe(400);
  });

  it("rejects oversized JSON request bodies", async () => {
    const response = await fetch(`${serverUrl}/admin/player-reports/report-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "REVIEWED", padding: "x".repeat(40_000) })
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Request payload is too large." });
  });

  it("returns cosmetic ownership fields with guest profiles", async () => {
    const socket = await connectTestSocket();
    const profile = await getProfile(socket, "guest-profile-cosmetics");

    expect(profile.ok).toBe(true);

    if (!profile.ok) {
      return;
    }

    expect(profile.data.guestId).toBe("guest-profile-cosmetics");
    expect(profile.data.arenaCoins).toBe(0);
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

  it("prevents guest sockets from claiming account profile IDs", async () => {
    const socket = await connectTestSocket();
    const update = await updateProfile(socket, {
      guestId: "auth-ffffffffffffffffffffffffffffffff",
      displayName: "Impersonator",
      avatarKey: "spade"
    });

    expect(update.ok).toBe(false);
  });

  it("binds account profile mutations to the signed socket identity", async () => {
    const profileId = "auth-11111111111111111111111111111111";
    const socket = await connectTestSocket(profileId);
    const update = await updateProfile(socket, {
      guestId: "auth-ffffffffffffffffffffffffffffffff",
      displayName: "Verified Player",
      avatarKey: "heart"
    });

    expect(update.ok).toBe(true);

    if (update.ok) {
      expect(update.data.guestId).toBe(profileId);
      expect(update.data.displayName).toBe("Verified Player");
    }
  });

  it("syncs account names and secure profile photos for authenticated sockets", async () => {
    const profileId = "auth-22222222222222222222222222222222";
    const socket = await connectTestSocket(profileId);
    const profile = await new Promise<ServerAck<PublicGuestProfile>>((resolve) => {
      socket.emit(
        "profile:sync-account",
        {
          displayName: "Photo Player",
          imageUrl: "https://images.example.com/player.png"
        },
        resolve
      );
    });

    expect(profile.ok).toBe(true);

    if (profile.ok) {
      expect(profile.data.guestId).toBe(profileId);
      expect(profile.data.displayName).toBe("Photo Player");
      expect(profile.data.imageUrl).toBe("https://images.example.com/player.png");
    }
  });

  it("rejects account profile syncs from guest sockets", async () => {
    const socket = await connectTestSocket();
    const profile = await new Promise<ServerAck<PublicGuestProfile>>((resolve) => {
      socket.emit(
        "profile:sync-account",
        { displayName: "Guest", imageUrl: "https://images.example.com/player.png" },
        resolve
      );
    });

    expect(profile.ok).toBe(false);
  });

  it("requires a signed account before registering table alerts", async () => {
    const socket = await connectTestSocket();
    const registration = await registerPushToken(socket, {
      expoPushToken: "ExpoPushToken[test-device-token]",
      platform: "ios"
    });

    expect(registration.ok).toBe(false);

    if (!registration.ok) {
      expect(registration.error).toContain("Sign in with Google");
    }
  });

  it("rejects malformed push tokens before accessing persistence", async () => {
    const socket = await connectTestSocket("auth-33333333333333333333333333333333");
    const registration = await registerPushToken(socket, {
      expoPushToken: "not-a-push-token",
      platform: "android"
    });

    expect(registration.ok).toBe(false);

    if (!registration.ok) {
      expect(registration.error).toContain("invalid");
    }
  });

  it("fails safely when push persistence is unavailable", async () => {
    const socket = await connectTestSocket("auth-44444444444444444444444444444444");
    const registration = await registerPushToken(socket, {
      expoPushToken: "ExpoPushToken[valid-test-device-token]",
      platform: "ios"
    });

    expect(registration.ok).toBe(false);

    if (!registration.ok) {
      expect(registration.error).toContain("temporarily unavailable");
    }
  });

  it("serves the cosmetic catalog over REST and Socket.IO", async () => {
    const socket = await connectTestSocket();
    const socketCatalog = await listCosmetics(socket);

    expect(socketCatalog.ok).toBe(true);

    if (!socketCatalog.ok) {
      return;
    }

    expect(socketCatalog.data.map((cosmetic) => cosmetic.slug)).toContain("classic-red-card-back");
    expect(socketCatalog.data.map((cosmetic) => cosmetic.slug)).toContain("lagoon-table");
    expect(socketCatalog.data.map((cosmetic) => cosmetic.slug)).toContain("neon-grid-card-back");
    expect(socketCatalog.data.map((cosmetic) => cosmetic.slug)).toContain("aqua-pulse-avatar");
    expect(socketCatalog.data.map((cosmetic) => cosmetic.slug)).toContain("aqua-profile-border");
    expect(socketCatalog.data.some((cosmetic) => cosmetic.isSupporter)).toBe(true);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "midnight-felt-table")?.coinPrice
    ).toBe(500);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "obsidian-table")?.coinPrice
    ).toBe(4000);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "arena-six-crest-card-back")
        ?.coinPrice
    ).toBe(6000);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "celestial-vault-card-back")
        ?.coinPrice
    ).toBe(7500);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "orchard-salon-card-back")?.coinPrice
    ).toBe(5000);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "ember-throne-table")?.coinPrice
    ).toBe(16000);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "voidglass-prism-card-back")
        ?.previewUrl
    ).toBe("/art/voidglass-prism-card-back.jpg");
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "pool-shark-card-back")?.coinPrice
    ).toBe(1800);
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "bengal-bloom-card-back")?.previewUrl
    ).toBe("/art/bengal-bloom-card-back.jpg");
    expect(
      socketCatalog.data.find((cosmetic) => cosmetic.slug === "jungle-club-table")?.coinPrice
    ).toBe(7200);

    const restResponse = await fetch(`${serverUrl}/cosmetics`);

    expect(restResponse.ok).toBe(true);

    const restCatalog = (await restResponse.json()) as PublicCosmetic[];
    expect(restCatalog.map((cosmetic) => cosmetic.slug)).toEqual(
      socketCatalog.data.map((cosmetic) => cosmetic.slug)
    );
  });

  it("serves the public leaderboard over REST", async () => {
    const response = await fetch(`${serverUrl}/leaderboard?limit=3`);

    expect(response.ok).toBe(true);

    const leaderboard = (await response.json()) as PublicLeaderboardEntry[];
    expect(Array.isArray(leaderboard)).toBe(true);
    expect(leaderboard.length).toBeLessThanOrEqual(3);
  });

  it("serves profile, match history, and tournament history over REST", async () => {
    const profileResponse = await fetch(`${serverUrl}/profiles/guest-rest-profile`);

    expect(profileResponse.ok).toBe(true);

    const profile = (await profileResponse.json()) as PublicGuestProfile;
    expect(profile.guestId).toBe("guest-rest-profile");
    expect(profile.rating).toBe(1000);
    expect(profile.unlocks).toEqual([]);

    const historyResponse = await fetch(`${serverUrl}/profiles/guest-rest-profile/history?limit=3`);

    expect(historyResponse.ok).toBe(true);

    const history = (await historyResponse.json()) as unknown[];
    expect(history).toEqual([]);

    const tournamentResponse = await fetch(
      `${serverUrl}/profiles/guest-rest-profile/tournaments?limit=3`
    );

    expect(tournamentResponse.ok).toBe(true);
    expect((await tournamentResponse.json()) as unknown[]).toEqual([]);
  });

  it("accepts replay labels without requiring database persistence", async () => {
    const socket = await connectTestSocket();
    const labelAck = await labelReplay(socket, {
      guestId: "guest-rest-profile",
      matchId: "local-match",
      label: "Close finish"
    });

    expect(labelAck.ok).toBe(true);

    if (!labelAck.ok) {
      return;
    }

    expect(labelAck.data).toEqual([]);
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

  it("rejects cosmetic purchase requests when persistence is unavailable", async () => {
    const socket = await connectTestSocket();
    const purchaseAck = await purchaseCosmetic(socket, {
      guestId: "guest-profile-cosmetics",
      cosmeticId: "starter-midnight-felt-table"
    });

    expect(purchaseAck.ok).toBe(false);

    if (purchaseAck.ok) {
      return;
    }

    expect(purchaseAck.error).toContain("database");
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
    expect(profile.data.isAdmin).toBe(true);
    expect(profile.data.arenaCoins).toBe(Number.MAX_SAFE_INTEGER);

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

    const createdRoom = await createRoom(socket, {
      playerName: "Creator",
      guestId: "guest-admin-cosmetics"
    });

    expect(createdRoom.ok).toBe(true);

    if (createdRoom.ok) {
      expect(
        createdRoom.data.players[0]?.equippedCosmetics.map((equipped) => equipped.cosmetic.id)
      ).toContain(supporterCosmetic.id);
    }
  });

  it("allows configured admin emails to equip any cosmetic", async () => {
    const adminProfileId = "auth-758f27d1f066779a62a65665242b8780";
    const socket = await connectTestSocket(adminProfileId);
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

    const profile = await getProfile(socket, adminProfileId);

    expect(profile.ok).toBe(true);

    if (!profile.ok) {
      return;
    }

    expect(profile.data.unlocks.map((unlock) => unlock.cosmetic.id)).toContain(
      supporterCosmetic.id
    );
    expect(profile.data.isAdmin).toBe(true);
    expect(profile.data.arenaCoins).toBe(Number.MAX_SAFE_INTEGER);

    const syncedProfile = await syncAccountProfile(socket, {
      displayName: "Creator",
      imageUrl: "https://example.com/creator.png"
    });

    expect(syncedProfile.ok).toBe(true);

    if (!syncedProfile.ok) {
      return;
    }

    expect(syncedProfile.data.isAdmin).toBe(true);
    expect(syncedProfile.data.arenaCoins).toBe(Number.MAX_SAFE_INTEGER);
    expect(syncedProfile.data.unlocks).toHaveLength(catalog.data.length);
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

  it("keeps waiting-room settings server-authoritative and host-only", async () => {
    const host = await connectTestSocket();
    const guest = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Host",
      guestId: "guest-config-host"
    });

    expect(createdRoom.ok).toBe(true);
    if (!createdRoom.ok) return;

    const roomCode = createdRoom.data.roomCode;
    const joinedRoom = await joinRoom(guest, {
      roomCode,
      playerName: "Guest",
      guestId: "guest-config-guest"
    });
    expect(joinedRoom.ok).toBe(true);
    if (!joinedRoom.ok) return;

    expect(createdRoom.data.hostPlayerId).toBe(createdRoom.data.yourPlayerId);

    const guestConfigure = await configureRoom(guest, {
      roomCode,
      botCount: 4,
      rules: {
        bombEndsTrick: true,
        deckType: "arena-six",
        playerCount: 6,
        cardsPerPlayer: 13
      },
      timer: { enabled: true, secondsPerTurn: 60 },
      botDifficulty: "hard",
      botPace: "quick",
      trade: { enabled: true }
    });
    expect(guestConfigure.ok).toBe(false);
    if (!guestConfigure.ok) expect(guestConfigure.error).toContain("host");

    await setReady(host, { roomCode, ready: true });
    await setReady(guest, { roomCode, ready: true });
    const guestUpdate = waitForRoomStateMatching(
      guest,
      (state) => state.rules.playerCount === 6 && state.configuredBotCount === 4
    );
    const configured = await configureRoom(host, {
      roomCode,
      botCount: 4,
      rules: {
        bombEndsTrick: true,
        deckType: "arena-six",
        playerCount: 6,
        cardsPerPlayer: 13
      },
      timer: { enabled: true, secondsPerTurn: 60 },
      botDifficulty: "hard",
      botPace: "quick",
      trade: { enabled: true }
    });

    expect(configured.ok).toBe(true);
    if (!configured.ok) return;
    expect(configured.data.rules).toEqual({
      bombEndsTrick: true,
      deckType: "arena-six",
      playerCount: 6,
      cardsPerPlayer: 13
    });
    expect(configured.data.timerSettings).toEqual({ enabled: true, secondsPerTurn: 60 });
    expect(configured.data.tradeEnabled).toBe(true);
    expect(configured.data.botDifficulty).toBe("hard");
    expect(configured.data.botPace).toBe("quick");
    expect(configured.data.players.every((player) => !player.ready)).toBe(true);
    expect((await guestUpdate).rules).toEqual(configured.data.rules);

    const guestStart = await startRoom(guest, { roomCode, botCount: 4 });
    expect(guestStart.ok).toBe(false);
    if (!guestStart.ok) expect(guestStart.error).toContain("host");
  });

  it("transfers waiting-room host ownership without reusing player IDs", async () => {
    const host = await connectTestSocket();
    const nextHost = await connectTestSocket();
    const replacement = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Original Host",
      guestId: "guest-transfer-host"
    });

    expect(createdRoom.ok).toBe(true);
    if (!createdRoom.ok) return;
    const roomCode = createdRoom.data.roomCode;
    const joinedRoom = await joinRoom(nextHost, {
      roomCode,
      playerName: "Next Host",
      guestId: "guest-transfer-next"
    });
    expect(joinedRoom.ok).toBe(true);
    if (!joinedRoom.ok) return;

    const nextHostUpdate = waitForRoomStateMatching(
      nextHost,
      (state) => state.hostPlayerId === joinedRoom.data.yourPlayerId
    );
    const left = await leaveStartedRoom(host, roomCode);
    expect(left.ok).toBe(true);
    expect((await nextHostUpdate).hostPlayerId).toBe(joinedRoom.data.yourPlayerId);

    const replacementRoom = await joinRoom(replacement, {
      roomCode,
      playerName: "Replacement",
      guestId: "guest-transfer-replacement"
    });
    expect(replacementRoom.ok).toBe(true);
    if (!replacementRoom.ok) return;

    const playerIds = replacementRoom.data.players.map((player) => player.id);
    expect(new Set(playerIds).size).toBe(playerIds.length);
    expect(replacementRoom.data.hostPlayerId).toBe(joinedRoom.data.yourPlayerId);

    const configured = await configureRoom(nextHost, {
      roomCode,
      botCount: 2,
      rules: {
        bombEndsTrick: false,
        deckType: "classic",
        playerCount: 4,
        cardsPerPlayer: 13
      },
      timer: { enabled: false, secondsPerTurn: 45 },
      botDifficulty: "normal",
      botPace: "relaxed",
      trade: { enabled: false }
    });
    expect(configured.ok).toBe(true);
  });

  it("runs a private, server-authoritative casual card trade window", async () => {
    const host = await connectTestSocket();
    const guest = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Trade Host",
      guestId: "guest-trade-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const roomCode = createdRoom.data.roomCode;
    const joinedRoom = await joinRoom(guest, {
      roomCode,
      playerName: "Trade Guest",
      guestId: "guest-trade-guest"
    });

    expect(joinedRoom.ok).toBe(true);

    if (!joinedRoom.ok) {
      return;
    }

    await setReady(host, { roomCode, ready: true });
    await setReady(guest, { roomCode, ready: true });
    const guestStartedState = waitForRoomStateMatching(
      guest,
      (state) => state.status === "in-progress" && state.tradePhase.status === "open"
    );
    const startedRoom = await startRoom(host, {
      roomCode,
      trade: { enabled: true }
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    const guestState = await guestStartedState;
    const hostPlayerId = startedRoom.data.yourPlayerId;
    const guestPlayerId = guestState.yourPlayerId;
    const offeredCard = startedRoom.data.yourHand[0];
    const requestedCard = guestState.yourHand[0];

    expect(startedRoom.data.tradePhase.status).toBe("open");
    expect(startedRoom.data.tradePhase.deadlineAt).not.toBeNull();
    expect(startedRoom.data.activePlayerId).toBeNull();
    expect(hostPlayerId).not.toBeNull();
    expect(guestPlayerId).not.toBeNull();
    expect(offeredCard).toBeDefined();
    expect(requestedCard).toBeDefined();

    if (
      hostPlayerId === null ||
      guestPlayerId === null ||
      offeredCard === undefined ||
      requestedCard === undefined
    ) {
      return;
    }

    const guestRequestState = waitForRoomStateMatching(
      guest,
      (state) => state.tradePhase.requests.length === 1
    );
    const requestAck = await requestTrade(host, {
      roomCode,
      toPlayerId: guestPlayerId,
      offeredCard,
      requestedRank: requestedCard.rank
    });

    expect(requestAck.ok).toBe(true);

    if (!requestAck.ok) {
      return;
    }

    expect(requestAck.data.tradePhase.yourRequestUsed).toBe(true);
    expect(requestAck.data.tradePhase.requests).toHaveLength(1);
    const duplicateRequest = await requestTrade(host, {
      roomCode,
      toPlayerId: guestPlayerId,
      offeredCard,
      requestedRank: requestedCard.rank
    });
    expect(duplicateRequest.ok).toBe(false);
    const requestId = requestAck.data.tradePhase.requests[0]?.id;
    const guestWithRequest = await guestRequestState;
    expect(guestWithRequest.tradePhase.requests[0]?.offeredCard).toEqual(offeredCard);

    if (requestId === undefined) {
      return;
    }

    const wrongRequestedCard = guestState.yourHand.find((card) => card.rank !== requestedCard.rank);

    if (wrongRequestedCard !== undefined) {
      const invalidResponse = await respondToTrade(guest, {
        roomCode,
        requestId,
        accept: true,
        requestedCard: wrongRequestedCard
      });
      expect(invalidResponse.ok).toBe(false);
    }

    const hostCompletedState = waitForRoomStateMatching(
      host,
      (state) => state.tradePhase.completedTradeCount === 1
    );
    const responseAck = await respondToTrade(guest, {
      roomCode,
      requestId,
      accept: true,
      requestedCard
    });

    expect(responseAck.ok).toBe(true);

    if (!responseAck.ok) {
      return;
    }

    const hostAfterTrade = await hostCompletedState;
    expect(responseAck.data.tradePhase.yourTradeCompleted).toBe(true);
    expect(responseAck.data.yourHand).toContainEqual(offeredCard);
    expect(responseAck.data.yourHand).not.toContainEqual(requestedCard);
    expect(hostAfterTrade.yourHand).toContainEqual(requestedCard);
    expect(hostAfterTrade.yourHand).not.toContainEqual(offeredCard);
    expect(hostAfterTrade.tradePhase.requests).toHaveLength(0);

    const replay = await exportReplay(host, { roomCode });
    expect(replay.ok).toBe(false);

    if (!replay.ok) {
      expect(replay.error).toContain("after the match");
    }
  });

  it("never exposes private hand snapshots in live room events", async () => {
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
      playerName: "Privacy Host",
      guestId: "guest-privacy-host"
    });
    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const roomCode = createdRoom.data.roomCode;
    const joinedRooms = await Promise.all([
      joinRoom(second, { roomCode, playerName: "Privacy Two", guestId: "guest-privacy-two" }),
      joinRoom(third, {
        roomCode,
        playerName: "Privacy Three",
        guestId: "guest-privacy-three"
      }),
      joinRoom(fourth, {
        roomCode,
        playerName: "Privacy Four",
        guestId: "guest-privacy-four"
      })
    ]);
    expect(joinedRooms.every((ack) => ack.ok)).toBe(true);

    await Promise.all(players.map((socket) => setReady(socket, { roomCode, ready: true })));
    const otherStartedStates = players
      .slice(1)
      .map((socket) => waitForRoomStateMatching(socket, (state) => state.status === "in-progress"));
    const startedRoom = await startRoom(host, { roomCode });
    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    const playerStates = [startedRoom.data, ...(await Promise.all(otherStartedStates))];
    const activeIndex = playerStates.findIndex(
      (state) => state.yourPlayerId === state.activePlayerId
    );
    const activeSocket = players[activeIndex];
    const activeState = playerStates[activeIndex];
    const observerSocket = players[(activeIndex + 1) % players.length];

    if (activeSocket === undefined || activeState === undefined || observerSocket === undefined) {
      throw new Error("Unable to resolve active and observing players.");
    }

    const move = generateLegalMoves(activeState.yourHand, {
      isFirstMove: true,
      currentTrick: null
    })[0];

    if (move === undefined) {
      throw new Error("Expected a legal opening move.");
    }

    const observerUpdate = waitForRoomStateMatching(
      observerSocket,
      (state) => state.recentEvents.length === 1
    );
    const moveAck = await submitMove(activeSocket, { roomCode, move });
    const observerState = await observerUpdate;

    expect(moveAck.ok).toBe(true);

    if (moveAck.ok) {
      expect(moveAck.data.recentEvents[0]).not.toHaveProperty("handBefore");
    }

    expect(observerState.recentEvents[0]).not.toHaveProperty("handBefore");

    const replay = await exportReplay(activeSocket, { roomCode });
    expect(replay.ok).toBe(false);

    if (!replay.ok) {
      expect(replay.error).toContain("after the match");
    }
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

  it("keeps a started room moving when the active player disconnects", async () => {
    const players = await Promise.all([
      connectTestSocket(),
      connectTestSocket(),
      connectTestSocket(),
      connectTestSocket()
    ]);
    const [host, second, third, fourth] = players;

    if (host === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error("Unable to create test sockets.");
    }

    const createdRoom = await createRoom(host, {
      playerName: "Host",
      guestId: "guest-disconnect-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    for (const [socket, playerName, guestId] of [
      [second, "Second", "guest-disconnect-second"],
      [third, "Third", "guest-disconnect-third"],
      [fourth, "Fourth", "guest-disconnect-fourth"]
    ] as const) {
      const joinedRoom = await joinRoom(socket, {
        roomCode: createdRoom.data.roomCode,
        playerName,
        guestId
      });

      expect(joinedRoom.ok).toBe(true);
    }

    for (const socket of players) {
      const readyRoom = await setReady(socket, {
        roomCode: createdRoom.data.roomCode,
        ready: true
      });

      expect(readyRoom.ok).toBe(true);
    }

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      botCount: 0
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok || startedRoom.data.activePlayerId === null) {
      return;
    }

    const socketsByPlayerId = new Map(
      startedRoom.data.players.map((player, index) => [player.id, players[index]])
    );
    const activeSocket = socketsByPlayerId.get(startedRoom.data.activePlayerId);
    const observer = players.find((socket) => socket !== activeSocket);

    if (activeSocket === undefined || observer === undefined) {
      throw new Error("Unable to resolve active player socket.");
    }

    const disconnectedStatePromise = waitForRoomStateMatching(observer, (state) =>
      state.players.some(
        (player) => player.id === startedRoom.data.activePlayerId && !player.connected
      )
    );
    activeSocket.disconnect();
    const disconnectedState = await disconnectedStatePromise;

    expect(
      disconnectedState.players.find((player) => player.id === startedRoom.data.activePlayerId)
        ?.connected
    ).toBe(false);

    const advancedState = await waitForRoomStateMatching(
      observer,
      (state) => state.turnNumber > startedRoom.data.turnNumber
    );

    expect(advancedState.turnNumber).toBeGreaterThan(startedRoom.data.turnNumber);
    expect(advancedState.activePlayerId).not.toBe(startedRoom.data.activePlayerId);
  });

  it("only reconnects a seat to its original profile identity", async () => {
    const owner = await connectTestSocket();
    const createdRoom = await createRoom(owner, {
      playerName: "Seat Owner",
      guestId: "guest-seat-owner"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok || createdRoom.data.yourPlayerId === null) {
      return;
    }

    const roomCode = createdRoom.data.roomCode;
    const playerId = createdRoom.data.yourPlayerId;
    const startedRoom = await startRoom(owner, {
      roomCode,
      botCount: 3
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    owner.disconnect();

    const attacker = await connectTestSocket();
    const stolenSeat = await reconnectRoom(attacker, {
      roomCode,
      playerId,
      guestId: "guest-seat-attacker"
    });

    expect(stolenSeat.ok).toBe(false);

    const returningOwner = await connectTestSocket();
    const restoredSeat = await reconnectRoom(returningOwner, {
      roomCode,
      playerId,
      guestId: "guest-seat-owner"
    });

    expect(restoredSeat.ok).toBe(true);
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
    ).toEqual({
      bombEndsTrick: false,
      deckType: "classic",
      playerCount: 4,
      cardsPerPlayer: 13
    });

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      botCount: 3,
      botPace: "quick",
      rules: {
        bombEndsTrick: true,
        deckType: "arena-six",
        playerCount: 4,
        cardsPerPlayer: 15
      }
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    expect(startedRoom.data.rules).toEqual({
      bombEndsTrick: true,
      deckType: "arena-six",
      playerCount: 4,
      cardsPerPlayer: 15
    });
    expect(startedRoom.data.botPace).toBe("quick");
    expect(startedRoom.data.yourHand).toHaveLength(15);
  });

  it("starts six-player arena tables with expanded suits", async () => {
    const host = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Arena Host",
      guestId: "guest-arena-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      botCount: 5,
      botDifficulty: "hard",
      rules: {
        bombEndsTrick: false,
        deckType: "arena-six",
        playerCount: 6,
        cardsPerPlayer: 13
      }
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    expect(startedRoom.data.players).toHaveLength(6);
    expect(startedRoom.data.players.filter((player) => player.kind === "bot")).toHaveLength(5);
    expect(startedRoom.data.yourHand).toHaveLength(13);
    expect(startedRoom.data.rules.deckType).toBe("arena-six");
    expect(startedRoom.data.botDifficulty).toBe("hard");
  });

  it("closes a started bot room when its only human explicitly leaves", async () => {
    const host = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Leaving Host",
      guestId: "guest-leaving-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const startedRoom = await startRoom(host, {
      roomCode: createdRoom.data.roomCode,
      botCount: 3
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    const activeRoomsBefore = await getActiveRoomCount();
    const leftRoom = await leaveStartedRoom(host, createdRoom.data.roomCode);
    const activeRoomsAfter = await getActiveRoomCount();

    expect(leftRoom.ok).toBe(true);
    expect(activeRoomsAfter).toBe(activeRoomsBefore - 1);
  });

  it("matches ranked queues with four humans and no bots", async () => {
    const players = await Promise.all(
      [1, 2, 3, 4].map((index) => connectTestSocket(`auth-${index.toString(16).padStart(32, "0")}`))
    );
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

  it("starts two tournament semifinals for eight authenticated humans", async () => {
    const players = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        connectTestSocket(`auth-${(index + 20).toString(16).padStart(32, "0")}`)
      )
    );
    const matchedStates = players.map((socket) => waitForRoomState(socket));
    const joins = await Promise.all(
      players.map((socket, index) => joinTournament(socket, `Cup Player ${index + 1}`))
    );

    expect(joins.every((ack) => ack.ok)).toBe(true);

    const states = await Promise.all(matchedStates);
    const roomCodes = new Set(states.map((state) => state.roomCode));

    expect(roomCodes.size).toBe(2);
    expect(states.every((state) => state.mode === "TOURNAMENT")).toBe(true);
    expect(states.every((state) => state.players.length === 4)).toBe(true);
    expect(states.every((state) => state.players.every((player) => player.kind === "human"))).toBe(
      true
    );
    expect(states.every((state) => state.turnTimer?.secondsPerTurn === 45)).toBe(true);
  });

  it("reports ranked queue position before a match starts", async () => {
    const first = await connectTestSocket("auth-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const second = await connectTestSocket("auth-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const firstJoin = await joinRanked(first, {
      playerName: "Queue One",
      guestId: "guest-ranked-position-1"
    });
    const secondJoin = await joinRanked(second, {
      playerName: "Queue Two",
      guestId: "guest-ranked-position-2"
    });

    expect(firstJoin.ok).toBe(true);
    expect(secondJoin.ok).toBe(true);

    if (!firstJoin.ok || !secondJoin.ok) {
      return;
    }

    expect(firstJoin.data.joined).toBe(true);
    expect(firstJoin.data.queuePosition).toBe(1);
    expect(secondJoin.data.joined).toBe(true);
    expect(secondJoin.data.queuePosition).toBe(2);
    expect(secondJoin.data.queuedPlayers).toBe(2);

    await leaveRanked(first);
    await leaveRanked(second);
  });

  it("requires a verified account before joining ranked", async () => {
    const guest = await connectTestSocket();
    const join = await joinRanked(guest, {
      playerName: "Guest Queue",
      guestId: "guest-ranked-blocked"
    });

    expect(join.ok).toBe(false);

    if (!join.ok) {
      expect(join.error).toContain("Sign in with Google");
    }
  });

  it("prevents one account from taking multiple ranked queue seats", async () => {
    const profileId = "auth-cccccccccccccccccccccccccccccccc";
    const firstTab = await connectTestSocket(profileId);
    const secondTab = await connectTestSocket(profileId);
    const firstJoin = await joinRanked(firstTab, {
      playerName: "Ranked Account",
      guestId: profileId
    });
    const secondJoin = await joinRanked(secondTab, {
      playerName: "Ranked Account Again",
      guestId: profileId
    });

    expect(firstJoin.ok).toBe(true);
    expect(secondJoin.ok).toBe(false);

    if (!secondJoin.ok) {
      expect(secondJoin.error).toContain("already in the ranked queue");
    }

    await leaveRanked(firstTab);
  });

  it("prevents an account seated at another table from entering ranked", async () => {
    const profileId = "auth-dddddddddddddddddddddddddddddddd";
    const seatedTab = await connectTestSocket(profileId);
    const rankedTab = await connectTestSocket(profileId);
    const createdRoom = await createRoom(seatedTab, {
      playerName: "Already Playing",
      guestId: profileId
    });

    expect(createdRoom.ok).toBe(true);

    const rankedJoin = await joinRanked(rankedTab, {
      playerName: "Second Tab",
      guestId: profileId
    });

    expect(rankedJoin.ok).toBe(false);

    if (!rankedJoin.ok) {
      expect(rankedJoin.error).toContain("already seated");
    }

    if (createdRoom.ok) {
      await leaveStartedRoom(seatedTab, createdRoom.data.roomCode);
    }
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

  it("blocks player chat history and accepts structured moderation reports", async () => {
    const host = await connectTestSocket();
    const guest = await connectTestSocket();
    const createdRoom = await createRoom(host, {
      playerName: "Safety Host",
      guestId: "guest-safety-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const joinedRoom = await joinRoom(guest, {
      roomCode: createdRoom.data.roomCode,
      playerName: "Safety Guest",
      guestId: "guest-safety-guest"
    });

    expect(joinedRoom.ok).toBe(true);

    if (!joinedRoom.ok) {
      return;
    }

    const hostPlayerId = createdRoom.data.yourPlayerId;

    if (hostPlayerId === null) {
      throw new Error("Expected host player id.");
    }

    const firstMessage = await sendChat(host, {
      roomCode: createdRoom.data.roomCode,
      body: "message to moderate"
    });

    expect(firstMessage.ok).toBe(true);

    if (!firstMessage.ok) {
      return;
    }

    const blockAck = await setPlayerBlocked(guest, {
      roomCode: createdRoom.data.roomCode,
      targetPlayerId: hostPlayerId,
      blocked: true
    });

    expect(blockAck.ok).toBe(true);

    if (!blockAck.ok) {
      return;
    }

    expect(blockAck.data.blockedPlayerIds).toContain(hostPlayerId);
    expect(blockAck.data.recentChat).toEqual([]);

    const reportAck = await reportPlayer(guest, {
      roomCode: createdRoom.data.roomCode,
      targetPlayerId: hostPlayerId,
      messageId: firstMessage.data.id,
      reason: "HARASSMENT",
      details: "Repeated unwanted comments."
    });

    expect(reportAck.ok).toBe(true);

    if (reportAck.ok) {
      expect(reportAck.data.id).toMatch(/^report-/);
      expect(reportAck.data.stored).toBe(false);
    }

    const unblockAck = await setPlayerBlocked(guest, {
      roomCode: createdRoom.data.roomCode,
      targetPlayerId: hostPlayerId,
      blocked: false
    });

    expect(unblockAck.ok).toBe(true);

    if (unblockAck.ok) {
      expect(unblockAck.data.blockedPlayerIds).not.toContain(hostPlayerId);
      expect(unblockAck.data.recentChat.map((message) => message.id)).toContain(
        firstMessage.data.id
      );
    }
  });

  it("only evaluates moves for the active player", async () => {
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
  });

  it("runs completed-match replay review only for a seated player", async () => {
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
      playerName: "Review Host",
      guestId: "guest-review-host"
    });

    expect(createdRoom.ok).toBe(true);

    if (!createdRoom.ok) {
      return;
    }

    const roomCode = createdRoom.data.roomCode;
    const joinedRooms = await Promise.all([
      joinRoom(second, { roomCode, playerName: "Review Two", guestId: "guest-review-two" }),
      joinRoom(third, { roomCode, playerName: "Review Three", guestId: "guest-review-three" }),
      joinRoom(fourth, { roomCode, playerName: "Review Four", guestId: "guest-review-four" })
    ]);

    expect(joinedRooms.every((ack) => ack.ok)).toBe(true);
    await Promise.all(players.map((socket) => setReady(socket, { roomCode, ready: true })));

    const otherStartedStates = players
      .slice(1)
      .map((socket) => waitForRoomStateMatching(socket, (state) => state.status === "in-progress"));
    const startedRoom = await startRoom(host, {
      roomCode,
      rules: {
        bombEndsTrick: false,
        deckType: "classic",
        playerCount: 4,
        cardsPerPlayer: 1
      }
    });

    expect(startedRoom.ok).toBe(true);

    if (!startedRoom.ok) {
      return;
    }

    const playerStates = [startedRoom.data, ...(await Promise.all(otherStartedStates))];
    const activeIndex = playerStates.findIndex(
      (state) => state.yourPlayerId === state.activePlayerId
    );
    const activeSocket = players[activeIndex];
    const activeState = playerStates[activeIndex];

    if (activeSocket === undefined || activeState === undefined) {
      throw new Error("Unable to resolve the opening player.");
    }

    const beforeCompletion = await reviewReplay(activeSocket, { roomCode, rollouts: 1 });
    expect(beforeCompletion.ok).toBe(false);

    const winningMove = generateLegalMoves(activeState.yourHand, {
      isFirstMove: true,
      currentTrick: null
    })[0];

    if (winningMove === undefined) {
      throw new Error("Expected an opening move.");
    }

    const completedRoom = await submitMove(activeSocket, { roomCode, move: winningMove });
    expect(completedRoom.ok).toBe(true);

    if (!completedRoom.ok) {
      return;
    }

    expect(completedRoom.data.status).toBe("complete");
    const review = await reviewReplay(activeSocket, {
      roomCode,
      rollouts: 1,
      maxDecisions: 2,
      maxMoves: 2
    });

    expect(review.ok).toBe(true);

    if (review.ok) {
      expect(review.data).toEqual([]);
    }
  });

  it("accepts structured feedback without requiring database persistence", async () => {
    const socket = await connectTestSocket();
    const feedback = await submitFeedback(socket, {
      kind: "UI",
      body: "The table view feels easier to read after the cleanup.",
      guestId: "guest-feedback",
      roomCode: "abc123",
      contactEmail: "PLAYER@EXAMPLE.COM"
    });

    expect(feedback.ok).toBe(true);

    if (!feedback.ok) {
      return;
    }

    expect(feedback.data.id).toMatch(/^feedback-/);
    expect(feedback.data.stored).toBe(false);
    expect(Date.parse(feedback.data.createdAt)).not.toBeNaN();
  });

  it("rejects feedback that is too short", async () => {
    const socket = await connectTestSocket();
    const feedback = await submitFeedback(socket, {
      kind: "BUG",
      body: "bad"
    });

    expect(feedback.ok).toBe(false);
  });

  it("rate limits repeated feedback submissions per socket", async () => {
    const socket = await connectTestSocket();
    const payload = {
      kind: "UI",
      body: "The table view feels easier to read after the cleanup.",
      guestId: "guest-feedback-rate"
    } satisfies FeedbackPayload;

    const first = await submitFeedback(socket, payload);
    const second = await submitFeedback(socket, {
      ...payload,
      body: "The buttons feel better, but the room list could be clearer."
    });
    const third = await submitFeedback(socket, {
      ...payload,
      body: "The hand controls are smoother after the latest pass."
    });
    const fourth = await submitFeedback(socket, {
      ...payload,
      body: "This fourth message should be blocked by the rate limiter."
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);
    expect(fourth.ok).toBe(false);

    if (!fourth.ok) {
      expect(fourth.error).toContain("wait");
    }
  });
});

async function connectTestSocket(authProfileId?: string): Promise<TestSocket> {
  const token =
    authProfileId === undefined
      ? undefined
      : createRealtimeAuthToken({ profileId: authProfileId }, TEST_REALTIME_AUTH_SECRET);
  const socket: TestSocket = createClient(serverUrl, {
    forceNew: true,
    transports: ["websocket"],
    ...(token === undefined ? {} : { auth: { token } })
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

function reconnectRoom(
  socket: TestSocket,
  payload: { readonly roomCode: string; readonly playerId: string; readonly guestId: string }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:reconnect", payload, (ack) => {
      resolve(ack);
    });
  });
}

function configureRoom(
  socket: TestSocket,
  payload: ConfigureRoomPayload
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:configure", payload, (ack) => resolve(ack));
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
    readonly rules?: PublicRoomState["rules"];
    readonly botPace?: PublicRoomState["botPace"];
    readonly trade?: {
      readonly enabled: boolean;
    };
  }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("room:start", payload, (ack) => {
      resolve(ack);
    });
  });
}

function requestTrade(
  socket: TestSocket,
  payload: {
    readonly roomCode: string;
    readonly toPlayerId: string;
    readonly offeredCard: Card;
    readonly requestedRank: Rank;
  }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("trade:request", payload, (ack) => {
      resolve(ack);
    });
  });
}

function respondToTrade(
  socket: TestSocket,
  payload: {
    readonly roomCode: string;
    readonly requestId: string;
    readonly accept: boolean;
    readonly requestedCard?: Card;
  }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("trade:respond", payload, (ack) => {
      resolve(ack);
    });
  });
}

function leaveStartedRoom(socket: TestSocket, roomCode: string): Promise<ServerAck<undefined>> {
  return new Promise((resolve) => {
    socket.emit("room:leave", { roomCode }, (ack) => {
      resolve(ack);
    });
  });
}

async function getActiveRoomCount(): Promise<number> {
  const response = await fetch(`${serverUrl}/lobby`);
  const lobby = (await response.json()) as PublicLobbyState;
  return lobby.activity.activeRooms;
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

function joinTournament(
  socket: TestSocket,
  playerName: string
): Promise<ServerAck<PublicTournamentQueueState>> {
  return new Promise((resolve) => {
    socket.emit("tournament:join", { playerName }, resolve);
  });
}

function leaveRanked(socket: TestSocket): Promise<ServerAck<PublicRankedQueueState>> {
  return new Promise((resolve) => {
    socket.emit("ranked:leave", (ack) => {
      resolve(ack);
    });
  });
}

function submitMove(
  socket: TestSocket,
  payload: { readonly roomCode: string; readonly move: Move }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("game:move", payload, (ack) => {
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

function waitForRoomStateMatching(
  socket: TestSocket,
  predicate: (state: PublicRoomState) => boolean
): Promise<PublicRoomState> {
  return new Promise((resolve) => {
    const handleRoomState = (state: PublicRoomState): void => {
      if (!predicate(state)) {
        return;
      }

      socket.off("room:state", handleRoomState);
      resolve(state);
    };

    socket.on("room:state", handleRoomState);
  });
}

function sendChat(socket: TestSocket, payload: ChatPayload): Promise<ServerAck<PublicChatMessage>> {
  return new Promise((resolve) => {
    socket.emit("chat:send", payload, (ack) => {
      resolve(ack);
    });
  });
}

function setPlayerBlocked(
  socket: TestSocket,
  payload: { readonly roomCode: string; readonly targetPlayerId: string; readonly blocked: boolean }
): Promise<ServerAck<PublicRoomState>> {
  return new Promise((resolve) => {
    socket.emit("moderation:block", payload, resolve);
  });
}

function reportPlayer(
  socket: TestSocket,
  payload: {
    readonly roomCode: string;
    readonly targetPlayerId: string;
    readonly messageId?: string;
    readonly reason: "HARASSMENT";
    readonly details?: string;
  }
): Promise<ServerAck<PublicModerationReceipt>> {
  return new Promise((resolve) => {
    socket.emit("moderation:report", payload, resolve);
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

function syncAccountProfile(
  socket: TestSocket,
  payload: { readonly displayName: string | null; readonly imageUrl: string | null }
): Promise<ServerAck<PublicGuestProfile>> {
  return new Promise((resolve) => {
    socket.emit("profile:sync-account", payload, resolve);
  });
}

function registerPushToken(
  socket: TestSocket,
  payload: {
    readonly expoPushToken: string;
    readonly platform: "ios" | "android";
  }
): Promise<ServerAck<{ readonly enabled: boolean; readonly platform: "ios" | "android" }>> {
  return new Promise((resolve) => {
    socket.emit("notifications:register", payload, resolve);
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

function purchaseCosmetic(
  socket: TestSocket,
  payload: { readonly guestId: string; readonly cosmeticId: string }
): Promise<ServerAck<PublicGuestProfile>> {
  return new Promise((resolve) => {
    socket.emit("cosmetics:purchase", payload, (ack) => {
      resolve(ack);
    });
  });
}

function labelReplay(
  socket: TestSocket,
  payload: { readonly guestId: string; readonly matchId: string; readonly label: string }
): Promise<ServerAck<readonly PublicMatchHistoryItem[]>> {
  return new Promise((resolve) => {
    socket.emit("profile:label-replay", payload, (ack) => {
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

function reviewReplay(
  socket: TestSocket,
  payload: {
    readonly roomCode: string;
    readonly rollouts?: number;
    readonly maxDecisions?: number;
    readonly maxMoves?: number;
  }
): Promise<ServerAck<readonly PublicReplayDecisionReview[]>> {
  return new Promise((resolve) => {
    socket.emit("coach:review", payload, (ack) => {
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

function submitFeedback(
  socket: TestSocket,
  payload: FeedbackPayload
): Promise<ServerAck<PublicFeedbackReceipt>> {
  return new Promise((resolve) => {
    socket.emit("feedback:submit", payload, (ack) => {
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
