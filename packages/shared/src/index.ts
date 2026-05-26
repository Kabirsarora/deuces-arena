import type { Card, CurrentTrick, GameEvent, Move } from "@deuces-arena/game-engine";

export type PlayerKind = "human" | "bot" | "guest";
export type RoomStatus = "waiting" | "in-progress" | "complete";

export type PublicPlayerStats = {
  readonly rating: number;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly averagePlacement: number | null;
};

export type PublicGuestProfile = PublicPlayerStats & {
  readonly guestId: string;
};

export type PublicLeaderboardEntry = PublicPlayerStats & {
  readonly guestId: string;
  readonly displayName: string | null;
};

export type PublicMatchHistoryPlayer = {
  readonly name: string;
  readonly kind: PlayerKind;
  readonly placement: number | null;
};

export type PublicMatchHistoryItem = {
  readonly matchId: string;
  readonly roomCode: string | null;
  readonly mode: "CASUAL" | "RANKED" | "LOCAL_DEMO";
  readonly completedAt: string | null;
  readonly placement: number | null;
  readonly ratingBefore: number | null;
  readonly ratingAfter: number | null;
  readonly ratingDelta: number | null;
  readonly cardsRemaining: number | null;
  readonly bombsPlayed: number;
  readonly movesPlayed: number | null;
  readonly opponents: readonly PublicMatchHistoryPlayer[];
};

export type PublicOpenRoom = {
  readonly roomCode: string;
  readonly hostName: string;
  readonly seatedPlayers: number;
  readonly readyPlayers: number;
  readonly maxPlayers: number;
  readonly botSeatsAvailable: number;
  readonly createdAt: string;
};

export type PublicLobbyActivity = {
  readonly openRooms: number;
  readonly activeRooms: number;
  readonly completedRooms: number;
  readonly connectedUsers: number;
  readonly seatedHumans: number;
  readonly seatedBots: number;
  readonly playersInOpenRooms: number;
  readonly playersInActiveGames: number;
};

export type PublicLobbyState = {
  readonly activity: PublicLobbyActivity;
  readonly openRooms: readonly PublicOpenRoom[];
};

export type PublicRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly connected: boolean;
  readonly ready: boolean;
  readonly cardsRemaining: number;
  readonly stats: PublicPlayerStats | null;
};

export type PublicChatMessage = {
  readonly id: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly body: string;
  readonly createdAt: string;
};

export type PublicRoomState = {
  readonly roomCode: string;
  readonly status: RoomStatus;
  readonly players: readonly PublicRoomPlayer[];
  readonly activePlayerId: string | null;
  readonly currentTrick: CurrentTrick | null;
  readonly turnNumber: number;
  readonly placements: readonly string[];
  readonly recentEvents: readonly GameEvent[];
  readonly recentChat: readonly PublicChatMessage[];
  readonly yourPlayerId: string | null;
  readonly yourHand: readonly Card[];
};

export type RoomReplayExport = {
  readonly roomCode: string;
  readonly status: RoomStatus;
  readonly players: readonly PublicRoomPlayer[];
  readonly placements: readonly string[];
  readonly turnNumber: number;
  readonly events: readonly GameEvent[];
};

export type CreateRoomPayload = {
  readonly playerName: string;
  readonly guestId?: string;
};

export type JoinRoomPayload = {
  readonly roomCode: string;
  readonly playerName: string;
  readonly guestId?: string;
};

export type ReconnectRoomPayload = {
  readonly roomCode: string;
  readonly playerId: string;
};

export type MovePayload = {
  readonly roomCode: string;
  readonly move: Move;
};

export type ChatPayload = {
  readonly roomCode: string;
  readonly body: string;
};

export type ServerAck<T = undefined> =
  | {
      readonly ok: true;
      readonly data: T;
    }
  | {
      readonly ok: false;
      readonly error: string;
    };

export type ClientToServerEvents = {
  "room:create": (
    payload: CreateRoomPayload,
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "room:join": (
    payload: JoinRoomPayload,
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "room:reconnect": (
    payload: ReconnectRoomPayload,
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "room:start": (
    payload: { readonly roomCode: string },
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "room:ready": (
    payload: { readonly roomCode: string; readonly ready: boolean },
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "room:leave": (
    payload: { readonly roomCode: string },
    callback: (ack: ServerAck) => void
  ) => void;
  "room:replay": (
    payload: { readonly roomCode: string },
    callback: (ack: ServerAck<RoomReplayExport>) => void
  ) => void;
  "profile:get": (
    payload: { readonly guestId: string },
    callback: (ack: ServerAck<PublicGuestProfile>) => void
  ) => void;
  "leaderboard:list": (
    payload: { readonly limit?: number },
    callback: (ack: ServerAck<readonly PublicLeaderboardEntry[]>) => void
  ) => void;
  "profile:history": (
    payload: { readonly guestId: string; readonly limit?: number },
    callback: (ack: ServerAck<readonly PublicMatchHistoryItem[]>) => void
  ) => void;
  "lobby:get": (callback: (ack: ServerAck<PublicLobbyState>) => void) => void;
  "game:move": (payload: MovePayload, callback: (ack: ServerAck<PublicRoomState>) => void) => void;
  "chat:send": (
    payload: ChatPayload,
    callback: (ack: ServerAck<PublicChatMessage>) => void
  ) => void;
};

export type ServerToClientEvents = {
  "room:state": (state: PublicRoomState) => void;
  "lobby:state": (state: PublicLobbyState) => void;
  "chat:message": (message: PublicChatMessage) => void;
  "game:error": (payload: { readonly message: string }) => void;
};

export type InterServerEvents = Record<string, never>;
export type SocketData = {
  playerId?: string;
  roomCode?: string;
};
