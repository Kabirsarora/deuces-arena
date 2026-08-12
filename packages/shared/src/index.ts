import type {
  Card,
  CurrentTrick,
  DeckType,
  GameEvent,
  Move,
  Rank,
  ReplayDecisionReview,
  RolloutPolicy
} from "@deuces-arena/game-engine";

export {
  createRealtimeAuthToken,
  createMobileAuthHandoffToken,
  verifyMobileAuthHandoffToken,
  verifyRealtimeAuthToken,
  type RealtimeAuthIdentity
} from "./realtime-auth.js";

export { createRoomInviteUrl, isValidRoomCode, normalizeRoomCode } from "./room-links.js";

export type PlayerKind = "human" | "bot" | "guest";
export type RoomStatus = "waiting" | "in-progress" | "complete";
export type MatchMode = "CASUAL" | "RANKED" | "TOURNAMENT" | "LOCAL_DEMO";
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
  readonly imageUrl?: string | null;
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

export type TournamentStage = "semifinal-a" | "semifinal-b" | "final";
export type TournamentStatus = "semifinals" | "final" | "complete";

export type PublicTournamentMatch = {
  readonly stage: TournamentStage;
  readonly roomCode: string | null;
  readonly status: "waiting" | "in-progress" | "complete";
  readonly playerNames: readonly string[];
  readonly advancingPlayerNames: readonly string[];
};

export type PublicTournament = {
  readonly id: string;
  readonly status: TournamentStatus;
  readonly matches: readonly PublicTournamentMatch[];
  readonly championName: string | null;
};

export type PublicTournamentQueueState = {
  readonly queuedPlayers: number;
  readonly requiredPlayers: number;
  readonly etaSeconds: number | null;
  readonly joined: boolean;
  readonly queuePosition: number | null;
  readonly tournament: PublicTournament | null;
};

export type PublicTournamentHistoryItem = {
  readonly tournamentId: string;
  readonly status: TournamentStatus | "abandoned";
  readonly seed: number;
  readonly semifinalStage: Extract<TournamentStage, "semifinal-a" | "semifinal-b">;
  readonly semifinalPlacement: number | null;
  readonly advancedToFinal: boolean;
  readonly finalPlacement: number | null;
  readonly championName: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
};

export type PublicRoomPlayer = {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly connected: boolean;
  readonly ready: boolean;
  readonly cardsRemaining: number;
  readonly stats: PublicPlayerStats | null;
  readonly imageUrl?: string | null;
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
  readonly winRateLow: number;
  readonly winRateHigh: number;
  readonly averagePlacement: number;
  readonly completedRollouts: number;
  readonly completionRate: number;
  readonly rolloutPolicy: RolloutPolicy;
};

export type PublicReplayDecisionReview = ReplayDecisionReview;

export type PublicGameEvent = Omit<GameEvent, "handBefore">;

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

export type PublicCardTradeRequest = {
  readonly id: string;
  readonly fromPlayerId: string;
  readonly toPlayerId: string;
  readonly offeredCard: Card;
  readonly requestedRank: Rank;
  readonly createdAt: string;
};

export type PublicCompletedCardTrade = {
  readonly id: string;
  readonly fromPlayerId: string;
  readonly toPlayerId: string;
  readonly offeredCard: Card;
  readonly receivedCard: Card;
  readonly completedAt: string;
};

export type PublicTradePhaseState = {
  readonly status: "disabled" | "open" | "closed";
  readonly deadlineAt: string | null;
  readonly requests: readonly PublicCardTradeRequest[];
  readonly yourRequestUsed: boolean;
  readonly yourTradeCompleted: boolean;
  readonly completedTradeCount: number;
};

export type FeedbackKind = "BUG" | "IDEA" | "BALANCE" | "UI";

export type PlayerReportReason =
  | "HARASSMENT"
  | "HATE_SPEECH"
  | "SPAM"
  | "CHEATING"
  | "INAPPROPRIATE_NAME"
  | "OTHER";

export type PublicModerationReceipt = {
  readonly id: string;
  readonly stored: boolean;
  readonly createdAt: string;
};

export type PublicFeedbackReceipt = {
  readonly id: string;
  readonly stored: boolean;
  readonly createdAt: string;
};

export type PlayerReportStatus = "OPEN" | "REVIEWED" | "ACTIONED" | "DISMISSED";

export type AdminFeedbackReport = {
  readonly id: string;
  readonly kind: FeedbackKind;
  readonly body: string;
  readonly guestId: string | null;
  readonly roomCode: string | null;
  readonly contactEmail: string | null;
  readonly createdAt: string;
};

export type AdminPlayerReport = {
  readonly id: string;
  readonly reporterGuestId: string | null;
  readonly reportedGuestId: string | null;
  readonly roomCode: string | null;
  readonly messageId: string | null;
  readonly messageBody: string | null;
  readonly reason: PlayerReportReason;
  readonly details: string | null;
  readonly status: PlayerReportStatus;
  readonly createdAt: string;
};

export type AdminModerationQueue = {
  readonly feedback: readonly AdminFeedbackReport[];
  readonly playerReports: readonly AdminPlayerReport[];
};

export type PublicRoomState = {
  readonly roomCode: string;
  readonly mode: MatchMode;
  readonly status: RoomStatus;
  readonly tournament: { readonly id: string; readonly stage: TournamentStage } | null;
  readonly rules: PublicRoomRules;
  readonly botDifficulty: PublicBotDifficulty;
  readonly botPace: PublicBotPace;
  readonly players: readonly PublicRoomPlayer[];
  readonly activePlayerId: string | null;
  readonly currentTrick: CurrentTrick | null;
  readonly turnNumber: number;
  readonly placements: readonly string[];
  readonly recentEvents: readonly PublicGameEvent[];
  readonly recentChat: readonly PublicChatMessage[];
  readonly blockedPlayerIds: readonly string[];
  readonly tradePhase: PublicTradePhaseState;
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
  readonly tradeHistory: readonly PublicCompletedCardTrade[];
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

export type PushPlatform = "ios" | "android";

export type PublicPushRegistration = {
  readonly enabled: boolean;
  readonly platform: PushPlatform;
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
      readonly trade?: {
        readonly enabled: boolean;
      };
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
  "profile:sync-account": (
    payload: {
      readonly displayName: string | null;
      readonly imageUrl: string | null;
    },
    callback: (ack: ServerAck<PublicGuestProfile>) => void
  ) => void;
  "notifications:register": (
    payload: {
      readonly expoPushToken: string;
      readonly platform: PushPlatform;
    },
    callback: (ack: ServerAck<PublicPushRegistration>) => void
  ) => void;
  "notifications:unregister": (
    payload: { readonly expoPushToken: string },
    callback: (ack: ServerAck<{ readonly enabled: false }>) => void
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
  "tournament:get": (callback: (ack: ServerAck<PublicTournamentQueueState>) => void) => void;
  "tournament:join": (
    payload: { readonly playerName: string },
    callback: (ack: ServerAck<PublicTournamentQueueState>) => void
  ) => void;
  "tournament:leave": (callback: (ack: ServerAck<PublicTournamentQueueState>) => void) => void;
  "game:move": (payload: MovePayload, callback: (ack: ServerAck<PublicRoomState>) => void) => void;
  "trade:request": (
    payload: {
      readonly roomCode: string;
      readonly toPlayerId: string;
      readonly offeredCard: Card;
      readonly requestedRank: Rank;
    },
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "trade:respond": (
    payload: {
      readonly roomCode: string;
      readonly requestId: string;
      readonly accept: boolean;
      readonly requestedCard?: Card;
    },
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "chat:send": (
    payload: ChatPayload,
    callback: (ack: ServerAck<PublicChatMessage>) => void
  ) => void;
  "moderation:block": (
    payload: {
      readonly roomCode: string;
      readonly targetPlayerId: string;
      readonly blocked: boolean;
    },
    callback: (ack: ServerAck<PublicRoomState>) => void
  ) => void;
  "moderation:report": (
    payload: {
      readonly roomCode: string;
      readonly targetPlayerId: string;
      readonly messageId?: string;
      readonly reason: PlayerReportReason;
      readonly details?: string;
    },
    callback: (ack: ServerAck<PublicModerationReceipt>) => void
  ) => void;
  "coach:evaluate": (
    payload: { readonly roomCode: string; readonly rollouts?: number; readonly maxMoves?: number },
    callback: (ack: ServerAck<readonly PublicMoveEvaluation[]>) => void
  ) => void;
  "coach:review": (
    payload: {
      readonly roomCode: string;
      readonly rollouts?: number;
      readonly maxDecisions?: number;
      readonly maxMoves?: number;
    },
    callback: (ack: ServerAck<readonly PublicReplayDecisionReview[]>) => void
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
  "tournament:state": (state: PublicTournamentQueueState) => void;
  "chat:message": (message: PublicChatMessage) => void;
  "game:error": (payload: { readonly message: string }) => void;
};

export type InterServerEvents = Record<string, never>;
export type SocketData = {
  authProfileId?: string;
  playerId?: string;
  roomCode?: string;
};
