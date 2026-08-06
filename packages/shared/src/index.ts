import type { Card, CurrentTrick, DeckType, GameEvent, Move } from "@deuces-arena/game-engine";

export {
  createRealtimeAuthToken,
  verifyRealtimeAuthToken,
  type RealtimeAuthIdentity
} from "./realtime-auth.js";

export type PlayerKind = "human" | "bot" | "guest";
export type RoomStatus = "waiting" | "in-progress" | "complete";
export type MatchMode = "CASUAL" | "RANKED" | "LOCAL_DEMO";
export type PublicBotDifficulty = "easy" | "normal" | "hard";
export type PublicBotPace = "quick" | "normal" | "relaxed";
export type CosmeticKind =
  | "CARD_BACK"
  | "TABLE_THEME"
  | "AVATAR"
  | "PROFILE_BORDER"
  | "EMOTE"
  | "WIN_ANIMATION";
export type CosmeticUnlockSource = "EARNED" | "SUPPORTER" | "PROMOTIONAL" | "ADMIN_GRANT";

export type PublicPlayerStats = {
  readonly rating: number;
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly averagePlacement: number | null;
  readonly arenaCoins: number;
};

export type ProfileAvatarKey = "diamond" | "club" | "heart" | "spade";

export type PublicGuestProfile = PublicPlayerStats & {
  readonly guestId: string;
  readonly displayName: string | null;
  readonly avatarKey: ProfileAvatarKey;
  readonly isAdmin: boolean;
  readonly unlocks: readonly PublicCosmeticUnlock[];
  readonly equippedCosmetics: readonly PublicEquippedCosmetic[];
};

export type PublicLeaderboardEntry = PublicPlayerStats & {
  readonly guestId: string;
  readonly displayName: string | null;
};

export type PublicCosmetic = {
  readonly id: string;
  readonly slug: string;
  readonly kind: CosmeticKind;
  readonly name: string;
  readonly description: string | null;
  readonly rarity: string;
  readonly isSupporter: boolean;
  readonly coinPrice: number | null;
  readonly previewUrl: string | null;
};

export type PublicCosmeticUnlock = {
  readonly cosmetic: PublicCosmetic;
  readonly source: CosmeticUnlockSource;
  readonly earnedAt: string;
};

export type PublicEquippedCosmetic = {
  readonly kind: CosmeticKind;
  readonly cosmetic: PublicCosmetic;
  readonly equippedAt: string;
};

export type PublicMatchHistoryPlayer = {
  readonly name: string;
  readonly kind: PlayerKind;
  readonly placement: number | null;
};

export type PublicMatchHistoryItem = {
  readonly matchId: string;
  readonly roomCode: string | null;
  readonly mode: MatchMode;
  readonly completedAt: string | null;
  readonly placement: number | null;
  readonly ratingBefore: number | null;
  readonly ratingAfter: number | null;
  readonly ratingDelta: number | null;
  readonly cardsRemaining: number | null;
  readonly bombsPlayed: number;
  readonly movesPlayed: number | null;
  readonly labels: readonly string[];
  readonly opponents: readonly PublicMatchHistoryPlayer[];
};

export type PublicOpenRoom = {
  readonly roomCode: string;
  readonly hostName: string;
  readonly rules: PublicRoomRules;
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

export type PublicRankedQueueState = {
  readonly queuedPlayers: number;
  readonly requiredPlayers: number;
  readonly etaSeconds: number | null;
  readonly joined: boolean;
  readonly queuePosition: number | null;
};

export type PublicRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly connected: boolean;
  readonly ready: boolean;
  readonly cardsRemaining: number;
  readonly stats: PublicPlayerStats | null;
  readonly equippedCosmetics: readonly PublicEquippedCosmetic[];
};

export type PublicChatMessage = {
  readonly id: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly body: string;
  readonly createdAt: string;
};

export type PublicMoveEvaluation = {
  readonly move: Move;
  readonly rollouts: number;
  readonly wins: number;
  readonly winRate: number;
  readonly averagePlacement: number;
};

export type PublicCoachEvaluationRecord = {
  readonly id: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly turnNumber: number;
  readonly createdAt: string;
  readonly handBefore: readonly Card[];
  readonly currentTrickBefore: CurrentTrick | null;
  readonly evaluations: readonly PublicMoveEvaluation[];
};

export type FeedbackKind = "BUG" | "IDEA" | "BALANCE" | "UI";

export type PublicFeedbackReceipt = {
  readonly id: string;
  readonly stored: boolean;
  readonly createdAt: string;
};

export type PublicRoomState = {
  readonly roomCode: string;
  readonly mode: MatchMode;
  readonly status: RoomStatus;
  readonly rules: PublicRoomRules;
  readonly botDifficulty: PublicBotDifficulty;
  readonly botPace: PublicBotPace;
  readonly players: readonly PublicRoomPlayer[];
  readonly activePlayerId: string | null;
  readonly currentTrick: CurrentTrick | null;
  readonly turnNumber: number;
  readonly placements: readonly string[];
  readonly recentEvents: readonly GameEvent[];
  readonly recentChat: readonly PublicChatMessage[];
  readonly turnTimer: PublicTurnTimerState | null;
  readonly yourPlayerId: string | null;
  readonly yourHand: readonly Card[];
};

export type PublicTurnTimerState = {
  readonly enabled: boolean;
  readonly secondsPerTurn: number;
  readonly deadlineAt: string | null;
};

export type PublicRoomRules = {
  readonly bombEndsTrick: boolean;
  readonly deckType: DeckType;
  readonly playerCount: number;
  readonly cardsPerPlayer: number;
};

export type RoomReplayExport = {
  readonly roomCode: string;
  readonly mode: MatchMode;
  readonly status: RoomStatus;
  readonly players: readonly PublicRoomPlayer[];
  readonly placements: readonly string[];
  readonly turnNumber: number;
  readonly events: readonly GameEvent[];
  readonly coachEvaluations: readonly PublicCoachEvaluationRecord[];
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
  readonly guestId?: string;
};

export type MovePayload = {
  readonly roomCode: string;
  readonly move: Move;
};

export type ChatPayload = {
  readonly roomCode: string;
  readonly body: string;
};

export type FeedbackPayload = {
  readonly kind: FeedbackKind;
  readonly body: string;
  readonly guestId?: string;
  readonly roomCode?: string;
  readonly contactEmail?: string;
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
    payload: {
      readonly roomCode: string;
      readonly botCount?: number;
      readonly timer?: {
        readonly enabled: boolean;
        readonly secondsPerTurn: number;
      };
      readonly rules?: PublicRoomRules;
      readonly botDifficulty?: PublicBotDifficulty;
      readonly botPace?: PublicBotPace;
    },
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
  "profile:update": (
    payload: {
      readonly guestId: string;
      readonly displayName: string;
      readonly avatarKey: ProfileAvatarKey;
    },
    callback: (ack: ServerAck<PublicGuestProfile>) => void
  ) => void;
  "leaderboard:list": (
    payload: { readonly limit?: number },
    callback: (ack: ServerAck<readonly PublicLeaderboardEntry[]>) => void
  ) => void;
  "cosmetics:list": (callback: (ack: ServerAck<readonly PublicCosmetic[]>) => void) => void;
  "cosmetics:equip": (
    payload: { readonly guestId: string; readonly cosmeticId: string },
    callback: (ack: ServerAck<PublicGuestProfile>) => void
  ) => void;
  "cosmetics:purchase": (
    payload: { readonly guestId: string; readonly cosmeticId: string },
    callback: (ack: ServerAck<PublicGuestProfile>) => void
  ) => void;
  "profile:history": (
    payload: { readonly guestId: string; readonly limit?: number },
    callback: (ack: ServerAck<readonly PublicMatchHistoryItem[]>) => void
  ) => void;
  "profile:label-replay": (
    payload: { readonly guestId: string; readonly matchId: string; readonly label: string },
    callback: (ack: ServerAck<readonly PublicMatchHistoryItem[]>) => void
  ) => void;
  "lobby:get": (callback: (ack: ServerAck<PublicLobbyState>) => void) => void;
  "ranked:get": (callback: (ack: ServerAck<PublicRankedQueueState>) => void) => void;
  "ranked:join": (
    payload: { readonly playerName: string; readonly guestId?: string },
    callback: (ack: ServerAck<PublicRankedQueueState>) => void
  ) => void;
  "ranked:leave": (callback: (ack: ServerAck<PublicRankedQueueState>) => void) => void;
  "game:move": (payload: MovePayload, callback: (ack: ServerAck<PublicRoomState>) => void) => void;
  "chat:send": (
    payload: ChatPayload,
    callback: (ack: ServerAck<PublicChatMessage>) => void
  ) => void;
  "coach:evaluate": (
    payload: { readonly roomCode: string; readonly rollouts?: number; readonly maxMoves?: number },
    callback: (ack: ServerAck<readonly PublicMoveEvaluation[]>) => void
  ) => void;
  "feedback:submit": (
    payload: FeedbackPayload,
    callback: (ack: ServerAck<PublicFeedbackReceipt>) => void
  ) => void;
};

export type ServerToClientEvents = {
  "room:state": (state: PublicRoomState) => void;
  "lobby:state": (state: PublicLobbyState) => void;
  "ranked:state": (state: PublicRankedQueueState) => void;
  "chat:message": (message: PublicChatMessage) => void;
  "game:error": (payload: { readonly message: string }) => void;
};

export type InterServerEvents = Record<string, never>;
export type SocketData = {
  authProfileId?: string;
  playerId?: string;
  roomCode?: string;
};
