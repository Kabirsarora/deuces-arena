import type { Card, CurrentTrick, GameEvent, Move } from "@deuces-arena/game-engine";

export type PlayerKind = "human" | "bot" | "guest";
export type RoomStatus = "waiting" | "in-progress" | "complete";

export type PublicPlayerStats = {
  readonly rating: number;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly averagePlacement: number | null;
};

export type PublicRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly connected: boolean;
  readonly cardsRemaining: number;
  readonly stats: PublicPlayerStats | null;
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
  "room:replay": (
    payload: { readonly roomCode: string },
    callback: (ack: ServerAck<RoomReplayExport>) => void
  ) => void;
  "game:move": (payload: MovePayload, callback: (ack: ServerAck<PublicRoomState>) => void) => void;
};

export type ServerToClientEvents = {
  "room:state": (state: PublicRoomState) => void;
  "game:error": (payload: { readonly message: string }) => void;
};

export type InterServerEvents = Record<string, never>;
export type SocketData = {
  playerId?: string;
  roomCode?: string;
};
