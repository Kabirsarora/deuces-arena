"use client";

import {
  RANKS,
  compareCards,
  detectHand,
  generateLegalMoves,
  getCardId,
  getRankProgress,
  getRankedCoinBonus,
  getRankStrength,
  getSuitStrength,
  type Card,
  type DeckType,
  type HandType,
  type Move,
  type Rank
} from "@deuces-arena/game-engine";
import { createRoomInviteUrl } from "@deuces-arena/shared";
import type {
  ClientToServerEvents,
  CosmeticKind,
  FeedbackKind,
  PlayerReportReason,
  PublicBotDifficulty,
  PublicBotPace,
  PublicChatMessage,
  PublicCosmetic,
  PublicFeedbackReceipt,
  PublicGameEvent,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicModerationReceipt,
  PublicOpenRoom,
  PublicRankedQueueState,
  PublicReplayDecisionReview,
  PublicRoomPlayer,
  PublicRoomState,
  PublicTournamentQueueState,
  ProfileAvatarKey,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type MotionStyle,
  type PanInfo
} from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  CircleHelp,
  Copy,
  Crown,
  DoorOpen,
  Gauge,
  Handshake,
  History,
  ListOrdered,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode
} from "react";
import { io, type Socket } from "socket.io-client";

import { SignInWithGoogleButton, SignOutButton } from "@/components/auth-buttons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OnlineHubMode = "bots" | "casual" | "ranked" | "tournament" | "cosmetics";
type HubOverlay = "learn" | "profile" | "more" | null;
type FirstVisitStage = "welcome" | "guide" | null;
type ActiveTablePanel = "chat" | "rules";
type HandSortMode = "rank" | "suit" | "sets" | "manual";
type RealtimeConnectionStatus = "waking" | "online" | "offline";
type CosmeticFilterKind = "ALL" | CosmeticKind;
type AuthUser = {
  readonly profileId: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly image: string | null;
};
type ReportPlayerInput = {
  readonly targetPlayerId: string;
  readonly reason: PlayerReportReason;
  readonly details?: string;
  readonly messageId?: string;
};

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const ROOM_SESSION_KEY = "deuces-arena-room-session";
const GUEST_ID_KEY = "deuces-arena-guest-id";
const HAND_SORT_STORAGE_KEY = "deuces-arena-hand-sort";
const BEGINNER_WELCOME_SESSION_KEY = "deuces-arena-beginner-welcome-v1";
const MAX_CASUAL_PLAYERS_PER_ROOM = 6;
const DEFAULT_CARDS_PER_PLAYER = 13;
const DEFAULT_RANKED_TIMER_SECONDS = 45;
const AVATAR_OPTIONS: readonly { readonly key: ProfileAvatarKey; readonly label: string }[] = [
  { key: "diamond", label: "Diamonds" },
  { key: "club", label: "Clubs" },
  { key: "heart", label: "Hearts" },
  { key: "spade", label: "Spades" }
];
const HAND_SORT_OPTIONS: readonly { readonly mode: HandSortMode; readonly label: string }[] = [
  { mode: "rank", label: "Rank" },
  { mode: "suit", label: "Suit" },
  { mode: "sets", label: "Sets" },
  { mode: "manual", label: "Manual" }
];
const BOT_DIFFICULTY_OPTIONS: readonly {
  readonly value: PublicBotDifficulty;
  readonly label: string;
}[] = [
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" }
];
const BOT_PACE_OPTIONS: readonly {
  readonly value: PublicBotPace;
  readonly label: string;
}[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "normal", label: "Normal" },
  { value: "quick", label: "Quick" }
];
const DEUCES_RULES: readonly string[] = [
  "A match is made of tricks. A new trick begins whenever the center of the table is empty.",
  "The player holding 3 of diamonds leads the first trick, and the opening play must include that card.",
  "The leader may play any supported combination. That choice sets the hand type for the trick.",
  "After the lead, play a higher hand of the same type or pass. Straight responses must use exactly the same number of cards.",
  "A bomb is the exception: it may interrupt any normal hand.",
  "When nobody beats the last play, that player wins the trick, clears the center, and chooses the next hand type.",
  "The first player to empty their hand wins the match."
];
type RuleExampleCard = {
  readonly rank: string;
  readonly suit: "♦" | "♣" | "♥" | "♠";
};
type RuleHandExample = {
  readonly type: HandType;
  readonly label: string;
  readonly cards: readonly RuleExampleCard[];
  readonly formation: string;
  readonly response: string;
};
const RULE_HAND_EXAMPLES: readonly RuleHandExample[] = [
  {
    type: "single",
    label: "Single",
    cards: [{ rank: "7", suit: "♣" }],
    formation: "Any one card.",
    response: "Beat it with one higher card."
  },
  {
    type: "pair",
    label: "Pair (double)",
    cards: [
      { rank: "9", suit: "♦" },
      { rank: "9", suit: "♠" }
    ],
    formation: "Two cards of the same rank.",
    response: "Beat it with a higher pair."
  },
  {
    type: "trips",
    label: "Trips",
    cards: [
      { rank: "J", suit: "♦" },
      { rank: "J", suit: "♣" },
      { rank: "J", suit: "♥" }
    ],
    formation: "Three cards of the same rank.",
    response: "Beat it with higher trips."
  },
  {
    type: "quad",
    label: "Quad",
    cards: [
      { rank: "5", suit: "♦" },
      { rank: "5", suit: "♣" },
      { rank: "5", suit: "♥" },
      { rank: "5", suit: "♠" }
    ],
    formation: "All four suits of one rank.",
    response: "Beat it with a higher quad."
  },
  {
    type: "full-house",
    label: "Full house",
    cards: [
      { rank: "8", suit: "♦" },
      { rank: "8", suit: "♣" },
      { rank: "8", suit: "♥" },
      { rank: "K", suit: "♦" },
      { rank: "K", suit: "♠" }
    ],
    formation: "Trips plus a pair.",
    response: "Beat it with a higher set of trips."
  },
  {
    type: "straight",
    label: "Straight",
    cards: [
      { rank: "3", suit: "♦" },
      { rank: "4", suit: "♣" },
      { rank: "5", suit: "♥" },
      { rank: "6", suit: "♠" },
      { rank: "7", suit: "♦" }
    ],
    formation: "Five or more consecutive ranks. A 2 cannot be used.",
    response: "Beat it with a higher straight of the exact same length."
  },
  {
    type: "bomb",
    label: "Bomb",
    cards: [
      { rank: "Q", suit: "♦" },
      { rank: "Q", suit: "♣" },
      { rank: "Q", suit: "♥" },
      { rank: "Q", suit: "♠" },
      { rank: "4", suit: "♦" }
    ],
    formation: "Four of a kind plus one extra card.",
    response: "Beats any normal hand; only a higher four-of-a-kind rank beats it."
  }
];
const MANUAL_CARD_DRAG_STEP_PX = 58;
const FEEDBACK_KIND_OPTIONS: readonly { readonly value: FeedbackKind; readonly label: string }[] = [
  { value: "BUG", label: "Bug" },
  { value: "IDEA", label: "Idea" },
  { value: "UI", label: "UI" },
  { value: "BALANCE", label: "Balance" }
];
const REPORT_REASON_OPTIONS: readonly {
  readonly value: PlayerReportReason;
  readonly label: string;
}[] = [
  { value: "HARASSMENT", label: "Harassment" },
  { value: "HATE_SPEECH", label: "Hate speech" },
  { value: "SPAM", label: "Spam" },
  { value: "CHEATING", label: "Cheating" },
  { value: "INAPPROPRIATE_NAME", label: "Inappropriate name" },
  { value: "OTHER", label: "Other" }
];
const CLASSIC_CLOCKWISE_SEAT_LAYOUT: readonly string[] = [
  "bottom-5 left-1/2 -translate-x-1/2",
  "left-4 top-1/2 -translate-y-1/2 sm:left-6",
  "left-1/2 top-14 -translate-x-1/2",
  "right-4 top-1/2 -translate-y-1/2 sm:right-6"
];

export function OnlineRoomPanel({
  authUser,
  realtimeAuthToken
}: {
  readonly authUser: AuthUser | null;
  readonly realtimeAuthToken: string | null;
}) {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const lastCompletionRefreshRef = useRef<string | null>(null);
  const lastObservedChatKeyRef = useRef<string | null>(null);
  const mutedPlayerIdsRef = useRef<Set<string>>(new Set());
  const shouldReduceMotion = useReducedMotion();
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>("waking");
  const [playerName, setPlayerName] = useState("Player");
  const [profileDisplayName, setProfileDisplayName] = useState("Player");
  const [profileAvatarKey, setProfileAvatarKey] = useState<ProfileAvatarKey>("diamond");
  const [hubMode, setHubMode] = useState<OnlineHubMode>("bots");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [profile, setProfile] = useState<PublicGuestProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<readonly PublicLeaderboardEntry[]>([]);
  const [lobby, setLobby] = useState<PublicLobbyState | null>(null);
  const [rankedQueue, setRankedQueue] = useState<PublicRankedQueueState | null>(null);
  const [tournamentQueue, setTournamentQueue] = useState<PublicTournamentQueueState | null>(null);
  const [matchHistory, setMatchHistory] = useState<readonly PublicMatchHistoryItem[]>([]);
  const [cosmetics, setCosmetics] = useState<readonly PublicCosmetic[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<readonly string[]>([]);
  const [activeTablePanel, setActiveTablePanel] = useState<ActiveTablePanel | null>(null);
  const [handSortMode, setHandSortMode] = useState<HandSortMode>(() => loadHandSortMode());
  const [manualCardOrderIds, setManualCardOrderIds] = useState<readonly string[]>([]);
  const [botSeats, setBotSeats] = useState(3);
  const [botDifficulty, setBotDifficulty] = useState<PublicBotDifficulty>("normal");
  const [botPace, setBotPace] = useState<PublicBotPace>("relaxed");
  const [deckType, setDeckType] = useState<DeckType>("classic");
  const [playerCount, setPlayerCount] = useState(4);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(DEFAULT_CARDS_PER_PLAYER);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(45);
  const [lobbyTimerEnabled, setLobbyTimerEnabled] = useState(false);
  const [bombEndsTrick, setBombEndsTrick] = useState(false);
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [tradeTargetPlayerId, setTradeTargetPlayerId] = useState("");
  const [tradeRequestedRank, setTradeRequestedRank] = useState<Rank>("8");
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [dealAnimationKey, setDealAnimationKey] = useState<string | null>(null);
  const [handDealtVisible, setHandDealtVisible] = useState(true);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [mutedPlayerIds, setMutedPlayerIds] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState("Create a room, invite a friend, or start with bots.");
  const connected = connectionStatus === "online";

  const selectedCards = useMemo(
    () => room?.yourHand.filter((card) => selectedCardIds.includes(getCardId(card))) ?? [],
    [room?.yourHand, selectedCardIds]
  );
  const displayedHand = useMemo(
    () => sortHandForDisplay(room?.yourHand ?? [], handSortMode, manualCardOrderIds),
    [handSortMode, manualCardOrderIds, room?.yourHand]
  );
  const dealAnimationTriggerKey =
    !shouldReduceMotion &&
    room?.status === "in-progress" &&
    room.turnNumber === 0 &&
    room.yourHand.length > 0
      ? `${room.roomCode}-deal`
      : null;
  const legalMoves = useMemo(
    () =>
      room === null
        ? []
        : generateLegalMoves(room.yourHand, {
            isFirstMove: room.turnNumber === 0,
            currentTrick: room.currentTrick
          }),
    [room]
  );
  const playableCardIds = useMemo(
    () =>
      new Set(
        legalMoves.flatMap((move) =>
          move.type === "play" ? move.cards.map((card) => getCardId(card)) : []
        )
      ),
    [legalMoves]
  );
  const canPass = legalMoves.some((move) => move.type === "pass");
  const playableCardCount = playableCardIds.size;
  const selectedManualCardId =
    selectedCardIds.length === 1 && selectedCardIds[0] !== undefined ? selectedCardIds[0] : null;
  const selectedManualCardIndex =
    selectedManualCardId === null
      ? -1
      : displayedHand.findIndex((card) => getCardId(card) === selectedManualCardId);
  const canMoveManualCardLeft = handSortMode === "manual" && selectedManualCardIndex > 0;
  const canMoveManualCardRight =
    handSortMode === "manual" &&
    selectedManualCardIndex >= 0 &&
    selectedManualCardIndex < displayedHand.length - 1;
  const canMoveManualCardToEdge = handSortMode === "manual" && selectedManualCardIndex >= 0;
  const canPlaySelected =
    selectedCards.length > 0 &&
    legalMoves.some(
      (move) =>
        move.type === "play" &&
        move.cards.length === selectedCards.length &&
        move.cards.every((card) => selectedCardIds.includes(getCardId(card)))
    );
  const isYourTurn =
    room !== null && room.yourPlayerId !== null && room.activePlayerId === room.yourPlayerId;
  const yourPlayer = room?.players.find((candidate) => candidate.id === room.yourPlayerId) ?? null;
  const yourCardTheme = yourPlayer === null ? null : getEquippedCosmetic(yourPlayer, "CARD_BACK");
  const connectedHumans =
    room?.players.filter((player) => player.kind === "human" && player.connected) ?? [];
  const availableBotSeats =
    room === null
      ? Math.max(0, playerCount - 1)
      : Math.max(0, Math.max(playerCount, room.players.length) - room.players.length);
  const selectedBotSeats = Math.min(botSeats, availableBotSeats);
  const selectedPlayerCount = Math.max(playerCount, room?.players.length ?? 1);
  const selectedCardsPerPlayer = Math.min(
    cardsPerPlayer,
    getMaxCardsPerPlayer(deckType, selectedPlayerCount)
  );
  const roomCanStart =
    room !== null &&
    room.status === "waiting" &&
    room.players.length + selectedBotSeats >= selectedPlayerCount &&
    (connectedHumans.length <= 1 || connectedHumans.every((player) => player.ready));
  const isRoomHost = room !== null && room.hostPlayerId === room.yourPlayerId;
  const activePlayer = room?.players.find((player) => player.id === room.activePlayerId) ?? null;
  const turnStatus =
    room?.status === "complete"
      ? "Match complete"
      : room?.tradePhase.status === "open"
        ? "Card trade window open"
        : activePlayer?.kind === "bot"
          ? `${activePlayer.name} is thinking...`
          : isYourTurn
            ? "Your move"
            : "Waiting for your turn";

  useEffect(() => {
    if (profile === null) {
      return;
    }

    setProfileDisplayName(profile.displayName ?? playerName);
    setProfileAvatarKey(profile.avatarKey);
  }, [playerName, profile]);

  useEffect(() => {
    window.localStorage.setItem(HAND_SORT_STORAGE_KEY, handSortMode);
  }, [handSortMode]);

  useEffect(() => {
    mutedPlayerIdsRef.current = new Set(mutedPlayerIds);
  }, [mutedPlayerIds]);

  useEffect(() => {
    if (room?.status !== "waiting") return;
    setPlayerCount(room.rules.playerCount);
    setCardsPerPlayer(room.rules.cardsPerPlayer);
    setDeckType(room.rules.deckType);
    setBotSeats(room.configuredBotCount);
    setBotDifficulty(room.botDifficulty);
    setBotPace(room.botPace);
    setLobbyTimerEnabled(room.timerSettings.enabled);
    setTurnTimerSeconds(room.timerSettings.secondsPerTurn);
    setBombEndsTrick(room.rules.bombEndsTrick);
    setTradingEnabled(room.tradeEnabled);
  }, [room]);

  useEffect(() => {
    setManualCardOrderIds((current) => normalizeManualCardOrder(current, room?.yourHand ?? []));
  }, [room?.yourHand]);

  useLayoutEffect(() => {
    if (dealAnimationTriggerKey === null) {
      setDealAnimationKey(null);
      setHandDealtVisible(true);
      return;
    }

    setDealAnimationKey(dealAnimationTriggerKey);
    setHandDealtVisible(false);

    const revealHandTimeout = window.setTimeout(() => setHandDealtVisible(true), 1100);
    const clearDealTimeout = window.setTimeout(() => setDealAnimationKey(null), 2200);

    return () => {
      window.clearTimeout(revealHandTimeout);
      window.clearTimeout(clearDealTimeout);
    };
  }, [dealAnimationTriggerKey]);

  useEffect(() => {
    const inviteCode = getRoomCodeFromUrl();

    if (inviteCode !== null) {
      setJoinCode(inviteCode);
      setMessage(`Invite loaded for room ${inviteCode}.`);
    }

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
      autoConnect: true,
      ...(realtimeAuthToken === null ? {} : { auth: { token: realtimeAuthToken } })
    });
    const offlineTimeout = window.setTimeout(() => {
      if (!socket.connected) {
        setConnectionStatus("offline");
        setMessage("Realtime server is unavailable. We will keep trying automatically.");
      }
    }, 75_000);
    socketRef.current = socket;
    setConnectionStatus("waking");
    setMessage("Connecting to live tables. The free server may need a moment to wake up.");

    socket.on("connect", () => {
      window.clearTimeout(offlineTimeout);
      setConnectionStatus("online");
      setMessage("Connected to realtime server.");
      if (authUser !== null) {
        socket.emit(
          "profile:sync-account",
          { displayName: authUser.name, imageUrl: authUser.image },
          (ack) => {
            if (ack.ok) {
              setProfile(ack.data);
              setPlayerName(ack.data.displayName ?? "Player");
            }
          }
        );
      } else {
        refreshProfile(socket, getActiveProfileId(), setProfile);
      }
      refreshLeaderboard(socket, setLeaderboard);
      refreshLobby(socket, setLobby);
      refreshRankedQueue(socket, setRankedQueue);
      refreshTournamentQueue(socket, setTournamentQueue);
      refreshMatchHistory(socket, getActiveProfileId(), setMatchHistory);
      refreshCosmetics(socket, setCosmetics);
      const session = loadRoomSession(getActiveProfileId());

      if (session !== null) {
        socket.emit("room:reconnect", session, (ack) => {
          if (ack.ok) {
            setRoom(ack.data);
            setMessage("Reconnected to room.");
          } else {
            removeRoomSession();
          }
        });
      }
    });
    socket.on("disconnect", () => {
      setConnectionStatus(socket.active ? "waking" : "offline");
      setMessage(
        socket.active
          ? "Connection interrupted. Rejoining the realtime server..."
          : "Disconnected from realtime server."
      );
    });
    socket.on("connect_error", (error) => {
      setConnectionStatus(error.message.includes("account session") ? "offline" : "waking");
      setMessage(
        error.message.includes("account session")
          ? "Your account session expired. Refresh the page to reconnect."
          : "Unable to reach the realtime server. It may still be waking up."
      );
    });
    socket.on("room:state", (state) => {
      setRoom(state);
    });
    socket.on("lobby:state", (state) => {
      setLobby(state);
    });
    socket.on("ranked:state", (state) => {
      setRankedQueue(state);
    });
    socket.on("tournament:state", (state) => {
      setTournamentQueue(state);
    });
    socket.on("chat:message", (chatMessage) => {
      if (mutedPlayerIdsRef.current.has(chatMessage.playerId)) {
        return;
      }

      setRoom((currentRoom) =>
        currentRoom === null
          ? currentRoom
          : {
              ...currentRoom,
              recentChat: [...currentRoom.recentChat, chatMessage].slice(-20)
            }
      );
    });
    socket.on("game:error", (payload) => {
      setMessage(payload.message);
    });

    return () => {
      window.clearTimeout(offlineTimeout);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [realtimeAuthToken]);

  useEffect(() => {
    if (room?.yourPlayerId === null || room === null) {
      return;
    }

    const player = room.players.find((candidate) => candidate.id === room.yourPlayerId);

    if (player?.stats === undefined || player.stats === null) {
      return;
    }

    setProfile({
      guestId: getActiveProfileId(),
      displayName: profile?.displayName ?? profileDisplayName,
      imageUrl: profile?.imageUrl ?? authUser?.image ?? null,
      avatarKey: profile?.avatarKey ?? profileAvatarKey,
      ...player.stats,
      isAdmin: profile?.isAdmin ?? false,
      unlocks: profile?.unlocks ?? [],
      equippedCosmetics: profile?.equippedCosmetics ?? []
    });

    if (room.status === "complete" && socketRef.current !== null) {
      const completionKey = `${room.roomCode}:${room.turnNumber}`;

      if (lastCompletionRefreshRef.current !== completionKey) {
        lastCompletionRefreshRef.current = completionKey;
        refreshProfile(socketRef.current, getActiveProfileId(), setProfile);
        refreshCosmetics(socketRef.current, setCosmetics);
      }

      refreshLeaderboard(socketRef.current, setLeaderboard);
      refreshMatchHistory(socketRef.current, getActiveProfileId(), setMatchHistory);
    }
  }, [authUser?.image, profile?.equippedCosmetics, profile?.imageUrl, profile?.unlocks, room]);

  useEffect(() => {
    const latestChatMessage = room?.recentChat.at(-1) ?? null;
    const latestChatKey =
      room === null || latestChatMessage === null
        ? null
        : `${room.roomCode}:${latestChatMessage.id}`;

    if (latestChatKey === null) {
      lastObservedChatKeyRef.current = null;
      setUnreadChatCount(0);
      return;
    }

    if (lastObservedChatKeyRef.current === null) {
      lastObservedChatKeyRef.current = latestChatKey;
      return;
    }

    if (lastObservedChatKeyRef.current !== latestChatKey) {
      lastObservedChatKeyRef.current = latestChatKey;
      setUnreadChatCount((current) => (activeTablePanel === "chat" ? 0 : current + 1));
    }

    if (activeTablePanel === "chat") {
      setUnreadChatCount(0);
    }
  }, [activeTablePanel, room?.recentChat, room?.roomCode]);

  useEffect(() => {
    if (room?.status === "in-progress" || room?.status === "complete") {
      return;
    }

    setBotSeats((current) => Math.min(current, availableBotSeats));
  }, [availableBotSeats, room?.status]);

  useEffect(() => {
    setCardsPerPlayer((current) => Math.min(current, getMaxCardsPerPlayer(deckType, playerCount)));
  }, [deckType, playerCount]);

  useEffect(() => {
    const deadlineAt = room?.tradePhase.deadlineAt ?? room?.turnTimer?.deadlineAt;

    if (deadlineAt === null || deadlineAt === undefined) {
      return;
    }

    setTimerNow(Date.now());
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [room?.tradePhase.deadlineAt, room?.turnTimer?.deadlineAt]);

  useEffect(() => {
    if (room?.tradePhase.status !== "open") {
      return;
    }

    const targets = room.players.filter(
      (player) => player.id !== room.yourPlayerId && player.kind === "human" && player.connected
    );
    setTradeTargetPlayerId((current) =>
      targets.some((player) => player.id === current) ? current : (targets[0]?.id ?? "")
    );
  }, [room?.players, room?.tradePhase.status, room?.yourPlayerId]);

  function createRoom() {
    socketRef.current?.emit(
      "room:create",
      {
        playerName,
        guestId: getActiveProfileId()
      },
      handleRoomAck("Room created.")
    );
  }

  function changeDeckType(nextDeckType: DeckType) {
    const seatedPlayers = room?.players.length ?? 0;
    const maximumPlayers = getMaxPlayersForSetup(nextDeckType, cardsPerPlayer);

    if (seatedPlayers > maximumPlayers) {
      setMessage(
        `The ${nextDeckType === "classic" ? "Classic" : "Arena 6"} deck cannot seat ${seatedPlayers} players with ${cardsPerPlayer} cards each.`
      );
      return;
    }

    setDeckType(nextDeckType);
    setPlayerCount((current) => Math.min(current, maximumPlayers));
  }

  function createBotGame() {
    socketRef.current?.emit(
      "room:create",
      {
        playerName,
        guestId: getActiveProfileId()
      },
      (createAck) => {
        if (!createAck.ok) {
          setMessage(createAck.error);
          return;
        }

        setRoom(createAck.data);
        saveRoomSession(createAck.data, getActiveProfileId());
        syncRoomCodeToUrl(createAck.data.roomCode);

        socketRef.current?.emit(
          "room:start",
          {
            roomCode: createAck.data.roomCode,
            botCount: selectedBotSeats,
            timer: {
              enabled: lobbyTimerEnabled,
              secondsPerTurn: turnTimerSeconds
            },
            rules: {
              bombEndsTrick,
              deckType,
              playerCount: selectedPlayerCount,
              cardsPerPlayer: selectedCardsPerPlayer
            },
            botDifficulty,
            botPace,
            trade: {
              enabled: false
            }
          },
          handleRoomAck("Started a bot table.")
        );
      }
    );
  }

  function joinRoom() {
    joinRoomByCode(joinCode);
  }

  function joinOpenRoom(openRoom: PublicOpenRoom) {
    setJoinCode(openRoom.roomCode);
    joinRoomByCode(openRoom.roomCode);
  }

  function joinRankedQueue() {
    socketRef.current?.emit(
      "ranked:join",
      {
        playerName,
        guestId: getActiveProfileId()
      },
      (ack) => {
        if (ack.ok) {
          setRankedQueue(ack.data);
          setMessage("Joined ranked queue. Waiting for 4 human players.");
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function leaveRankedQueue() {
    socketRef.current?.emit("ranked:leave", (ack) => {
      if (ack.ok) {
        setRankedQueue(ack.data);
        setMessage("Left ranked queue.");
      } else {
        setMessage(ack.error);
      }
    });
  }

  function joinTournamentQueue() {
    socketRef.current?.emit("tournament:join", { playerName }, (ack) => {
      if (ack.ok) {
        setTournamentQueue(ack.data);
        setMessage("Joined the tournament queue. Eight humans are required.");
      } else {
        setMessage(ack.error);
      }
    });
  }

  function leaveTournamentQueue() {
    socketRef.current?.emit("tournament:leave", (ack) => {
      if (ack.ok) {
        setTournamentQueue(ack.data);
        setMessage("Left the tournament queue.");
      } else {
        setMessage(ack.error);
      }
    });
  }

  function updateProfileIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    socketRef.current?.emit(
      "profile:update",
      {
        guestId: getActiveProfileId(),
        displayName: profileDisplayName,
        avatarKey: profileAvatarKey
      },
      (ack) => {
        if (ack.ok) {
          setProfile(ack.data);
          setPlayerName(ack.data.displayName ?? profileDisplayName);
          setMessage("Profile updated.");
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function joinRoomByCode(roomCode: string) {
    socketRef.current?.emit(
      "room:join",
      {
        roomCode,
        playerName,
        guestId: getActiveProfileId()
      },
      handleRoomAck("Joined room.")
    );
  }

  function startRoom() {
    if (room === null) {
      return;
    }

    socketRef.current?.emit(
      "room:start",
      {
        roomCode: room.roomCode,
        botCount: selectedBotSeats,
        timer: {
          enabled: lobbyTimerEnabled,
          secondsPerTurn: turnTimerSeconds
        },
        rules: {
          bombEndsTrick,
          deckType,
          playerCount: selectedPlayerCount,
          cardsPerPlayer: selectedCardsPerPlayer
        },
        botDifficulty,
        botPace,
        trade: {
          enabled: tradingEnabled
        }
      },
      handleRoomAck("Game started.")
    );
  }

  function configureRoom(next: {
    readonly botSeats?: number;
    readonly deckType?: DeckType;
    readonly playerCount?: number;
    readonly cardsPerPlayer?: number;
    readonly timerEnabled?: boolean;
    readonly timerSeconds?: number;
    readonly bombEndsTrick?: boolean;
    readonly tradingEnabled?: boolean;
    readonly botDifficulty?: PublicBotDifficulty;
    readonly botPace?: PublicBotPace;
  }) {
    if (room === null || !isRoomHost) return;

    const nextDeckType = next.deckType ?? deckType;
    const requestedPlayerCount = next.playerCount ?? selectedPlayerCount;
    const nextCardsPerPlayer = Math.min(
      next.cardsPerPlayer ?? selectedCardsPerPlayer,
      getMaxCardsPerPlayer(nextDeckType, requestedPlayerCount)
    );
    const nextPlayerCount = Math.max(
      room.players.length,
      Math.min(requestedPlayerCount, getMaxPlayersForSetup(nextDeckType, nextCardsPerPlayer))
    );
    const nextBotSeats = Math.min(
      next.botSeats ?? selectedBotSeats,
      Math.max(0, nextPlayerCount - room.players.length)
    );

    socketRef.current?.emit(
      "room:configure",
      {
        roomCode: room.roomCode,
        botCount: nextBotSeats,
        timer: {
          enabled: next.timerEnabled ?? lobbyTimerEnabled,
          secondsPerTurn: next.timerSeconds ?? turnTimerSeconds
        },
        rules: {
          bombEndsTrick: next.bombEndsTrick ?? bombEndsTrick,
          deckType: nextDeckType,
          playerCount: nextPlayerCount,
          cardsPerPlayer: nextCardsPerPlayer
        },
        botDifficulty: next.botDifficulty ?? botDifficulty,
        botPace: next.botPace ?? botPace,
        trade: { enabled: next.tradingEnabled ?? tradingEnabled }
      },
      handleRoomAck("Table settings updated. Players must ready again.")
    );
  }

  function setReady(ready: boolean) {
    if (room === null) {
      return;
    }

    socketRef.current?.emit("room:ready", { roomCode: room.roomCode, ready }, (ack) => {
      if (ack.ok) {
        setRoom(ack.data);
        setMessage(ready ? "You are ready." : "You are no longer ready.");
      } else {
        setMessage(ack.error);
      }
    });
  }

  function leaveRoom() {
    if (room === null) {
      return;
    }

    socketRef.current?.emit("room:leave", { roomCode: room.roomCode }, (ack) => {
      if (ack.ok) {
        setRoom(null);
        setSelectedCardIds([]);
        removeRoomSession();
        clearRoomCodeFromUrl();
        setMessage("Left room.");
      } else {
        setMessage(ack.error);
      }
    });
  }

  function playSelected() {
    submitMove({
      type: "play",
      cards: selectedCards
    });
  }

  function passTurn() {
    submitMove({
      type: "pass"
    });
  }

  function submitMove(move: Move) {
    if (room === null) {
      return;
    }

    socketRef.current?.emit(
      "game:move",
      {
        roomCode: room.roomCode,
        move
      },
      (ack) => {
        if (ack.ok) {
          setRoom(ack.data);
          setSelectedCardIds([]);
          setMessage(
            move.type === "pass"
              ? "You passed."
              : `You played ${move.cards.map(formatCard).join(" ")}`
          );
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function requestCardTrade() {
    if (room === null || selectedCards.length !== 1 || selectedCards[0] === undefined) {
      setMessage("Select exactly one card to offer.");
      return;
    }

    if (tradeTargetPlayerId === "") {
      setMessage("Choose a player for the trade request.");
      return;
    }

    socketRef.current?.emit(
      "trade:request",
      {
        roomCode: room.roomCode,
        toPlayerId: tradeTargetPlayerId,
        offeredCard: selectedCards[0],
        requestedRank: tradeRequestedRank
      },
      (ack) => {
        if (ack.ok) {
          setRoom(ack.data);
          setSelectedCardIds([]);
          setMessage("Trade request sent.");
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function respondToCardTrade(requestId: string, accept: boolean) {
    if (room === null) {
      return;
    }

    const request = room.tradePhase.requests.find((candidate) => candidate.id === requestId);
    const requestedCard = selectedCards[0];

    if (
      accept &&
      (selectedCards.length !== 1 ||
        requestedCard === undefined ||
        requestedCard.rank !== request?.requestedRank)
    ) {
      setMessage(`Select one ${request?.requestedRank ?? "requested"} card to accept.`);
      return;
    }

    socketRef.current?.emit(
      "trade:respond",
      {
        roomCode: room.roomCode,
        requestId,
        accept,
        ...(accept && requestedCard !== undefined ? { requestedCard } : {})
      },
      (ack) => {
        if (ack.ok) {
          setRoom(ack.data);
          setSelectedCardIds([]);
          setMessage(accept ? "Trade accepted." : "Trade declined.");
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function sendChat(body: string) {
    if (room === null) {
      return;
    }

    socketRef.current?.emit("chat:send", { roomCode: room.roomCode, body }, (ack) => {
      if (!ack.ok) {
        setMessage(ack.error);
      }
    });
  }

  function toggleMutePlayer(playerId: string) {
    setMutedPlayerIds((current) => {
      const next = new Set(current);

      if (next.has(playerId)) {
        next.delete(playerId);
        setMessage("Player unmuted.");
      } else {
        next.add(playerId);
        setMessage("Player muted for this session.");
      }

      return next;
    });
  }

  function setPlayerBlocked(playerId: string, blocked: boolean) {
    if (room === null) {
      return;
    }

    socketRef.current?.emit(
      "moderation:block",
      { roomCode: room.roomCode, targetPlayerId: playerId, blocked },
      (ack) => {
        if (ack.ok) {
          setRoom(ack.data);
          setMutedPlayerIds((current) => {
            const next = new Set(current);
            if (blocked) {
              next.add(playerId);
            } else {
              next.delete(playerId);
            }
            return next;
          });
          setMessage(blocked ? "Player blocked. Their chat is hidden." : "Player unblocked.");
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function reportPlayer(input: {
    readonly targetPlayerId: string;
    readonly reason: PlayerReportReason;
    readonly details?: string;
    readonly messageId?: string;
  }): Promise<ServerAck<PublicModerationReceipt>> {
    return new Promise((resolve) => {
      if (room === null || socketRef.current === null) {
        resolve({ ok: false, error: "Join a room before reporting a player." });
        return;
      }

      socketRef.current.emit(
        "moderation:report",
        {
          roomCode: room.roomCode,
          targetPlayerId: input.targetPlayerId,
          reason: input.reason,
          ...(input.details === undefined ? {} : { details: input.details }),
          ...(input.messageId === undefined ? {} : { messageId: input.messageId })
        },
        (ack) => {
          setMessage(ack.ok ? "Report submitted for review." : ack.error);
          resolve(ack);
        }
      );
    });
  }

  function submitFeedback(input: {
    readonly kind: FeedbackKind;
    readonly body: string;
    readonly contactEmail: string;
  }): Promise<ServerAck<PublicFeedbackReceipt>> {
    return new Promise((resolve) => {
      if (socketRef.current === null) {
        resolve({
          ok: false,
          error: "Realtime server is not connected."
        });
        return;
      }

      socketRef.current.emit(
        "feedback:submit",
        {
          kind: input.kind,
          body: input.body,
          guestId: getActiveProfileId(),
          contactEmail: input.contactEmail,
          ...(room === null
            ? {}
            : {
                roomCode: room.roomCode
              })
        },
        (ack) => {
          if (ack.ok) {
            setMessage(ack.data.stored ? "Feedback saved." : "Feedback received for this session.");
          } else {
            setMessage(ack.error);
          }

          resolve(ack);
        }
      );
    });
  }

  function reviewCompletedMatch(): Promise<ServerAck<readonly PublicReplayDecisionReview[]>> {
    return new Promise((resolve) => {
      if (socketRef.current === null || room === null) {
        resolve({
          ok: false,
          error: "Completed match is not connected."
        });
        return;
      }

      socketRef.current.emit(
        "coach:review",
        {
          roomCode: room.roomCode,
          rollouts: 3,
          maxDecisions: 2,
          maxMoves: 6
        },
        resolve
      );
    });
  }

  function equipCosmetic(cosmetic: PublicCosmetic) {
    socketRef.current?.emit(
      "cosmetics:equip",
      {
        guestId: getActiveProfileId(),
        cosmeticId: cosmetic.id
      },
      (ack) => {
        if (ack.ok) {
          setProfile(ack.data);
          setMessage(`${cosmetic.name} equipped.`);
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function purchaseCosmetic(cosmetic: PublicCosmetic) {
    socketRef.current?.emit(
      "cosmetics:purchase",
      {
        guestId: getActiveProfileId(),
        cosmeticId: cosmetic.id
      },
      (ack) => {
        if (ack.ok) {
          setProfile(ack.data);
          setMessage(`${cosmetic.name} unlocked.`);
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function labelReplay(matchId: string, label: string) {
    socketRef.current?.emit(
      "profile:label-replay",
      {
        guestId: getActiveProfileId(),
        matchId,
        label
      },
      (ack) => {
        if (ack.ok) {
          setMatchHistory(ack.data);
          setMessage("Replay label saved.");
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function toggleCard(card: Card) {
    const cardId = getCardId(card);
    setSelectedCardIds((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]
    );
  }

  function moveSelectedCardInHand(direction: -1 | 1) {
    if (selectedManualCardId === null) {
      return;
    }

    moveCardInHand(selectedManualCardId, direction);
  }

  function moveSelectedCardToEdge(edge: "start" | "end") {
    if (selectedManualCardId === null) {
      return;
    }

    setHandSortMode("manual");
    setManualCardOrderIds((current) => {
      const normalizedOrder = normalizeManualCardOrder(current, room?.yourHand ?? []);
      const fromIndex = normalizedOrder.indexOf(selectedManualCardId);

      if (fromIndex < 0) {
        return normalizedOrder;
      }

      const nextOrder = [...normalizedOrder];
      const [movedCardId] = nextOrder.splice(fromIndex, 1);

      if (movedCardId === undefined) {
        return normalizedOrder;
      }

      nextOrder.splice(edge === "start" ? 0 : nextOrder.length, 0, movedCardId);

      return nextOrder;
    });
  }

  function resetManualHandOrder() {
    setManualCardOrderIds([]);
    setHandSortMode("rank");
  }

  function moveCardInHand(cardIdToMove: string, direction: number) {
    if (direction === 0) {
      return;
    }

    setHandSortMode("manual");
    setManualCardOrderIds((current) => {
      const normalizedOrder = normalizeManualCardOrder(current, room?.yourHand ?? []);
      const fromIndex = normalizedOrder.indexOf(cardIdToMove);
      const toIndex = Math.max(0, Math.min(normalizedOrder.length - 1, fromIndex + direction));

      if (fromIndex < 0 || fromIndex === toIndex) {
        return normalizedOrder;
      }

      const nextOrder = [...normalizedOrder];
      const [movedCardId] = nextOrder.splice(fromIndex, 1);

      if (movedCardId === undefined) {
        return normalizedOrder;
      }

      nextOrder.splice(toIndex, 0, movedCardId);

      return nextOrder;
    });
  }

  function handleManualCardDrag(card: Card, info: PanInfo) {
    const dragSteps = Math.round(info.offset.x / MANUAL_CARD_DRAG_STEP_PX);

    if (dragSteps !== 0) {
      moveCardInHand(getCardId(card), dragSteps);
    }
  }

  function handleRoomAck(successMessage: string) {
    return (ack: ServerAck<PublicRoomState>) => {
      if (ack.ok) {
        setRoom(ack.data);
        setSelectedCardIds([]);
        saveRoomSession(ack.data, getActiveProfileId());
        syncRoomCodeToUrl(ack.data.roomCode);
        setMessage(successMessage);
      } else {
        setMessage(ack.error);
      }
    };
  }

  function getActiveProfileId(): string {
    return authUser?.profileId ?? getOrCreateGuestId();
  }

  if (room === null) {
    return (
      <OnlineLobbyHub
        connected={connected}
        connectionStatus={connectionStatus}
        playerName={playerName}
        authUser={authUser}
        profile={profile}
        profileDisplayName={profileDisplayName}
        profileAvatarKey={profileAvatarKey}
        hubMode={hubMode}
        joinCode={joinCode}
        lobby={lobby}
        rankedQueue={rankedQueue}
        tournamentQueue={tournamentQueue}
        leaderboard={leaderboard}
        matchHistory={matchHistory}
        cosmetics={cosmetics}
        botSeats={botSeats}
        maxBotSeats={availableBotSeats}
        deckType={deckType}
        playerCount={playerCount}
        cardsPerPlayer={selectedCardsPerPlayer}
        timerEnabled={lobbyTimerEnabled}
        timerSeconds={turnTimerSeconds}
        bombEndsTrick={bombEndsTrick}
        botDifficulty={botDifficulty}
        botPace={botPace}
        message={message}
        onPlayerNameChange={setPlayerName}
        onProfileDisplayNameChange={setProfileDisplayName}
        onProfileAvatarKeyChange={setProfileAvatarKey}
        onProfileSave={updateProfileIdentity}
        onHubModeChange={setHubMode}
        onJoinCodeChange={setJoinCode}
        onCreateRoom={createRoom}
        onCreateBotGame={createBotGame}
        onJoinRoom={joinRoom}
        onJoinOpenRoom={joinOpenRoom}
        onJoinRanked={joinRankedQueue}
        onLeaveRanked={leaveRankedQueue}
        onJoinTournament={joinTournamentQueue}
        onLeaveTournament={leaveTournamentQueue}
        onBotSeatsChange={setBotSeats}
        onDeckTypeChange={changeDeckType}
        onPlayerCountChange={setPlayerCount}
        onCardsPerPlayerChange={setCardsPerPlayer}
        onTimerEnabledChange={setLobbyTimerEnabled}
        onTimerSecondsChange={setTurnTimerSeconds}
        onBombEndsTrickChange={setBombEndsTrick}
        onBotDifficultyChange={setBotDifficulty}
        onBotPaceChange={setBotPace}
        onEquipCosmetic={equipCosmetic}
        onPurchaseCosmetic={purchaseCosmetic}
        onLabelReplay={labelReplay}
        onSubmitFeedback={submitFeedback}
      />
    );
  }

  if (room.status === "waiting") {
    return (
      <OnlineWaitingRoom
        room={room}
        connected={connected}
        connectionStatus={connectionStatus}
        message={message}
        botSeats={selectedBotSeats}
        maxBotSeats={availableBotSeats}
        deckType={deckType}
        playerCount={selectedPlayerCount}
        cardsPerPlayer={selectedCardsPerPlayer}
        timerEnabled={lobbyTimerEnabled}
        timerSeconds={turnTimerSeconds}
        bombEndsTrick={bombEndsTrick}
        tradingEnabled={tradingEnabled}
        botDifficulty={botDifficulty}
        botPace={botPace}
        roomCanStart={roomCanStart}
        isHost={isRoomHost}
        yourReady={yourPlayer?.ready ?? false}
        onCopyRoomCode={() => {
          void navigator.clipboard?.writeText(room.roomCode);
          setMessage("Room code copied.");
        }}
        onCopyInvite={() => {
          void navigator.clipboard?.writeText(getRoomInviteUrl(room.roomCode));
          setMessage("Invite link copied.");
        }}
        onReady={() => setReady(!yourPlayer?.ready)}
        onStart={startRoom}
        onLeave={leaveRoom}
        onBotSeatsChange={(value) => configureRoom({ botSeats: value })}
        onDeckTypeChange={(value) => configureRoom({ deckType: value })}
        onPlayerCountChange={(value) => configureRoom({ playerCount: value })}
        onCardsPerPlayerChange={(value) => configureRoom({ cardsPerPlayer: value })}
        onTimerEnabledChange={(value) => configureRoom({ timerEnabled: value })}
        onTimerSecondsChange={(value) => configureRoom({ timerSeconds: value })}
        onBombEndsTrickChange={(value) => configureRoom({ bombEndsTrick: value })}
        onTradingEnabledChange={(value) => configureRoom({ tradingEnabled: value })}
        onBotDifficultyChange={(value) => configureRoom({ botDifficulty: value })}
        onBotPaceChange={(value) => configureRoom({ botPace: value })}
      />
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden px-3 py-3 text-white sm:px-5 lg:px-8">
      <section className="mx-auto grid min-w-0 w-full max-w-[100rem] gap-3 lg:h-[calc(100vh-1.5rem)] lg:grid-rows-[auto_minmax(0,1fr)]">
        <ActiveRoomBar
          room={room}
          connectionStatus={connectionStatus}
          turnStatus={turnStatus}
          message={message}
          activePanel={activeTablePanel}
          unreadChatCount={unreadChatCount}
          onTogglePanel={(panel) =>
            setActiveTablePanel((currentPanel) => (currentPanel === panel ? null : panel))
          }
          onCopyRoomCode={() => {
            if (room === null) {
              return;
            }

            void navigator.clipboard?.writeText(room.roomCode);
            setMessage("Room code copied.");
          }}
          onCopyInvite={() => {
            if (room === null) {
              return;
            }

            void navigator.clipboard?.writeText(getRoomInviteUrl(room.roomCode));
            setMessage("Invite link copied.");
          }}
          onLeaveRoom={leaveRoom}
        />

        <section className="table-stage relative min-w-0 min-h-[44rem] sm:min-h-[48rem] lg:min-h-0">
          <OnlineTable
            room={room}
            timerNow={timerNow}
            dealAnimationKey={shouldReduceMotion ? null : dealAnimationKey}
            onCreateBotGame={createBotGame}
            onLeaveRoom={leaveRoom}
            onReviewDecisions={reviewCompletedMatch}
            mutedPlayerIds={mutedPlayerIds}
            onToggleMute={toggleMutePlayer}
            onSetBlocked={setPlayerBlocked}
            onReportPlayer={reportPlayer}
          />
          {room.tradePhase.status === "open" ? (
            <TradePhaseOverlay
              room={room}
              timerNow={timerNow}
              selectedCards={selectedCards}
              targetPlayerId={tradeTargetPlayerId}
              requestedRank={tradeRequestedRank}
              onTargetPlayerChange={setTradeTargetPlayerId}
              onRequestedRankChange={setTradeRequestedRank}
              onRequest={requestCardTrade}
              onRespond={respondToCardTrade}
            />
          ) : null}
          <ActiveTableDrawer
            panel={activeTablePanel}
            room={room}
            onClose={() => setActiveTablePanel(null)}
            onSendChat={sendChat}
            mutedPlayerIds={mutedPlayerIds}
            onToggleMute={toggleMutePlayer}
            onReportPlayer={reportPlayer}
          />

          <section
            className={cn(
              "hand-dock-on-table absolute inset-x-2 bottom-3 z-30 min-w-0 px-2 pb-1 pt-3 sm:inset-x-8 sm:bottom-6 sm:px-3",
              room.status === "complete" && "hidden"
            )}
          >
            <div className="hand-control-rail mx-auto mb-1.5 flex w-fit max-w-full flex-col items-start gap-2 rounded-full border border-white/10 px-2.5 py-2 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-black text-white">{yourPlayer?.name ?? "Your hand"}</p>
                  {isYourTurn && room.tradePhase.status !== "open" ? (
                    <motion.span
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-[0_0_18px_rgba(242,193,78,0.24)]"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <Play className="size-2.5 fill-current" />
                      Your turn
                    </motion.span>
                  ) : null}
                </div>
                <p className="max-w-64 truncate text-xs text-zinc-300" aria-live="polite">
                  {yourPlayer?.cardsRemaining ?? displayedHand.length} cards left ·{" "}
                  {room.tradePhase.status === "open"
                    ? getTradeHandPrompt(room, selectedCards)
                    : isYourTurn
                      ? playableCardCount === 0 && canPass
                        ? "no legal play · pass to continue"
                        : `${selectedCards.length} selected · ${legalMoves.length} legal options`
                      : turnStatus}
                </p>
              </div>
              <div className="flex w-full flex-wrap justify-start gap-1.5 sm:w-auto sm:justify-end">
                <label className="relative flex h-9 items-center rounded-full border border-white/10 bg-black/24 text-zinc-300 transition focus-within:border-[var(--gold)]">
                  <ListOrdered className="pointer-events-none absolute left-3 size-3.5" />
                  <span className="sr-only">Sort hand</span>
                  <select
                    aria-label="Sort hand"
                    className="h-full appearance-none bg-transparent py-0 pl-8 pr-8 text-xs font-black text-white outline-none"
                    value={handSortMode}
                    onChange={(event) => setHandSortMode(event.target.value as HandSortMode)}
                  >
                    {HAND_SORT_OPTIONS.map((option) => (
                      <option key={option.mode} className="bg-zinc-950" value={option.mode}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-zinc-500" />
                </label>
                {selectedCards.length > 0 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-9 px-0"
                    aria-label="Clear selected cards"
                    title="Clear selected cards"
                    onClick={() => setSelectedCardIds([])}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
                {handSortMode === "manual" ? (
                  <div className="flex rounded-md border border-white/10 bg-black/24 p-0.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 border-0 bg-transparent px-0 hover:bg-white/10"
                      aria-label="Move selected card to start"
                      title="Move selected card to start"
                      onClick={() => moveSelectedCardToEdge("start")}
                      disabled={!canMoveManualCardToEdge || selectedManualCardIndex === 0}
                    >
                      <ChevronsLeft className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 border-0 bg-transparent px-0 hover:bg-white/10"
                      aria-label="Move selected card left"
                      title="Move selected card left"
                      onClick={() => moveSelectedCardInHand(-1)}
                      disabled={!canMoveManualCardLeft}
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 border-0 bg-transparent px-0 hover:bg-white/10"
                      aria-label="Move selected card right"
                      title="Move selected card right"
                      onClick={() => moveSelectedCardInHand(1)}
                      disabled={!canMoveManualCardRight}
                    >
                      <ArrowRight className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 border-0 bg-transparent px-0 hover:bg-white/10"
                      aria-label="Move selected card to end"
                      title="Move selected card to end"
                      onClick={() => moveSelectedCardToEdge("end")}
                      disabled={
                        !canMoveManualCardToEdge ||
                        selectedManualCardIndex === displayedHand.length - 1
                      }
                    >
                      <ChevronsRight className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 border-0 bg-transparent px-0 hover:bg-white/10"
                      aria-label="Reset hand order"
                      title="Reset hand order"
                      onClick={resetManualHandOrder}
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  </div>
                ) : null}
                <Button variant="secondary" onClick={passTurn} disabled={!isYourTurn || !canPass}>
                  Pass
                </Button>
                <Button onClick={playSelected} disabled={!isYourTurn || !canPlaySelected}>
                  <Send className="size-4" />
                  Play
                </Button>
              </div>
            </div>

            <div className="table-hand-scroll flex min-h-28 items-end overflow-x-auto px-1 pb-1 pt-5 sm:min-h-32">
              <div className="player-hand-fan mx-auto flex min-w-max items-end px-3 sm:px-4">
                <AnimatePresence initial={false} mode="sync">
                  {(handDealtVisible ? displayedHand : []).map((card, index) => {
                    const selected = selectedCardIds.includes(getCardId(card));
                    const playable = isYourTurn && playableCardIds.has(getCardId(card));
                    const disabled = room.tradePhase.status !== "open" && isYourTurn && !playable;
                    const cardName = formatCardName(card);

                    return (
                      <motion.button
                        key={getCardId(card)}
                        layout="position"
                        layoutId={`table-card-${room.roomCode}-${getCardId(card)}`}
                        type="button"
                        className="hand-card-slot relative h-24 w-16 shrink-0 rounded-md disabled:cursor-not-allowed disabled:opacity-45 sm:h-28 sm:w-20"
                        aria-label={`${selected ? "Deselect" : "Select"} ${cardName}${
                          playable ? ", legal option" : disabled ? ", unavailable this turn" : ""
                        }`}
                        aria-pressed={selected}
                        disabled={disabled}
                        title={disabled ? `${cardName} cannot be used in a legal play` : cardName}
                        initial={
                          shouldReduceMotion
                            ? false
                            : dealAnimationKey === null
                              ? { opacity: 0, y: 42, scale: 0.96 }
                              : {
                                  opacity: 0,
                                  x: Math.max(
                                    -180,
                                    Math.min(180, ((displayedHand.length - 1) / 2 - index) * 30)
                                  ),
                                  y: -190,
                                  scale: 0.78,
                                  rotate: Math.max(
                                    -4,
                                    Math.min(4, (index - (displayedHand.length - 1) / 2) * 0.8)
                                  )
                                }
                        }
                        animate={{
                          opacity: 1,
                          x: 0,
                          y: shouldReduceMotion ? 0 : selected ? -18 : 0,
                          scale: shouldReduceMotion ? 1 : selected ? 1.03 : 1,
                          rotate: 0
                        }}
                        exit={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : {
                                opacity: 0,
                                x: Math.max(
                                  -140,
                                  Math.min(140, (index - displayedHand.length / 2) * 18)
                                ),
                                y: -280,
                                scale: 0.72,
                                rotate: index % 2 === 0 ? -10 : 10
                              }
                        }
                        transition={{
                          ...(shouldReduceMotion
                            ? { duration: 0 }
                            : {
                                delay: dealAnimationKey === null ? 0 : Math.min(0.52, index * 0.04),
                                type: "spring",
                                stiffness: 205,
                                damping: 25,
                                mass: 0.78
                              })
                        }}
                        drag={disabled ? false : "x"}
                        dragSnapToOrigin
                        dragElastic={0.18}
                        dragMomentum={false}
                        onDragStart={() => setHandSortMode("manual")}
                        onDragEnd={(_event, info) => handleManualCardDrag(card, info)}
                        {...(isYourTurn && !disabled && !shouldReduceMotion
                          ? {
                              whileHover: {
                                y: selected ? -20 : -8
                              }
                            }
                          : {})}
                        onClick={() => toggleCard(card)}
                      >
                        <OnlineCard
                          card={card}
                          cardTheme={yourCardTheme}
                          selected={selected}
                          playable={playable}
                        />
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function OnlineLobbyHub({
  connected,
  connectionStatus,
  playerName,
  authUser,
  profile,
  profileDisplayName,
  profileAvatarKey,
  hubMode,
  joinCode,
  lobby,
  rankedQueue,
  tournamentQueue,
  leaderboard,
  matchHistory,
  cosmetics,
  botSeats,
  maxBotSeats,
  deckType,
  playerCount,
  cardsPerPlayer,
  timerEnabled,
  timerSeconds,
  bombEndsTrick,
  botDifficulty,
  botPace,
  message,
  onPlayerNameChange,
  onProfileDisplayNameChange,
  onProfileAvatarKeyChange,
  onProfileSave,
  onHubModeChange,
  onJoinCodeChange,
  onCreateRoom,
  onCreateBotGame,
  onJoinRoom,
  onJoinOpenRoom,
  onJoinRanked,
  onLeaveRanked,
  onJoinTournament,
  onLeaveTournament,
  onBotSeatsChange,
  onDeckTypeChange,
  onPlayerCountChange,
  onCardsPerPlayerChange,
  onTimerEnabledChange,
  onTimerSecondsChange,
  onBombEndsTrickChange,
  onBotDifficultyChange,
  onBotPaceChange,
  onEquipCosmetic,
  onPurchaseCosmetic,
  onLabelReplay,
  onSubmitFeedback
}: {
  readonly connected: boolean;
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly playerName: string;
  readonly authUser: AuthUser | null;
  readonly profile: PublicGuestProfile | null;
  readonly profileDisplayName: string;
  readonly profileAvatarKey: ProfileAvatarKey;
  readonly hubMode: OnlineHubMode;
  readonly joinCode: string;
  readonly lobby: PublicLobbyState | null;
  readonly rankedQueue: PublicRankedQueueState | null;
  readonly tournamentQueue: PublicTournamentQueueState | null;
  readonly leaderboard: readonly PublicLeaderboardEntry[];
  readonly matchHistory: readonly PublicMatchHistoryItem[];
  readonly cosmetics: readonly PublicCosmetic[];
  readonly botSeats: number;
  readonly maxBotSeats: number;
  readonly deckType: DeckType;
  readonly playerCount: number;
  readonly cardsPerPlayer: number;
  readonly timerEnabled: boolean;
  readonly timerSeconds: number;
  readonly bombEndsTrick: boolean;
  readonly botDifficulty: PublicBotDifficulty;
  readonly botPace: PublicBotPace;
  readonly message: string;
  readonly onPlayerNameChange: (value: string) => void;
  readonly onProfileDisplayNameChange: (value: string) => void;
  readonly onProfileAvatarKeyChange: (value: ProfileAvatarKey) => void;
  readonly onProfileSave: (event: FormEvent<HTMLFormElement>) => void;
  readonly onHubModeChange: (mode: OnlineHubMode) => void;
  readonly onJoinCodeChange: (value: string) => void;
  readonly onCreateRoom: () => void;
  readonly onCreateBotGame: () => void;
  readonly onJoinRoom: () => void;
  readonly onJoinOpenRoom: (room: PublicOpenRoom) => void;
  readonly onJoinRanked: () => void;
  readonly onLeaveRanked: () => void;
  readonly onJoinTournament: () => void;
  readonly onLeaveTournament: () => void;
  readonly onBotSeatsChange: (count: number) => void;
  readonly onDeckTypeChange: (deckType: DeckType) => void;
  readonly onPlayerCountChange: (count: number) => void;
  readonly onCardsPerPlayerChange: (count: number) => void;
  readonly onTimerEnabledChange: (enabled: boolean) => void;
  readonly onTimerSecondsChange: (seconds: number) => void;
  readonly onBombEndsTrickChange: (enabled: boolean) => void;
  readonly onBotDifficultyChange: (difficulty: PublicBotDifficulty) => void;
  readonly onBotPaceChange: (pace: PublicBotPace) => void;
  readonly onEquipCosmetic: (cosmetic: PublicCosmetic) => void;
  readonly onPurchaseCosmetic: (cosmetic: PublicCosmetic) => void;
  readonly onLabelReplay: (matchId: string, label: string) => void;
  readonly onSubmitFeedback: (input: {
    readonly kind: FeedbackKind;
    readonly body: string;
    readonly contactEmail: string;
  }) => Promise<ServerAck<PublicFeedbackReceipt>>;
}) {
  const activity = lobby?.activity;
  const openRooms = lobby?.openRooms ?? [];
  const selectedBotSeats = Math.min(botSeats, maxBotSeats);
  const maximumPlayerCount = getMaxPlayersForSetup(deckType, cardsPerPlayer);
  const [activeOverlay, setActiveOverlay] = useState<HubOverlay>(null);
  const [firstVisitStage, setFirstVisitStage] = useState<FirstVisitStage>(null);

  useEffect(() => {
    if (window.sessionStorage.getItem(BEGINNER_WELCOME_SESSION_KEY) !== "seen") {
      setFirstVisitStage("welcome");
    }
  }, []);

  useEffect(() => {
    if (activeOverlay === null && firstVisitStage === null) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (firstVisitStage !== null) {
        finishFirstVisit();
      } else {
        setActiveOverlay(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeOverlay, firstVisitStage]);

  function finishFirstVisit() {
    window.sessionStorage.setItem(BEGINNER_WELCOME_SESSION_KEY, "seen");
    setFirstVisitStage(null);
  }

  function startPracticeGameSetup() {
    finishFirstVisit();
    setActiveOverlay(null);
    onHubModeChange("bots");
  }

  return (
    <main className="min-h-screen px-3 py-4 text-white sm:px-5 sm:py-6 lg:px-8">
      <section className="online-hub mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[92rem] flex-col overflow-hidden rounded-[1.25rem] border border-white/10 shadow-2xl sm:min-h-[calc(100vh-3rem)]">
        <div className="flex flex-1 flex-col p-5 sm:p-7 lg:p-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--aqua)]">
                Deuces Arena
              </p>
              <h1 className="text-3xl font-black sm:text-4xl">Choose a Table</h1>
              <p className="mt-2 text-sm font-semibold text-zinc-400">
                {connectionStatus === "online"
                  ? `${activity?.connectedUsers ?? 0} online · ${activity?.openRooms ?? 0} open rooms · ${activity?.activeRooms ?? 0} active rooms`
                  : connectionStatus === "waking"
                    ? "Connecting to live tables..."
                    : "Live tables are temporarily unavailable"}
              </p>
            </div>
            <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
              <Button
                aria-label="How to play"
                className="h-10 rounded-full px-3"
                size="sm"
                title="How to play"
                variant="secondary"
                onClick={() => setActiveOverlay("learn")}
              >
                <CircleHelp className="size-4" />
                <span className="hidden md:inline">How to Play</span>
              </Button>
              <Button
                aria-label="More"
                className="h-10 w-10 rounded-full px-0"
                size="sm"
                title="Leaderboard, history, and feedback"
                variant="secondary"
                onClick={() => setActiveOverlay("more")}
              >
                <MoreHorizontal className="size-5" />
              </Button>
              <HeaderAccountControl
                authUser={authUser}
                profile={profile}
                profileAvatarKey={profileAvatarKey}
                playerName={playerName}
                onOpenProfile={() => setActiveOverlay("profile")}
              />
            </div>
          </header>

          <div className="mb-5 grid grid-cols-5 gap-1 rounded-full border border-white/10 bg-black/30 p-1.5 sm:gap-2">
            <HubModeButton
              mode="bots"
              activeMode={hubMode}
              icon={<Bot className="size-6" />}
              label="Bots"
              onSelect={onHubModeChange}
            />
            <HubModeButton
              mode="casual"
              activeMode={hubMode}
              icon={<Users className="size-6" />}
              label="Casual"
              onSelect={onHubModeChange}
            />
            <HubModeButton
              mode="ranked"
              activeMode={hubMode}
              icon={<Trophy className="size-6" />}
              label="Ranked"
              onSelect={onHubModeChange}
            />
            <HubModeButton
              mode="tournament"
              activeMode={hubMode}
              icon={<Swords className="size-6" />}
              label="Cups"
              onSelect={onHubModeChange}
            />
            <HubModeButton
              mode="cosmetics"
              activeMode={hubMode}
              icon={<ShoppingBag className="size-6" />}
              label="Shop & Locker"
              onSelect={onHubModeChange}
            />
          </div>

          <motion.div
            key={hubMode}
            className="grid gap-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {hubMode === "bots" ? (
              <HubPlayCard
                icon={<Bot className="size-12" />}
                title="Play vs. Bots"
                meta={`${playerCount} seats · ${selectedBotSeats} bots · ${cardsPerPlayer} cards each`}
                actionLabel="Start Bot Game"
                disabled={!connected}
                onAction={onCreateBotGame}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <CompactRange
                    label="Table seats"
                    value={playerCount}
                    min={2}
                    max={maximumPlayerCount}
                    disabled={!connected}
                    onChange={onPlayerCountChange}
                  />
                  <CompactRange
                    label="Bot seats"
                    value={selectedBotSeats}
                    min={1}
                    max={Math.max(1, maxBotSeats)}
                    disabled={!connected}
                    onChange={onBotSeatsChange}
                  />
                  <CompactDeckControl value={deckType} onChange={onDeckTypeChange} />
                  <CompactRange
                    label="Cards each"
                    value={cardsPerPlayer}
                    min={DEFAULT_CARDS_PER_PLAYER}
                    max={getMaxCardsPerPlayer(deckType, playerCount)}
                    disabled={!connected}
                    onChange={onCardsPerPlayerChange}
                  />
                  <CompactTimerControl
                    enabled={timerEnabled}
                    seconds={timerSeconds}
                    onEnabledChange={onTimerEnabledChange}
                    onSecondsChange={onTimerSecondsChange}
                  />
                  <CompactBotDifficulty value={botDifficulty} onChange={onBotDifficultyChange} />
                  <CompactBotPace value={botPace} onChange={onBotPaceChange} />
                  <CompactRuleToggle
                    label="Bomb ends trick"
                    enabled={bombEndsTrick}
                    onChange={onBombEndsTrickChange}
                  />
                </div>
              </HubPlayCard>
            ) : null}

            {hubMode === "casual" ? (
              <HubPlayCard
                icon={<Users className="size-12" />}
                title="Casual Rooms"
                meta={`${activity?.openRooms ?? 0} open · ${
                  activity?.playersInActiveGames ?? 0
                } humans playing`}
                actionLabel="Create Room"
                disabled={!connected}
                onAction={onCreateRoom}
              >
                <div className="flex gap-2">
                  <input
                    className="h-12 min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-4 text-sm font-bold uppercase outline-none placeholder:text-zinc-500 focus:border-[var(--gold)]"
                    placeholder="Room code"
                    value={joinCode}
                    onChange={(event) => onJoinCodeChange(event.target.value)}
                  />
                  <Button
                    className="h-12 px-5"
                    variant="secondary"
                    disabled={!connected || joinCode.trim() === ""}
                    onClick={onJoinRoom}
                  >
                    Join
                  </Button>
                </div>
                <OpenRoomStrip
                  rooms={openRooms}
                  openRoomCount={activity?.openRooms ?? 0}
                  playingCount={activity?.playersInActiveGames ?? 0}
                  connected={connected}
                  onJoinOpenRoom={onJoinOpenRoom}
                  onCreateRoom={onCreateRoom}
                />
              </HubPlayCard>
            ) : null}

            {hubMode === "ranked" ? (
              <HubRankedCard
                queue={rankedQueue}
                profile={profile}
                connected={connected}
                signedIn={authUser !== null}
                onJoin={onJoinRanked}
                onLeave={onLeaveRanked}
              />
            ) : null}

            {hubMode === "tournament" ? (
              <HubTournamentCard
                queue={tournamentQueue}
                connected={connected}
                signedIn={authUser !== null}
                onJoin={onJoinTournament}
                onLeave={onLeaveTournament}
              />
            ) : null}
            {hubMode === "cosmetics" ? (
              <CosmeticsSummary
                standalone
                cosmetics={cosmetics}
                profile={profile}
                onEquip={onEquipCosmetic}
                onPurchase={onPurchaseCosmetic}
              />
            ) : null}
          </motion.div>

          <p className="mt-auto pt-5 text-sm font-semibold text-zinc-300">{message}</p>
        </div>
        <aside
          aria-label="Indie game spotlight"
          className="flex flex-col items-center gap-2 border-t border-white/10 px-5 py-4"
        >
          <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
            Indie spotlight
          </p>
          <iframe
            className="h-[130px] w-[300px] max-w-full border-0"
            loading="lazy"
            sandbox="allow-scripts allow-popups"
            src="https://ad-swap.web.app/frame.html?site=tuzlxLkDDryFSDt9G6cX&theme=dark"
            title="Ad from another independent site"
          />
        </aside>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 text-xs font-bold text-zinc-500 sm:px-7 lg:px-8">
          <span>Deuces Arena · fair play, no pay-to-win advantages</span>
          <span className="flex gap-4">
            <Link className="transition hover:text-white" href="/privacy">
              Privacy
            </Link>
            <Link className="transition hover:text-white" href="/terms">
              Terms
            </Link>
          </span>
        </footer>
      </section>

      <AnimatePresence>
        {activeOverlay === "learn" ? (
          <HubOverlayDialog title="How to Play" onClose={() => setActiveOverlay(null)}>
            <BeginnerGuide onPractice={startPracticeGameSetup} />
          </HubOverlayDialog>
        ) : null}
        {activeOverlay === "profile" ? (
          <HubOverlayDialog title="Profile & Settings" onClose={() => setActiveOverlay(null)}>
            <MinimalProfileCard
              embedded
              playerName={playerName}
              authUser={authUser}
              profile={profile}
              matchHistory={matchHistory}
              profileDisplayName={profileDisplayName}
              profileAvatarKey={profileAvatarKey}
              onPlayerNameChange={onPlayerNameChange}
              onProfileDisplayNameChange={onProfileDisplayNameChange}
              onProfileAvatarKeyChange={onProfileAvatarKeyChange}
              onProfileSave={onProfileSave}
            />
          </HubOverlayDialog>
        ) : null}
        {activeOverlay === "more" ? (
          <HubOverlayDialog title="Arena Menu" onClose={() => setActiveOverlay(null)}>
            <div className="grid gap-3 md:grid-cols-2">
              <LeaderboardSummary entries={leaderboard} />
              <MatchHistorySummary entries={matchHistory} onLabelReplay={onLabelReplay} />
              <div className="md:col-span-2">
                <FeedbackSummary
                  defaultEmail={authUser?.email ?? ""}
                  onSubmitFeedback={onSubmitFeedback}
                />
              </div>
            </div>
          </HubOverlayDialog>
        ) : null}
        {firstVisitStage !== null ? (
          <FirstVisitExperience
            stage={firstVisitStage}
            onEnter={finishFirstVisit}
            onLearn={() => setFirstVisitStage("guide")}
            onBack={() => setFirstVisitStage("welcome")}
            onPractice={startPracticeGameSetup}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function HubModeButton({
  mode,
  activeMode,
  icon,
  label,
  onSelect
}: {
  readonly mode: OnlineHubMode;
  readonly activeMode: OnlineHubMode;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onSelect: (mode: OnlineHubMode) => void;
}) {
  const active = mode === activeMode;

  return (
    <button
      aria-label={label}
      className={cn(
        "flex min-h-12 items-center justify-center gap-2 rounded-full text-sm font-black transition sm:min-h-14 sm:gap-3 sm:text-base",
        active
          ? "bg-[var(--table)] text-white shadow-lg"
          : "text-zinc-400 hover:bg-white/8 hover:text-white"
      )}
      title={label}
      type="button"
      onClick={() => onSelect(mode)}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function HubOverlayDialog({
  title,
  children,
  onClose
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto px-3 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <button
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-black/72 backdrop-blur-md"
        type="button"
        onClick={onClose}
      />
      <motion.section
        aria-label={title}
        aria-modal="true"
        className="online-hub relative z-10 my-auto w-full max-w-3xl overflow-hidden rounded-[1.1rem] border border-white/12 shadow-2xl"
        role="dialog"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-black sm:text-xl">{title}</h2>
          <Button
            aria-label="Close"
            className="h-9 w-9 rounded-full px-0"
            size="sm"
            title="Close"
            variant="secondary"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="max-h-[min(80vh,50rem)] overflow-y-auto p-5 sm:p-6">{children}</div>
      </motion.section>
    </motion.div>
  );
}

function FirstVisitExperience({
  stage,
  onEnter,
  onLearn,
  onBack,
  onPractice
}: {
  readonly stage: Exclude<FirstVisitStage, null>;
  readonly onEnter: () => void;
  readonly onLearn: () => void;
  readonly onBack: () => void;
  readonly onPractice: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#050708]/92 px-4 py-8 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
    >
      <motion.section
        aria-label={stage === "welcome" ? "Welcome to Deuces Arena" : "Learn Deuces"}
        aria-modal="true"
        className="relative my-auto w-full max-w-3xl overflow-hidden rounded-[1.25rem] border border-white/12 bg-[#0b1113] shadow-[0_40px_120px_rgba(0,0,0,0.65)]"
        role="dialog"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 250, damping: 27 }}
      >
        {stage === "welcome" ? (
          <div className="relative grid min-h-[32rem] place-items-center overflow-hidden px-6 py-12 text-center sm:px-12">
            <div className="beginner-welcome-glow" aria-hidden="true" />
            <div className="relative z-10">
              <motion.div
                className="relative mx-auto size-36 sm:size-44"
                initial={{ opacity: 0, scale: 0.82, rotate: -4 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.12, type: "spring", stiffness: 220, damping: 24 }}
              >
                <Image
                  fill
                  priority
                  alt="Deuces Arena emblem"
                  className="object-contain drop-shadow-[0_18px_38px_rgba(0,0,0,0.55)]"
                  sizes="176px"
                  src="/icon.png"
                />
              </motion.div>
              <p className="mt-5 text-xs font-black uppercase text-[var(--aqua)]">Deuces Arena</p>
              <h1 className="mt-2 text-4xl font-black sm:text-5xl">Take your seat.</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-300 sm:text-base">
                Shed every card before your opponents. The lowest card opens the match; smart timing
                closes it.
              </p>
              <div className="mx-auto mt-8 grid max-w-md gap-3 sm:grid-cols-2">
                <Button className="h-12 text-base" onClick={onEnter}>
                  <Play className="size-4" />
                  Enter Arena
                </Button>
                <Button className="h-12 text-base" variant="secondary" onClick={onLearn}>
                  <BookOpen className="size-4" />
                  Learn the Game
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
              <Button
                aria-label="Back"
                className="h-9 w-9 rounded-full px-0"
                size="sm"
                title="Back"
                variant="secondary"
                onClick={onBack}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <div>
                <p className="text-xs font-black uppercase text-[var(--gold)]">Quick start</p>
                <h2 className="text-xl font-black">Learn Deuces in 60 seconds</h2>
              </div>
            </header>
            <div className="max-h-[80vh] overflow-y-auto p-5 sm:p-6">
              <BeginnerGuide onEnter={onEnter} onPractice={onPractice} />
            </div>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}

function BeginnerGuide({
  onPractice,
  onEnter
}: {
  readonly onPractice: () => void;
  readonly onEnter?: () => void;
}) {
  return (
    <div>
      <section className="beginner-demo-table relative mx-auto h-52 w-full max-w-xl overflow-hidden">
        <motion.div
          className="absolute left-[12%] top-1/2 -translate-y-1/2"
          animate={{ x: [0, 90, 90, 0], opacity: [0.35, 1, 1, 0.35] }}
          transition={{ duration: 4.8, times: [0, 0.18, 0.7, 1], repeat: Infinity }}
        >
          <BeginnerDemoCard rank="3" suit="♦" red />
        </motion.div>
        <motion.div
          className="absolute right-[12%] top-1/2 -translate-y-1/2"
          animate={{ x: [0, 0, -90, -90], opacity: [0.35, 0.35, 1, 0.35] }}
          transition={{ duration: 4.8, times: [0, 0.35, 0.58, 1], repeat: Infinity }}
        >
          <BeginnerDemoCard rank="4" suit="♦" red />
        </motion.div>
        <motion.div
          className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-black uppercase text-zinc-300"
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 4.8, times: [0, 0.12, 0.8, 1], repeat: Infinity }}
        >
          Lead, beat, or pass
        </motion.div>
        <div className="absolute inset-x-0 bottom-5 text-center text-xs font-bold text-zinc-300">
          The next play must use the same hand type and rank higher.
        </div>
      </section>

      <section className="mt-6 overflow-hidden border-y border-white/10 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-white/10">
        <RuleFlowItem
          eyebrow="Center is empty"
          title="Lead any valid hand"
          body="You choose whether this trick uses singles, pairs, trips, quads, a full house, or a straight."
        />
        <RuleFlowItem
          eyebrow="Cards are in the center"
          title="Match it or pass"
          body="Play a higher hand of the same type. A bomb is the only hand that may break the pattern."
        />
        <RuleFlowItem
          eyebrow="Everyone else passes"
          title="Clear and lead again"
          body="The last player to play wins that trick. The center clears and they choose the next type."
        />
      </section>

      <ol className="mt-6 divide-y divide-white/10 border-y border-white/10">
        <BeginnerRuleStep
          number="1"
          title="The match starts with 3♦"
          body="Whoever holds the 3 of diamonds takes the first turn. They may lead a single, pair, straight, or another valid combination, but it must contain 3♦."
        />
        <BeginnerRuleStep
          number="2"
          title="The lead sets the type"
          body="If the leader plays one card, everyone must answer with one higher card. If they play a pair, everyone must answer with a higher pair. The same rule applies to every normal hand type."
        />
        <BeginnerRuleStep
          number="3"
          title="Play higher or pass"
          body="Passing is always allowed, even when you can play. If someone plays a higher hand after you pass, your turn may come around again before the trick ends."
        />
        <BeginnerRuleStep
          number="4"
          title="Win the trick, then the match"
          body="When everyone else passes, the last player who played leads a fresh trick. There is no score for an individual turn: progress is measured by cards left, and the first player to reach zero wins."
        />
      </ol>

      <section className="mt-7">
        <p className="text-xs font-black uppercase text-[var(--gold)]">Every legal combination</p>
        <h3 className="mt-1 text-xl font-black">What you can play</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          You may lead with any hand below. Once led, everyone must use that same row until the
          trick ends, except when a bomb is played.
        </p>
        <div className="mt-4">
          <HandCombinationGuide />
        </div>
      </section>

      <details className="mt-5 border-b border-white/10 pb-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
          Complete turn rules
          <ChevronDown className="size-4 text-zinc-400" />
        </summary>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-zinc-300">
          {DEUCES_RULES.map((rule) => (
            <li key={rule} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--aqua)]" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button className="h-12" onClick={onPractice}>
          <Bot className="size-4" />
          Set Up a Practice Game
        </Button>
        {onEnter === undefined ? null : (
          <Button className="h-12" variant="secondary" onClick={onEnter}>
            Enter Lobby
          </Button>
        )}
      </div>
    </div>
  );
}

function BeginnerDemoCard({
  rank,
  suit,
  red = false
}: {
  readonly rank: string;
  readonly suit: string;
  readonly red?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid h-24 w-16 place-content-center rounded-md border border-white/70 bg-[#f7f7f4] text-center shadow-2xl sm:h-28 sm:w-20",
        red ? "text-red-600" : "text-zinc-950"
      )}
    >
      <span className="text-2xl font-black sm:text-3xl">{rank}</span>
      <span className="text-2xl leading-none sm:text-3xl">{suit}</span>
    </div>
  );
}

function BeginnerRuleStep({
  number,
  title,
  body
}: {
  readonly number: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <li className="grid grid-cols-[2.25rem_1fr] gap-3 py-4">
      <span className="grid size-8 place-items-center rounded-full border border-[var(--gold)]/40 text-sm font-black text-[var(--gold)]">
        {number}
      </span>
      <div>
        <h3 className="font-black">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-400">{body}</p>
      </div>
    </li>
  );
}

function RuleFlowItem({
  eyebrow,
  title,
  body
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <div className="border-b border-white/10 px-4 py-4 last:border-b-0 sm:border-b-0">
      <p className="text-[10px] font-black uppercase text-[var(--aqua)]">{eyebrow}</p>
      <h3 className="mt-1 text-sm font-black text-white">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{body}</p>
    </div>
  );
}

function HandCombinationGuide({ compact = false }: { readonly compact?: boolean }) {
  return (
    <ol className="divide-y divide-white/10 border-y border-white/10">
      {RULE_HAND_EXAMPLES.map((hand) => (
        <li
          key={hand.type}
          className={cn(
            "grid items-center gap-3 py-3",
            compact ? "grid-cols-[6.25rem_1fr]" : "sm:grid-cols-[9rem_9rem_1fr]"
          )}
        >
          <RuleCardFan cards={hand.cards} />
          <div>
            <p className="text-sm font-black text-white">{hand.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-zinc-400">{hand.formation}</p>
            {compact ? (
              <p className="mt-1 text-[11px] leading-4 text-zinc-300">{hand.response}</p>
            ) : null}
          </div>
          {compact ? null : (
            <p className="text-xs leading-5 text-zinc-300 sm:border-l sm:border-white/10 sm:pl-4">
              {hand.response}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function RuleCardFan({ cards }: { readonly cards: readonly RuleExampleCard[] }) {
  return (
    <div
      className="flex min-h-12 items-center pl-1"
      aria-label={cards.map(formatRuleCard).join(", ")}
    >
      {cards.map((card, index) => (
        <span
          key={`${card.rank}-${card.suit}`}
          aria-hidden="true"
          className={cn(
            "relative grid h-11 w-8 shrink-0 place-content-center rounded border border-zinc-300 bg-zinc-50 text-[10px] font-black shadow-md",
            index > 0 ? "-ml-3" : "",
            card.suit === "♦" || card.suit === "♥" ? "text-red-600" : "text-zinc-950"
          )}
          style={{ zIndex: index + 1 }}
        >
          <span>{card.rank}</span>
          <span className="text-xs leading-none">{card.suit}</span>
        </span>
      ))}
    </div>
  );
}

function formatRuleCard(card: RuleExampleCard): string {
  return `${card.rank}${card.suit}`;
}

function HubPlayCard({
  icon,
  title,
  meta,
  actionLabel,
  disabled,
  children,
  onAction
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly meta: string;
  readonly actionLabel: string;
  readonly disabled: boolean;
  readonly children: ReactNode;
  readonly onAction: () => void;
}) {
  return (
    <section className="online-panel p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-5">
        <div className="grid size-20 shrink-0 place-items-center rounded-full border border-white/10 bg-[var(--table)]/80 text-white">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-black">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-400">{meta}</p>
        </div>
      </div>
      {children}
      <Button className="mt-6 h-14 w-full text-lg" disabled={disabled} onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  );
}

function CompactRange({
  label,
  value,
  min,
  max,
  disabled,
  onChange
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-[1.1rem] border border-white/10 bg-black/22 p-4 text-sm font-bold">
      <span className="mb-2 flex justify-between gap-2">
        {label}
        <span>{value}</span>
      </span>
      <input
        className="w-full accent-[var(--gold)]"
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function CompactTimerControl({
  enabled,
  seconds,
  disabled = false,
  onEnabledChange,
  onSecondsChange
}: {
  readonly enabled: boolean;
  readonly seconds: number;
  readonly disabled?: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onSecondsChange: (seconds: number) => void;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-black/22 p-4 text-sm font-bold">
      <label className="flex items-center justify-between gap-3">
        Timer
        <input
          className="size-4 accent-[var(--gold)]"
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
      </label>
      <input
        className="mt-3 w-full accent-[var(--gold)]"
        type="range"
        min="15"
        max="90"
        step="15"
        value={seconds}
        disabled={disabled || !enabled}
        onChange={(event) => onSecondsChange(Number(event.target.value))}
      />
      <p className="mt-2 text-xs leading-5 text-zinc-400">
        {enabled
          ? `${seconds}s countdown shown at the table. Timing out passes when a pass is legal.`
          : "Optional. Enable this to show a turn countdown during the match."}
      </p>
    </div>
  );
}

function CompactBotDifficulty({
  value,
  disabled = false,
  onChange
}: {
  readonly value: PublicBotDifficulty;
  readonly disabled?: boolean;
  readonly onChange: (difficulty: PublicBotDifficulty) => void;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-black/22 p-4 text-sm font-bold">
      <p className="mb-2">Bot difficulty</p>
      <div className="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-black/24 p-1">
        {BOT_DIFFICULTY_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={cn(
              "rounded-full px-2 py-1.5 text-xs font-black transition",
              value === option.value
                ? "bg-[var(--gold)] text-black"
                : "text-zinc-400 hover:bg-white/8 hover:text-white"
            )}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-zinc-400">
        {value === "easy"
          ? "Random legal choices, including optional passes."
          : value === "normal"
            ? "Plays cheaply and saves bombs when passing is safe."
            : "Preserves combinations, spots immediate wins, and compares bounded playouts."}
      </p>
    </div>
  );
}

function CompactBotPace({
  value,
  disabled = false,
  onChange
}: {
  readonly value: PublicBotPace;
  readonly disabled?: boolean;
  readonly onChange: (pace: PublicBotPace) => void;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-black/22 p-4 text-sm font-bold">
      <p className="mb-2">Bot pace</p>
      <div className="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-black/24 p-1">
        {BOT_PACE_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={cn(
              "rounded-full px-2 py-1.5 text-xs font-black transition",
              value === option.value
                ? "bg-[var(--gold)] text-black"
                : "text-zinc-400 hover:bg-white/8 hover:text-white"
            )}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-zinc-400">
        {value === "quick"
          ? "About 2–3 seconds before each bot move."
          : value === "normal"
            ? "About 4–5 seconds before each bot move."
            : "About 6–8 seconds before each bot move."}
      </p>
    </div>
  );
}

function CompactDeckControl({
  value,
  disabled = false,
  onChange
}: {
  readonly value: DeckType;
  readonly disabled?: boolean;
  readonly onChange: (deckType: DeckType) => void;
}) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-black/22 p-4 text-sm font-bold">
      <p className="mb-2">Deck</p>
      <div className="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/24 p-1">
        {[
          { value: "classic" as const, label: "Classic" },
          { value: "arena-six" as const, label: "Arena 6" }
        ].map((option) => (
          <button
            key={option.value}
            className={cn(
              "rounded-full px-2 py-1.5 text-xs font-black transition",
              value === option.value
                ? "bg-[var(--gold)] text-black"
                : "text-zinc-400 hover:bg-white/8 hover:text-white"
            )}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-zinc-400">
        {value === "arena-six"
          ? "78 cards: Stars rank above spades; Crowns are highest."
          : "52 cards: diamonds, clubs, hearts, then spades."}
      </p>
    </div>
  );
}

function CompactRuleToggle({
  label,
  description = "A bomb immediately wins the trick.",
  enabled,
  disabled = false,
  onChange
}: {
  readonly label: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly disabled?: boolean;
  readonly onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex min-h-20 items-center justify-between gap-3 rounded-[1.1rem] border border-white/10 bg-black/22 p-4 text-sm font-bold">
      <span>
        {label}
        <span className="mt-1 block text-xs font-semibold text-zinc-400">{description}</span>
      </span>
      <input
        className="size-4 shrink-0 accent-[var(--gold)]"
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function OpenRoomStrip({
  rooms,
  openRoomCount,
  playingCount,
  connected,
  onJoinOpenRoom,
  onCreateRoom
}: {
  readonly rooms: readonly PublicOpenRoom[];
  readonly openRoomCount: number;
  readonly playingCount: number;
  readonly connected: boolean;
  readonly onJoinOpenRoom: (room: PublicOpenRoom) => void;
  readonly onCreateRoom: () => void;
}) {
  if (rooms.length === 0) {
    return (
      <div className="mt-5">
        <button
          className="room-table-preview group w-full px-5 py-8 text-center"
          type="button"
          disabled={!connected}
          onClick={onCreateRoom}
        >
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-black/30 text-[var(--gold)]">
            <Play className="size-6" />
          </span>
          <span className="block text-xl font-black">Open a Table</span>
          <span className="mt-1 block text-sm text-zinc-300">
            No public casual rooms yet. Create one and share the code.
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-zinc-400">
        <span>{openRoomCount} open tables</span>
        <span>{playingCount} players in games</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rooms.slice(0, 3).map((room) => (
          <button
            key={room.roomCode}
            className="room-table-preview group min-h-44 px-5 py-5 text-left transition disabled:opacity-60"
            type="button"
            disabled={!connected}
            onClick={() => onJoinOpenRoom(room)}
          >
            <span className="flex h-full flex-col justify-between">
              <span>
                <span className="block text-lg font-black">{room.hostName}'s table</span>
                <span className="mt-1 block text-sm text-zinc-300">
                  {room.seatedPlayers}/{room.maxPlayers} seated · {room.roomCode}
                </span>
                <span className="mt-3 block w-fit rounded-full border border-white/10 bg-black/24 px-3 py-1 text-xs font-bold text-zinc-200">
                  {room.rules.bombEndsTrick ? "Bombs end tricks" : "Bombs can be answered"}
                </span>
              </span>
              <span className="mt-8 flex items-center justify-between gap-3">
                <span className="rounded-full bg-black/24 px-3 py-1 text-xs font-bold text-zinc-200">
                  {room.readyPlayers}/{room.seatedPlayers} ready
                </span>
                <span className="grid size-10 place-items-center rounded-full bg-[var(--gold)] text-black transition group-hover:scale-105">
                  <DoorOpen className="size-5 shrink-0" />
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HubRankedCard({
  queue,
  profile,
  connected,
  signedIn,
  onJoin,
  onLeave
}: {
  readonly queue: PublicRankedQueueState | null;
  readonly profile: PublicGuestProfile | null;
  readonly connected: boolean;
  readonly signedIn: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
}) {
  const joined = queue?.joined ?? false;
  const queuedPlayers = queue?.queuedPlayers ?? 0;
  const requiredPlayers = queue?.requiredPlayers ?? 4;
  const queuePosition =
    queue?.queuePosition === null || queue === null ? "Not queued" : `#${queue.queuePosition}`;
  const etaLabel =
    queue?.etaSeconds === null || queue === null
      ? "ETA pending"
      : queue.etaSeconds === 0
        ? "Matching now"
        : `~${queue.etaSeconds}s ETA`;
  const rating = profile?.rating ?? 1000;
  const rankProgress = getRankProgress(rating);

  return (
    <section className="online-panel p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-5">
        <div className="grid size-20 shrink-0 place-items-center rounded-full border border-white/10 bg-[var(--table)]/80">
          <Trophy className="size-12" />
        </div>
        <div>
          <h2 className="text-2xl font-black">Ranked Match</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-400">
            4 humans · no bots · {DEFAULT_RANKED_TIMER_SECONDS}s timer
          </p>
        </div>
      </div>
      <div className="mb-5 rounded-[1rem] border border-white/10 bg-black/24 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-zinc-500">Current rank</p>
            <p className="mt-0.5 text-xl font-black">{rankProgress.tier.name}</p>
          </div>
          <span className="rounded-full border border-[var(--gold)]/35 bg-[var(--gold)]/12 px-3 py-1 text-sm font-black text-[var(--gold)]">
            {rating} rating
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-500"
            style={{ width: `${Math.round(rankProgress.progress * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-zinc-400">
          {rankProgress.nextTier === null
            ? "Highest division reached."
            : `${rankProgress.ratingNeededForNextTier} rating to ${rankProgress.nextTier.name}`}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProfileMetric label="Queued" value={`${queuedPlayers}/${requiredPlayers}`} />
        <ProfileMetric label="Position" value={queuePosition} />
        <ProfileMetric label="ETA" value={etaLabel} />
        <ProfileMetric label="Your ELO" value={profile?.rating ?? 1000} />
      </div>
      <p className="mt-4 text-xs font-semibold leading-5 text-zinc-400">
        Ranked adds +60 / +35 / +20 / +10 bonus coins by placement. Gold, Platinum, Diamond, and
        Arena Master each unlock an exclusive profile border.
      </p>
      <Button
        className="mt-6 h-14 w-full text-lg"
        disabled={!connected || (!joined && !signedIn)}
        variant={joined ? "secondary" : "primary"}
        onClick={joined ? onLeave : onJoin}
      >
        {joined ? "Leave Queue" : signedIn ? "Find Ranked Match" : "Sign in to play ranked"}
      </Button>
    </section>
  );
}

function HubTournamentCard({
  queue,
  connected,
  signedIn,
  onJoin,
  onLeave
}: {
  readonly queue: PublicTournamentQueueState | null;
  readonly connected: boolean;
  readonly signedIn: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
}) {
  const tournament = queue?.tournament ?? null;
  const joined = queue?.joined ?? false;
  const activeTournament = tournament !== null && tournament.status !== "complete";
  const eta =
    queue?.etaSeconds === null || queue === null ? "ETA pending" : `~${queue.etaSeconds}s`;

  return (
    <section className="online-panel p-5 sm:p-7">
      <div className="relative h-40 overflow-hidden rounded-lg border border-white/10">
        <Image
          fill
          priority
          alt="Original Deuces Arena tournament table with two semifinal brackets"
          className="object-cover"
          sizes="(max-width: 1024px) 94vw, 850px"
          src="/art/arena-cup-table.jpg"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.82),rgba(0,0,0,0.2),rgba(0,0,0,0.5))]" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--gold)]/40 bg-black/55 text-[var(--gold)] backdrop-blur">
            <Swords className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black">Arena Cup</h2>
            <p className="text-sm font-semibold text-zinc-200">
              8 humans · two semifinals · top 2 advance
            </p>
          </div>
        </div>
      </div>

      {tournament === null ? (
        <div className="mt-6 grid grid-cols-3 gap-2">
          <ProfileMetric
            label="Queued"
            value={`${queue?.queuedPlayers ?? 0}/${queue?.requiredPlayers ?? 8}`}
          />
          <ProfileMetric
            label="Position"
            value={
              queue?.queuePosition === null || queue === null ? "-" : `#${queue.queuePosition}`
            }
          />
          <ProfileMetric label="ETA" value={eta} />
        </div>
      ) : (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase text-[var(--aqua)]">
              {tournament.status === "complete" ? "Final standings" : tournament.status}
            </p>
            <span className="font-mono text-xs text-zinc-500">{tournament.id.slice(-6)}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {tournament.matches.map((match) => (
              <div
                key={match.stage}
                className="rounded-[0.9rem] border border-white/10 bg-black/24 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black capitalize">{match.stage.replace("-", " ")}</p>
                  <span className="text-[10px] font-black uppercase text-zinc-500">
                    {match.status}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-zinc-400">
                  {match.playerNames.length === 0
                    ? "Waiting for qualifiers"
                    : match.playerNames.join(" · ")}
                </p>
                {match.advancingPlayerNames.length > 0 ? (
                  <p className="mt-2 text-[11px] font-bold text-emerald-200">
                    Advance: {match.advancingPlayerNames.join(" · ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {tournament.championName !== null ? (
            <p className="mt-3 text-center text-lg font-black text-[var(--gold)]">
              Champion: {tournament.championName}
            </p>
          ) : null}
        </div>
      )}

      <p className="mt-5 text-xs font-semibold leading-5 text-zinc-400">
        Final rewards: champion +500 coins and Bracket Champion border, runner-up +250, other
        finalists +100. Tournament matches do not change ranked rating.
      </p>
      <Button
        className="mt-5 h-14 w-full text-lg"
        disabled={!connected || activeTournament || (!joined && !signedIn)}
        variant={joined ? "secondary" : "primary"}
        onClick={joined ? onLeave : onJoin}
      >
        {activeTournament
          ? "Tournament in progress"
          : joined
            ? "Leave Queue"
            : signedIn
              ? "Enter Arena Cup"
              : "Sign in to enter"}
      </Button>
    </section>
  );
}

function HeaderAccountControl({
  authUser,
  profile,
  profileAvatarKey,
  playerName,
  onOpenProfile
}: {
  readonly authUser: AuthUser | null;
  readonly profile: PublicGuestProfile | null;
  readonly profileAvatarKey: ProfileAvatarKey;
  readonly playerName: string;
  readonly onOpenProfile: () => void;
}) {
  const displayName = profile?.displayName ?? authUser?.name ?? playerName;

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 p-1.5 shadow-lg backdrop-blur">
      <button
        aria-label="Open profile and settings"
        className="flex items-center gap-1 rounded-full transition hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        title="Profile and settings"
        type="button"
        onClick={onOpenProfile}
      >
        <AccountAvatar
          imageUrl={authUser?.image ?? null}
          fallback={authUser === null ? getAvatarSymbol(profileAvatarKey) : getInitial(displayName)}
        />
        <ChevronDown className="mr-1 size-3.5 text-zinc-400" />
      </button>
      {authUser === null ? (
        <SignInWithGoogleButton
          compactOnMobile
          className="h-9 rounded-full px-3 text-xs sm:text-sm"
        />
      ) : null}
    </div>
  );
}

function AccountAvatar({
  imageUrl,
  fallback
}: {
  readonly imageUrl: string | null;
  readonly fallback: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 bg-cover bg-center text-sm font-black text-white"
      style={imageUrl === null ? undefined : { backgroundImage: `url(${imageUrl})` }}
    >
      {imageUrl === null ? fallback : null}
    </div>
  );
}

function getInitial(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "P";
}

function MinimalProfileCard({
  embedded = false,
  playerName,
  authUser,
  profile,
  matchHistory,
  profileDisplayName,
  profileAvatarKey,
  onPlayerNameChange,
  onProfileDisplayNameChange,
  onProfileAvatarKeyChange,
  onProfileSave
}: {
  readonly embedded?: boolean;
  readonly playerName: string;
  readonly authUser: AuthUser | null;
  readonly profile: PublicGuestProfile | null;
  readonly matchHistory: readonly PublicMatchHistoryItem[];
  readonly profileDisplayName: string;
  readonly profileAvatarKey: ProfileAvatarKey;
  readonly onPlayerNameChange: (value: string) => void;
  readonly onProfileDisplayNameChange: (value: string) => void;
  readonly onProfileAvatarKeyChange: (value: ProfileAvatarKey) => void;
  readonly onProfileSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const accountName = authUser?.name ?? authUser?.email ?? null;

  return (
    <section className={cn(embedded ? "px-1 pb-1" : "online-panel p-5")}>
      <div className="flex items-center gap-3">
        <AccountAvatar
          imageUrl={profile?.imageUrl ?? authUser?.image ?? null}
          fallback={getAvatarSymbol(profile?.avatarKey ?? profileAvatarKey)}
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-lg font-black">{profile?.displayName ?? playerName}</p>
            {profile?.isAdmin === true ? (
              <span className="shrink-0 rounded-full bg-[var(--gold)]/18 px-2 py-0.5 text-[10px] font-black uppercase text-[var(--gold)]">
                Creator
              </span>
            ) : null}
          </div>
          <p className="text-sm text-zinc-400">
            {profile?.rating ?? 1000} rating ·{" "}
            {profile?.isAdmin === true ? "∞" : (profile?.arenaCoins ?? 0)} coins
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-[1rem] border border-white/10 bg-black/20 p-3">
        {authUser === null ? (
          <>
            <p className="text-xs font-bold uppercase text-zinc-500">Guest mode</p>
            <p className="mt-1 text-sm text-zinc-300">
              Sign in from the top-right profile control.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase text-emerald-300">Signed in</p>
            <p className="mt-1 truncate text-sm font-bold text-zinc-200">{accountName}</p>
          </>
        )}
      </div>
      <label className="mt-4 block text-sm font-black">
        Name
        <input
          className="mt-2 h-11 w-full rounded-full border border-white/10 bg-black/24 px-3 text-sm outline-none focus:border-[var(--gold)]"
          value={playerName}
          onChange={(event) => onPlayerNameChange(event.target.value)}
        />
      </label>
      <details className="mt-3">
        <summary className="cursor-pointer list-none text-sm font-black text-zinc-300">
          Edit profile
        </summary>
        <form className="mt-3 grid gap-2" onSubmit={onProfileSave}>
          <input
            className="h-10 rounded-full border border-white/10 bg-black/24 px-3 text-sm outline-none focus:border-[var(--gold)]"
            value={profileDisplayName}
            maxLength={18}
            onChange={(event) => onProfileDisplayNameChange(event.target.value)}
          />
          <div className="grid grid-cols-4 gap-1">
            {AVATAR_OPTIONS.map((option) => (
              <button
                key={option.key}
                className={cn(
                  "grid h-9 place-items-center rounded-full border text-sm transition",
                  profileAvatarKey === option.key
                    ? "border-[var(--gold)] bg-[var(--gold)]/15"
                    : "border-white/10 bg-black/18"
                )}
                type="button"
                title={option.label}
                onClick={() => onProfileAvatarKeyChange(option.key)}
              >
                {getAvatarSymbol(option.key)}
              </button>
            ))}
          </div>
          <Button size="sm" type="submit">
            Save
          </Button>
        </form>
      </details>
      <ProfileDetails profile={profile} matchHistory={matchHistory} />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {authUser === null ? (
          <SignInWithGoogleButton className="h-10 sm:col-span-2" />
        ) : (
          <>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md border border-white/12 bg-white/8 px-3 text-sm font-semibold text-white transition hover:bg-white/14"
              href="/profile"
            >
              Open full profile
            </Link>
            <SignOutButton className="h-10" />
          </>
        )}
      </div>
    </section>
  );
}

function ProfileDetails({
  profile,
  matchHistory
}: {
  readonly profile: PublicGuestProfile | null;
  readonly matchHistory: readonly PublicMatchHistoryItem[];
}) {
  const gamesPlayed = profile?.gamesPlayed ?? 0;
  const wins = profile?.wins ?? 0;
  const winRate = gamesPlayed === 0 ? null : Math.round((wins / gamesPlayed) * 100);
  const recentMatch = matchHistory[0] ?? null;
  const unlockedCount = profile?.unlocks.length ?? 0;
  const equippedCount = profile?.equippedCosmetics.length ?? 0;

  return (
    <section className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2 text-sm font-black text-zinc-200">
        Career stats
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-[10px] font-black uppercase text-zinc-400">
          {gamesPlayed} games
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ProfileMetric label="Wins" value={wins} />
        <ProfileMetric label="Win rate" value={winRate === null ? "-" : `${winRate}%`} />
        <ProfileMetric
          label="Avg place"
          value={
            profile?.averagePlacement === null || profile === null
              ? "-"
              : profile.averagePlacement.toFixed(2)
          }
        />
        <ProfileMetric label="Unlocked" value={unlockedCount} />
      </div>

      <div className="mt-3 rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black">Loadout</p>
          <span className="rounded-full bg-black/24 px-2 py-1 text-[10px] font-black uppercase text-zinc-300">
            {equippedCount} equipped
          </span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">
          Card backs, tables, avatars, and borders are cosmetic only.
        </p>
      </div>

      <div className="mt-2 rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black">Latest match</p>
          <span className="text-[11px] font-bold text-zinc-400">
            {recentMatch?.roomCode ?? "none yet"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-400">
          {recentMatch === null
            ? "Completed online games will summarize here."
            : `${recentMatch.placement === null ? "Unplaced" : ordinal(recentMatch.placement)} · ${formatRatingDelta(recentMatch.ratingDelta)} · ${recentMatch.movesPlayed ?? 0} moves`}
        </p>
      </div>
    </section>
  );
}

function ActiveRoomBar({
  room,
  connectionStatus,
  turnStatus,
  message,
  activePanel,
  unreadChatCount,
  onTogglePanel,
  onCopyRoomCode,
  onCopyInvite,
  onLeaveRoom
}: {
  readonly room: PublicRoomState | null;
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly turnStatus: string;
  readonly message: string;
  readonly activePanel: ActiveTablePanel | null;
  readonly unreadChatCount: number;
  readonly onTogglePanel: (panel: ActiveTablePanel) => void;
  readonly onCopyRoomCode: () => void;
  readonly onCopyInvite: () => void;
  readonly onLeaveRoom: () => void;
}) {
  return (
    <header className="hud-glass flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-[1.25rem] border border-white/10 px-3 py-2 backdrop-blur sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "size-3 shrink-0 rounded-full",
            connectionStatus === "online"
              ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.45)]"
              : connectionStatus === "waking"
                ? "bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.35)]"
                : "bg-red-300"
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {room === null ? "Realtime Table" : `${formatMatchMode(room.mode)} Table`}
          </p>
          <p className="truncate text-sm font-semibold text-zinc-300">
            {room === null ? message : turnStatus}
          </p>
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
        {room !== null ? (
          <button
            className="rounded-full border border-white/10 bg-white/7 px-3 py-2 font-mono text-xs font-black text-[var(--gold)] transition hover:border-[var(--gold)]"
            type="button"
            onClick={onCopyRoomCode}
          >
            {room.roomCode}
          </button>
        ) : null}
        <TablePanelButton
          panel="chat"
          activePanel={activePanel}
          icon={<MessageCircle className="size-4" />}
          label="Chat"
          badgeCount={unreadChatCount}
          onToggle={onTogglePanel}
        />
        <TablePanelButton
          panel="rules"
          activePanel={activePanel}
          icon={<BookOpen className="size-4" />}
          label="Rules"
          onToggle={onTogglePanel}
        />
        <Button size="sm" variant="secondary" onClick={onCopyInvite} disabled={room === null}>
          <Copy className="size-4" />
          Invite
        </Button>
        <Button size="sm" variant="secondary" onClick={onLeaveRoom} disabled={room === null}>
          <DoorOpen className="size-4" />
          Leave
        </Button>
      </div>
    </header>
  );
}

function TablePanelButton({
  panel,
  activePanel,
  icon,
  label,
  badgeCount = 0,
  onToggle
}: {
  readonly panel: ActiveTablePanel;
  readonly activePanel: ActiveTablePanel | null;
  readonly icon: ReactNode;
  readonly label: string;
  readonly badgeCount?: number;
  readonly onToggle: (panel: ActiveTablePanel) => void;
}) {
  const active = panel === activePanel;

  return (
    <Button size="sm" variant={active ? "primary" : "secondary"} onClick={() => onToggle(panel)}>
      {icon}
      {label}
      {badgeCount > 0 ? (
        <span
          className={cn(
            "grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-black",
            active ? "bg-black/20 text-black" : "bg-[var(--gold)] text-black"
          )}
        >
          {Math.min(9, badgeCount)}
        </span>
      ) : null}
    </Button>
  );
}

function OnlineWaitingRoom({
  room,
  connected,
  connectionStatus,
  message,
  botSeats,
  maxBotSeats,
  deckType,
  playerCount,
  cardsPerPlayer,
  timerEnabled,
  timerSeconds,
  bombEndsTrick,
  tradingEnabled,
  botDifficulty,
  botPace,
  roomCanStart,
  isHost,
  yourReady,
  onCopyRoomCode,
  onCopyInvite,
  onReady,
  onStart,
  onLeave,
  onBotSeatsChange,
  onDeckTypeChange,
  onPlayerCountChange,
  onCardsPerPlayerChange,
  onTimerEnabledChange,
  onTimerSecondsChange,
  onBombEndsTrickChange,
  onTradingEnabledChange,
  onBotDifficultyChange,
  onBotPaceChange
}: {
  readonly room: PublicRoomState;
  readonly connected: boolean;
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly message: string;
  readonly botSeats: number;
  readonly maxBotSeats: number;
  readonly deckType: DeckType;
  readonly playerCount: number;
  readonly cardsPerPlayer: number;
  readonly timerEnabled: boolean;
  readonly timerSeconds: number;
  readonly bombEndsTrick: boolean;
  readonly tradingEnabled: boolean;
  readonly botDifficulty: PublicBotDifficulty;
  readonly botPace: PublicBotPace;
  readonly roomCanStart: boolean;
  readonly isHost: boolean;
  readonly yourReady: boolean;
  readonly onCopyRoomCode: () => void;
  readonly onCopyInvite: () => void;
  readonly onReady: () => void;
  readonly onStart: () => void;
  readonly onLeave: () => void;
  readonly onBotSeatsChange: (count: number) => void;
  readonly onDeckTypeChange: (deckType: DeckType) => void;
  readonly onPlayerCountChange: (count: number) => void;
  readonly onCardsPerPlayerChange: (count: number) => void;
  readonly onTimerEnabledChange: (enabled: boolean) => void;
  readonly onTimerSecondsChange: (seconds: number) => void;
  readonly onBombEndsTrickChange: (enabled: boolean) => void;
  readonly onTradingEnabledChange: (enabled: boolean) => void;
  readonly onBotDifficultyChange: (difficulty: PublicBotDifficulty) => void;
  readonly onBotPaceChange: (pace: PublicBotPace) => void;
}) {
  const seatedHumans = room.players.filter((player) => player.kind === "human").length;
  const seatsNeeded = Math.max(0, playerCount - room.players.length - botSeats);
  const inviteUrl = getRoomInviteUrl(room.roomCode);
  const maximumPlayerCount = getMaxPlayersForSetup(deckType, cardsPerPlayer);
  const yourPlayer =
    room.players.find((player) => player.id === room.yourPlayerId) ?? room.players[0];
  const tableTheme =
    yourPlayer === undefined ? null : getEquippedCosmetic(yourPlayer, "TABLE_THEME");

  return (
    <main className="min-h-screen px-3 py-8 text-white sm:px-5 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[92rem] gap-5 lg:h-[calc(100vh-4rem)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          className={cn(
            "table-felt table-oval relative grid min-h-[38rem] place-items-center overflow-hidden px-5 py-10 text-center lg:min-h-0",
            getTableThemeClass(tableTheme)
          )}
        >
          <div className="absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/35 p-1 backdrop-blur">
            <span className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase text-zinc-300">
              <CircleDot className="size-3 text-[var(--aqua)]" />
              Casual table
            </span>
            <button
              className="rounded-full bg-white/8 px-3 py-1 font-mono text-xs font-black tracking-wider text-[var(--gold)] transition hover:bg-white/12"
              type="button"
              onClick={onCopyRoomCode}
            >
              {room.roomCode}
            </button>
          </div>

          <WaitingSeats
            players={room.players}
            botSeats={botSeats}
            playerCount={playerCount}
            cardsPerPlayer={cardsPerPlayer}
            yourPlayerId={room.yourPlayerId}
          />

          <div className="relative z-10 hidden w-[min(28rem,70%)] rounded-[1.25rem] border border-white/12 bg-black/55 px-5 py-5 text-white shadow-2xl backdrop-blur-md sm:block">
            <p className="text-2xl font-black text-white">Waiting for players</p>
            <p className="mt-1 text-sm font-bold text-zinc-300">
              {seatedHumans} human{seatedHumans === 1 ? "" : "s"} seated ·{" "}
              {botSeats > 0
                ? `${botSeats} bot${botSeats === 1 ? "" : "s"} selected`
                : `${seatsNeeded} seats open`}
            </p>
            <button
              className="mt-4 flex w-full items-center justify-between gap-3 rounded-full border border-white/12 bg-white/8 py-2 pl-4 pr-2 text-left font-mono text-sm font-black text-zinc-100 transition hover:border-[var(--gold)]"
              type="button"
              onClick={onCopyInvite}
            >
              <span className="truncate">{inviteUrl}</span>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--gold)] text-black">
                <Copy className="size-4" />
              </span>
            </button>
            <p className="mt-3 text-xs font-semibold text-zinc-300">{message}</p>
          </div>

          <div className="relative z-10 grid w-32 justify-items-center gap-2 rounded-2xl border border-white/12 bg-black/55 px-3 py-4 shadow-2xl backdrop-blur-md sm:hidden">
            <p className="text-lg font-black leading-tight">Waiting</p>
            <p className="text-[11px] font-semibold text-zinc-300">
              {seatedHumans} human · {botSeats} bots
            </p>
            <Button className="h-9 px-3" size="sm" onClick={onCopyInvite}>
              <Copy className="size-3.5" />
              Invite
            </Button>
          </div>
        </section>

        <aside className="online-panel grid content-start gap-3 p-4 lg:max-h-full lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[var(--aqua)]">Room Setup</p>
              <h1 className="text-xl font-black">Casual Table</h1>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-xs font-black",
                getConnectionBadgeClass(connectionStatus)
              )}
            >
              {getConnectionLabel(connectionStatus)}
            </span>
          </div>

          <CompactRange
            label="Table seats"
            value={playerCount}
            min={Math.max(2, room.players.length)}
            max={maximumPlayerCount}
            disabled={!connected || !isHost}
            onChange={onPlayerCountChange}
          />
          <CompactDeckControl disabled={!isHost} value={deckType} onChange={onDeckTypeChange} />
          <CompactRange
            label="Cards each"
            value={cardsPerPlayer}
            min={DEFAULT_CARDS_PER_PLAYER}
            max={getMaxCardsPerPlayer(deckType, playerCount)}
            disabled={!connected || !isHost}
            onChange={onCardsPerPlayerChange}
          />

          <div className="grid grid-cols-2 gap-2 text-center">
            <ProfileMetric label="Seats" value={`${room.players.length}/${playerCount}`} />
            <ProfileMetric
              label="Ready"
              value={room.players.filter((player) => player.ready).length}
            />
          </div>

          <CompactRange
            label="Bot seats"
            value={botSeats}
            min={0}
            max={maxBotSeats}
            disabled={!connected || !isHost}
            onChange={onBotSeatsChange}
          />
          <CompactTimerControl
            enabled={timerEnabled}
            seconds={timerSeconds}
            disabled={!isHost}
            onEnabledChange={onTimerEnabledChange}
            onSecondsChange={onTimerSecondsChange}
          />
          <CompactBotDifficulty
            disabled={!isHost}
            value={botDifficulty}
            onChange={onBotDifficultyChange}
          />
          <CompactBotPace disabled={!isHost} value={botPace} onChange={onBotPaceChange} />
          <CompactRuleToggle
            label="Bomb ends trick"
            description="A bomb immediately wins the trick."
            enabled={bombEndsTrick}
            disabled={!isHost}
            onChange={onBombEndsTrickChange}
          />
          <CompactRuleToggle
            label="Card trade window"
            description="20 seconds · humans only · one trade each."
            enabled={tradingEnabled}
            disabled={!isHost}
            onChange={onTradingEnabledChange}
          />

          <Button className="h-12" variant={yourReady ? "secondary" : "primary"} onClick={onReady}>
            <CheckCircle2 className="size-4" />
            {yourReady ? "Ready" : "Mark Ready"}
          </Button>
          {isHost ? (
            <Button className="h-12" disabled={!roomCanStart} onClick={onStart}>
              <Play className="size-4" />
              {botSeats > 0
                ? `Start With ${botSeats} Bot${botSeats === 1 ? "" : "s"}`
                : "Start Game"}
            </Button>
          ) : (
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-center text-xs font-bold text-zinc-300">
              Waiting for the host to start the table.
            </p>
          )}
          <Button className="h-12" variant="secondary" onClick={onLeave}>
            <LogOut className="size-4" />
            Leave Table
          </Button>
        </aside>
      </section>
    </main>
  );
}

function WaitingSeats({
  players,
  botSeats,
  playerCount,
  cardsPerPlayer,
  yourPlayerId
}: {
  readonly players: readonly PublicRoomPlayer[];
  readonly botSeats: number;
  readonly playerCount: number;
  readonly cardsPerPlayer: number;
  readonly yourPlayerId: string | null;
}) {
  const anchoredPlayers = getClockwiseSeatedPlayers(players, yourPlayerId);
  const visibleSeats = [
    ...anchoredPlayers.map((player) => ({
      id: player.id,
      label: player.name,
      detail: player.ready ? "ready" : player.id === yourPlayerId ? "you" : "waiting",
      kind: player.kind as "human" | "bot" | "open",
      player
    })),
    ...Array.from({ length: botSeats }).map((_, index) => ({
      id: `bot-preview-${index}`,
      label: `Bot ${index + 1}`,
      detail: "queued",
      kind: "bot" as const,
      player: null
    })),
    ...Array.from({
      length: Math.max(0, playerCount - anchoredPlayers.length - botSeats)
    }).map((_, index) => ({
      id: `open-preview-${index}`,
      label: "Open seat",
      detail: "invite a player",
      kind: "open" as const,
      player: null
    }))
  ].slice(0, playerCount);

  return (
    <>
      {visibleSeats.map((seat, index) => {
        const isYourSeat = seat.player?.id === yourPlayerId;
        const handOrientation =
          isYourSeat && index === 0 ? "top" : getSeatHandOrientation(index, visibleSeats.length);
        const cardBack =
          seat.player === null ? null : getEquippedCosmetic(seat.player, "CARD_BACK");
        const profileBorder =
          seat.player === null ? null : getEquippedCosmetic(seat.player, "PROFILE_BORDER");
        const avatarCosmetic =
          seat.player === null ? null : getEquippedCosmetic(seat.player, "AVATAR");
        const avatarImage = getAvatarCosmeticImage(avatarCosmetic);

        return (
          <div
            key={seat.id}
            className={cn(
              "absolute z-20 flex gap-1 sm:gap-2",
              isYourSeat
                ? "flex-col-reverse items-center"
                : handOrientation === "top"
                  ? "flex-col items-center"
                  : handOrientation === "left"
                    ? "flex-row items-center"
                    : "flex-row-reverse items-center",
              getSeatPositionClass(index, visibleSeats.length)
            )}
          >
            <div
              className={cn(
                "seat-panel relative flex items-center gap-2 border px-2 py-2 text-left sm:w-36 sm:px-2.5",
                isYourSeat ? "w-32" : "w-24",
                seat.kind === "open"
                  ? "border-dashed border-white/20 opacity-75"
                  : profileBorder === null
                    ? "border-white/12"
                    : getProfileBorderClass(profileBorder)
              )}
            >
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border text-xs font-black sm:size-9",
                  avatarCosmetic === null
                    ? "border-white/15 bg-black/30"
                    : getAvatarCosmeticClass(avatarCosmetic)
                )}
              >
                {avatarImage !== null ? (
                  <span
                    className="size-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${avatarImage})` }}
                  />
                ) : seat.player?.imageUrl !== null && seat.player?.imageUrl !== undefined ? (
                  <span
                    className="size-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${seat.player.imageUrl})` }}
                  />
                ) : seat.kind === "bot" ? (
                  <Bot className="size-4 text-[var(--aqua)]" />
                ) : seat.kind === "open" ? (
                  <Users className="size-4 text-zinc-400" />
                ) : avatarCosmetic === null ? (
                  seat.label.slice(0, 1).toUpperCase()
                ) : (
                  getAvatarCosmeticSymbol(avatarCosmetic)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{seat.label}</p>
                <p className="text-xs text-zinc-300">{seat.detail}</p>
              </div>
              {seat.kind !== "open" && handOrientation !== "top" ? (
                <span
                  className={cn(
                    "card-back absolute -top-5 left-1/2 h-7 w-5 -translate-x-1/2 rounded border border-white/25 shadow-lg sm:hidden",
                    getCardBackClass(cardBack)
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            {seat.kind === "open" ? null : (
              <div className={cn(handOrientation !== "top" && "hidden sm:block")}>
                <OnlineOpponentHand
                  count={cardsPerPlayer}
                  cardBack={cardBack}
                  orientation={handOrientation}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function saveRoomSession(room: PublicRoomState, guestId: string): void {
  if (room.yourPlayerId === null) {
    return;
  }

  window.localStorage.setItem(
    ROOM_SESSION_KEY,
    JSON.stringify({
      roomCode: room.roomCode,
      playerId: room.yourPlayerId,
      guestId
    })
  );
}

function removeRoomSession(): void {
  window.localStorage.removeItem(ROOM_SESSION_KEY);
}

function loadRoomSession(
  activeProfileId: string
): { readonly roomCode: string; readonly playerId: string; readonly guestId: string } | null {
  const rawSession = window.localStorage.getItem(ROOM_SESSION_KEY);

  if (rawSession === null) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as {
      roomCode?: unknown;
      playerId?: unknown;
      guestId?: unknown;
    };

    if (
      typeof parsedSession.roomCode === "string" &&
      typeof parsedSession.playerId === "string" &&
      parsedSession.guestId === activeProfileId
    ) {
      return {
        roomCode: parsedSession.roomCode,
        playerId: parsedSession.playerId,
        guestId: activeProfileId
      };
    }
  } catch {
    window.localStorage.removeItem(ROOM_SESSION_KEY);
  }

  return null;
}

function getRoomCodeFromUrl(): string | null {
  const roomCode = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase();
  return roomCode === undefined || roomCode === "" ? null : roomCode;
}

function getRoomInviteUrl(roomCode: string): string {
  return createRoomInviteUrl(window.location.origin, roomCode);
}

function syncRoomCodeToUrl(roomCode: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  window.history.replaceState(null, "", url.toString());
}

function clearRoomCodeFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState(null, "", url.toString());
}

function getOrCreateGuestId(): string {
  const existingGuestId = window.localStorage.getItem(GUEST_ID_KEY);

  if (existingGuestId !== null && existingGuestId.trim() !== "") {
    return existingGuestId;
  }

  const guestId = `guest-${crypto.randomUUID()}`;
  window.localStorage.setItem(GUEST_ID_KEY, guestId);
  return guestId;
}

function refreshProfile(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  profileId: string,
  setProfile: (profile: PublicGuestProfile) => void
): void {
  socket.emit("profile:get", { guestId: profileId }, (ack) => {
    if (ack.ok) {
      setProfile(ack.data);
    }
  });
}

function refreshLeaderboard(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  setLeaderboard: (entries: readonly PublicLeaderboardEntry[]) => void
): void {
  socket.emit("leaderboard:list", { limit: 5 }, (ack) => {
    if (ack.ok) {
      setLeaderboard(ack.data);
    }
  });
}

function refreshLobby(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  setLobby: (state: PublicLobbyState) => void
): void {
  socket.emit("lobby:get", (ack) => {
    if (ack.ok) {
      setLobby(ack.data);
    }
  });
}

function refreshRankedQueue(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  setRankedQueue: (state: PublicRankedQueueState) => void
): void {
  socket.emit("ranked:get", (ack) => {
    if (ack.ok) {
      setRankedQueue(ack.data);
    }
  });
}

function refreshTournamentQueue(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  setTournamentQueue: (state: PublicTournamentQueueState) => void
): void {
  socket.emit("tournament:get", (ack) => {
    if (ack.ok) {
      setTournamentQueue(ack.data);
    }
  });
}

function refreshMatchHistory(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  profileId: string,
  setMatchHistory: (entries: readonly PublicMatchHistoryItem[]) => void
): void {
  socket.emit("profile:history", { guestId: profileId, limit: 5 }, (ack) => {
    if (ack.ok) {
      setMatchHistory(ack.data);
    }
  });
}

function refreshCosmetics(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  setCosmetics: (cosmetics: readonly PublicCosmetic[]) => void
): void {
  socket.emit("cosmetics:list", (ack) => {
    if (ack.ok) {
      setCosmetics(ack.data);
    }
  });
}

function getAvatarSymbol(avatarKey: ProfileAvatarKey): string {
  if (avatarKey === "club") {
    return "C";
  }

  if (avatarKey === "heart") {
    return "H";
  }

  if (avatarKey === "spade") {
    return "S";
  }

  return "D";
}

function MatchHistorySummary({
  entries,
  onLabelReplay
}: {
  readonly entries: readonly PublicMatchHistoryItem[];
  readonly onLabelReplay: (matchId: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [placementFilter, setPlacementFilter] = useState<MatchHistoryPlacementFilter>("all");
  const filteredEntries = entries.filter(
    (entry) =>
      matchesHistoryPlacementFilter(entry, placementFilter) && matchesHistorySearch(entry, query)
  );

  return (
    <details className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">
        <span className="flex items-center gap-2">
          <History className="size-4 text-[var(--aqua)]" />
          Recent Matches
        </span>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs font-normal text-zinc-300">
          {entries.length}
        </span>
      </summary>

      <div className="mt-3 grid gap-3">
        {entries.length === 0 ? (
          <p className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-400">
            Completed online matches will appear here.
          </p>
        ) : (
          <>
            <input
              className="h-9 rounded-full border border-white/10 bg-black/24 px-3 text-xs outline-none transition placeholder:text-zinc-600 focus:border-[var(--gold)]"
              placeholder="Search room, mode, opponent"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="grid grid-cols-4 gap-1.5">
              {MATCH_HISTORY_PLACEMENT_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  className={cn(
                    "rounded-full border px-2 py-1.5 text-[10px] font-black uppercase transition",
                    placementFilter === filter.value
                      ? "border-[var(--gold)] bg-[var(--gold)] text-black"
                      : "border-white/10 bg-white/7 text-zinc-300 hover:border-white/20 hover:bg-white/10"
                  )}
                  type="button"
                  onClick={() => setPlacementFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2">
              {filteredEntries.length === 0 ? (
                <p className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-400">
                  No saved matches match those filters.
                </p>
              ) : (
                filteredEntries.map((entry) => (
                  <MatchHistoryCard
                    key={entry.matchId}
                    entry={entry}
                    onLabelReplay={onLabelReplay}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

type MatchHistoryPlacementFilter = "all" | "wins" | "podium" | "losses";

const MATCH_HISTORY_PLACEMENT_FILTERS: readonly {
  readonly value: MatchHistoryPlacementFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "wins", label: "Wins" },
  { value: "podium", label: "Podium" },
  { value: "losses", label: "Losses" }
];

function MatchHistoryCard({
  entry,
  onLabelReplay
}: {
  readonly entry: PublicMatchHistoryItem;
  readonly onLabelReplay: (matchId: string, label: string) => void;
}) {
  const [labelDraft, setLabelDraft] = useState("");

  function submitLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLabelReplay(entry.matchId, labelDraft);
    setLabelDraft("");
  }

  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold">
          {entry.placement === null ? "Unplaced" : ordinal(entry.placement)}
        </p>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-black",
            entry.ratingDelta === null
              ? "bg-white/7 text-zinc-300"
              : entry.ratingDelta >= 0
                ? "bg-emerald-400/15 text-emerald-200"
                : "bg-red-400/15 text-red-200"
          )}
        >
          {formatRatingDelta(entry.ratingDelta)}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
        <Gauge className="size-3" />
        {entry.movesPlayed ?? 0} moves · {entry.bombsPlayed} bombs · {entry.roomCode ?? "archived"}
      </p>
      {entry.opponents.length > 0 ? (
        <p className="mt-1 truncate text-[11px] text-zinc-500">
          vs {entry.opponents.map((opponent) => opponent.name).join(", ")}
        </p>
      ) : null}
      {entry.labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.labels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-[var(--gold)]/25 bg-[var(--gold)]/12 px-2 py-0.5 text-[10px] font-black uppercase text-[var(--gold)]"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <form className="mt-2 flex gap-1.5" onSubmit={submitLabel}>
        <input
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/24 px-2 py-1 text-[11px] outline-none placeholder:text-zinc-600 focus:border-[var(--gold)]"
          maxLength={24}
          placeholder="Add label"
          value={labelDraft}
          onChange={(event) => setLabelDraft(event.target.value)}
        />
        <button
          className="rounded-full border border-white/10 bg-white/8 px-2 text-[10px] font-black uppercase text-zinc-300 transition hover:bg-white/12 disabled:opacity-45"
          disabled={labelDraft.trim().length < 2}
          type="submit"
        >
          Save
        </button>
      </form>
    </div>
  );
}

function matchesHistoryPlacementFilter(
  entry: PublicMatchHistoryItem,
  filter: MatchHistoryPlacementFilter
): boolean {
  if (filter === "wins") {
    return entry.placement === 1;
  }

  if (filter === "podium") {
    return entry.placement !== null && entry.placement <= 3;
  }

  if (filter === "losses") {
    return entry.placement !== null && entry.placement >= 3;
  }

  return true;
}

function matchesHistorySearch(entry: PublicMatchHistoryItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === "") {
    return true;
  }

  const haystack = [
    entry.roomCode ?? "archived",
    formatMatchMode(entry.mode),
    entry.placement === null ? "unplaced" : ordinal(entry.placement),
    ...entry.labels,
    ...entry.opponents.flatMap((opponent) => [
      opponent.name,
      opponent.kind,
      opponent.placement === null ? "unplaced" : ordinal(opponent.placement)
    ])
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function LeaderboardSummary({ entries }: { readonly entries: readonly PublicLeaderboardEntry[] }) {
  return (
    <section className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ListOrdered className="size-4 text-[var(--aqua)]" />
          Leaderboard
        </p>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs text-zinc-300">
          Rating
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-400">
          No rated games yet.
        </p>
      ) : (
        <ol className="grid gap-2">
          {entries.map((entry, index) => (
            <li
              key={entry.guestId}
              className="flex items-center justify-between gap-2 rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">
                  #{index + 1} {entry.displayName ?? "Guest player"}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {entry.wins} wins · {entry.gamesPlayed} games
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-black/24 px-2 py-1 text-xs font-black">
                {entry.rating}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FeedbackSummary({
  defaultEmail,
  onSubmitFeedback
}: {
  readonly defaultEmail: string;
  readonly onSubmitFeedback: (input: {
    readonly kind: FeedbackKind;
    readonly body: string;
    readonly contactEmail: string;
  }) => Promise<ServerAck<PublicFeedbackReceipt>>;
}) {
  const [kind, setKind] = useState<FeedbackKind>("BUG");
  const [body, setBody] = useState("");
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    setContactEmail((current) => (current.trim() === "" ? defaultEmail : current));
  }, [defaultEmail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    const result = await onSubmitFeedback({
      kind,
      body,
      contactEmail
    });

    if (result.ok) {
      setStatus("sent");
      setBody("");
      return;
    }

    setStatus("error");
  }

  return (
    <form
      className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3"
      onSubmit={handleSubmit}
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <MessageCircle className="size-4 text-[var(--aqua)]" />
        Feedback
      </p>
      <p className="mt-2 text-xs text-zinc-400">
        Found a bug or have an idea? Send a note without leaving the app.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/24 p-1">
        {FEEDBACK_KIND_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={cn(
              "rounded-full px-2 py-1.5 text-xs font-black transition",
              kind === option.value
                ? "bg-[var(--gold)] text-black"
                : "text-zinc-400 hover:bg-white/8 hover:text-white"
            )}
            type="button"
            onClick={() => setKind(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <textarea
        className="mt-3 min-h-24 w-full resize-none rounded-[1rem] border border-white/10 bg-black/24 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-[var(--gold)]"
        value={body}
        maxLength={800}
        placeholder="What happened?"
        onChange={(event) => {
          setStatus("idle");
          setBody(event.target.value);
        }}
      />
      <input
        className="mt-2 h-10 w-full rounded-full border border-white/10 bg-black/24 px-3 text-sm outline-none placeholder:text-zinc-500 focus:border-[var(--gold)]"
        value={contactEmail}
        placeholder="Email optional"
        onChange={(event) => setContactEmail(event.target.value)}
      />
      <Button
        className="mt-3 h-10 w-full"
        disabled={status === "sending" || body.trim().length < 6}
        size="sm"
        type="submit"
      >
        {status === "sending" ? "Sending..." : "Send feedback"}
      </Button>
      {status === "sent" ? (
        <p className="mt-2 text-xs font-bold text-emerald-200">Feedback sent. Thank you.</p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 text-xs font-bold text-red-200">Could not send feedback right now.</p>
      ) : null}
    </form>
  );
}

function CosmeticsSummary({
  standalone = false,
  cosmetics,
  profile,
  onEquip,
  onPurchase
}: {
  readonly standalone?: boolean;
  readonly cosmetics: readonly PublicCosmetic[];
  readonly profile: PublicGuestProfile | null;
  readonly onEquip: (cosmetic: PublicCosmetic) => void;
  readonly onPurchase: (cosmetic: PublicCosmetic) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<CosmeticFilterKind>("ALL");
  const [view, setView] = useState<"shop" | "locker">("shop");
  const unlocksByCosmeticId = new Map(
    profile?.unlocks.map((unlock) => [unlock.cosmetic.id, unlock]) ?? []
  );
  const unlockedIds = new Set(unlocksByCosmeticId.keys());
  const equippedIds = new Set(
    profile?.equippedCosmetics.map((equippedCosmetic) => equippedCosmetic.cosmetic.id) ?? []
  );
  const coinBalance = profile?.arenaCoins ?? 0;
  const unlimitedCoins = profile?.isAdmin === true;
  const equippedCount = equippedIds.size;
  const ownedCount = unlockedIds.size;
  const viewCosmetics = cosmetics.filter((cosmetic) =>
    view === "locker" ? unlockedIds.has(cosmetic.id) : !unlockedIds.has(cosmetic.id)
  );
  const visibleCosmetics = [
    ...viewCosmetics.filter((cosmetic) => activeFilter === "ALL" || cosmetic.kind === activeFilter)
  ].sort((left, right) => {
    if (view === "locker") {
      const equippedDifference =
        Number(equippedIds.has(right.id)) - Number(equippedIds.has(left.id));

      if (equippedDifference !== 0) {
        return equippedDifference;
      }
    }

    return left.name.localeCompare(right.name);
  });

  const content = (
    <div className="mt-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid w-full grid-cols-2 rounded-full border border-white/10 bg-black/24 p-1 sm:w-72">
          {(["shop", "locker"] as const).map((option) => (
            <button
              key={option}
              className={cn(
                "h-9 rounded-full text-xs font-black capitalize transition",
                view === option ? "bg-[var(--gold)] text-black" : "text-zinc-400 hover:text-white"
              )}
              type="button"
              onClick={() => setView(option)}
            >
              {option} {option === "shop" ? cosmetics.length - ownedCount : ownedCount}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold text-zinc-400">
          {ownedCount} of {cosmetics.length} collected · {equippedCount} equipped
        </p>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {COSMETIC_FILTERS.map((filter) => (
          <button
            key={filter.kind}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase transition",
              activeFilter === filter.kind
                ? "border-white/20 bg-white/14 text-white"
                : "border-transparent bg-transparent text-zinc-500 hover:text-white"
            )}
            type="button"
            onClick={() => setActiveFilter(filter.kind)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {visibleCosmetics.length === 0 ? (
        <div className="mt-6 grid min-h-48 place-items-center rounded-[0.9rem] border border-dashed border-white/12 px-5 text-center">
          <p className="max-w-sm text-sm text-zinc-400">
            {cosmetics.length === 0
              ? "Cosmetic catalog loads from the realtime server."
              : view === "locker"
                ? "No owned cosmetics in this category yet."
                : "You own every cosmetic in this category."}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 min-[500px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {visibleCosmetics.map((cosmetic) => (
            <CosmeticCatalogCard
              key={cosmetic.id}
              cosmetic={cosmetic}
              unlock={unlocksByCosmeticId.get(cosmetic.id)}
              owned={unlockedIds.has(cosmetic.id)}
              equipped={equippedIds.has(cosmetic.id)}
              coinBalance={coinBalance}
              unlimitedCoins={unlimitedCoins}
              onEquip={onEquip}
              onPurchase={onPurchase}
            />
          ))}
        </div>
      )}

      <p className="mt-5 border-t border-white/10 pt-4 text-[11px] leading-5 text-zinc-500">
        {unlimitedCoins
          ? "Creator access is active. Coin costs are bypassed and the complete collection is available in your locker."
          : "Earn Arena Coins by finishing matches: 1st +120, 2nd +80, 3rd +50, everyone else +25. Ranked adds a placement bonus. Cosmetics never affect gameplay."}
      </p>
    </div>
  );

  if (standalone) {
    return (
      <section className="online-panel min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-[var(--gold)]">Collection</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-black">
              <Palette className="size-6" />
              Shop & Locker
            </h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5 text-sm font-bold text-zinc-200">
            {unlimitedCoins ? "∞" : coinBalance} coins
          </span>
        </div>
        {content}
      </section>
    );
  }

  return (
    <details className="online-panel p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">
        <span className="flex items-center gap-2">
          <Palette className="size-4 text-[var(--gold)]" />
          Shop & Locker
        </span>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs font-normal text-zinc-300">
          {unlimitedCoins ? "∞" : coinBalance} coins
        </span>
      </summary>
      {content}
    </details>
  );
}

function getCosmeticMilestone(slug: string): string | null {
  const milestones: Readonly<Record<string, string>> = {
    "classic-red-card-back": "finish 1 match",
    "midnight-felt-table": "win 1 match",
    "aqua-pulse-avatar": "finish 10 matches",
    "lagoon-table": "win 8 matches",
    "neon-grid-card-back": "finish 20 matches",
    "aqua-profile-border": "win 15 matches",
    "crown-chip-avatar": "win 25 matches",
    "blackberry-bandit-avatar": "win 45 matches",
    "obsidian-table": "win 50 matches",
    "ember-court-card-back": "finish 50 matches",
    "pool-shark-card-back": "finish 30 matches",
    "koi-current-card-back": "win 40 matches",
    "koi-garden-table": "win 55 matches",
    "orchard-salon-card-back": "win 65 matches",
    "bengal-bloom-card-back": "win 70 matches",
    "jungle-club-table": "win 80 matches",
    "arena-six-crest-card-back": "win 75 matches",
    "celestial-vault-card-back": "win 90 matches",
    "koi-guardian-avatar": "win 100 matches",
    "celestial-observatory-table": "win 110 matches",
    "ember-sovereign-card-back": "win 125 matches",
    "voidglass-prism-card-back": "win 175 matches",
    "ember-throne-table": "win 200 matches",
    "ember-regent-avatar": "win 225 matches",
    "gold-division-border": "reach Gold (1100)",
    "platinum-division-border": "reach Platinum (1300)",
    "diamond-division-border": "reach Diamond (1500)",
    "arena-master-border": "reach Arena Master (1800)",
    "tournament-champion-border": "win an 8-player Arena Cup"
  };

  return milestones[slug] ?? null;
}

const COSMETIC_FILTERS: readonly {
  readonly kind: CosmeticFilterKind;
  readonly label: string;
}[] = [
  { kind: "ALL", label: "All" },
  { kind: "CARD_BACK", label: "Cards" },
  { kind: "TABLE_THEME", label: "Tables" },
  { kind: "AVATAR", label: "Avatars" },
  { kind: "PROFILE_BORDER", label: "Borders" }
];

function CosmeticCatalogCard({
  cosmetic,
  unlock,
  owned,
  equipped,
  coinBalance,
  unlimitedCoins,
  onEquip,
  onPurchase
}: {
  readonly cosmetic: PublicCosmetic;
  readonly unlock: PublicGuestProfile["unlocks"][number] | undefined;
  readonly owned: boolean;
  readonly equipped: boolean;
  readonly coinBalance: number;
  readonly unlimitedCoins: boolean;
  readonly onEquip: (cosmetic: PublicCosmetic) => void;
  readonly onPurchase: (cosmetic: PublicCosmetic) => void;
}) {
  const milestone = getCosmeticMilestone(cosmetic.slug);

  return (
    <article
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-[0.8rem] border bg-black/18 transition",
        equipped
          ? "border-[var(--gold)]/55 shadow-[0_10px_35px_rgba(242,193,78,0.08)]"
          : "border-white/10 hover:border-white/20"
      )}
    >
      <div className="relative grid min-h-40 place-items-center overflow-hidden border-b border-white/8 bg-white/[0.025] px-3 py-5">
        <CosmeticPreview cosmetic={cosmetic} large />
        <span
          className={cn(
            "absolute right-2 top-2 rounded-full px-2 py-1 text-[9px] font-black uppercase",
            equipped
              ? "bg-[var(--gold)] text-black"
              : owned
                ? "bg-emerald-400/15 text-emerald-200"
                : "bg-black/45 text-zinc-300"
          )}
        >
          {equipped ? "Equipped" : owned ? "Owned" : cosmetic.rarity}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="truncate text-sm font-black" title={cosmetic.name}>
          {cosmetic.name}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase text-zinc-500">
          {formatCosmeticKind(cosmetic.kind)} · {getCosmeticOwnershipLabel(cosmetic, unlock)}
        </p>
        {!owned && milestone !== null ? (
          <p className="mt-2 min-h-8 text-[10px] leading-4 text-[var(--aqua)]">
            Earn by: {milestone}
          </p>
        ) : (
          <div className="min-h-8" aria-hidden="true" />
        )}
        <div className="mt-auto pt-2">
          <CosmeticAction
            cosmetic={cosmetic}
            owned={owned}
            equipped={equipped}
            coinBalance={coinBalance}
            unlimitedCoins={unlimitedCoins}
            onEquip={onEquip}
            onPurchase={onPurchase}
          />
        </div>
      </div>
    </article>
  );
}

function CosmeticAction({
  cosmetic,
  owned,
  equipped,
  coinBalance,
  unlimitedCoins,
  onEquip,
  onPurchase
}: {
  readonly cosmetic: PublicCosmetic;
  readonly owned: boolean;
  readonly equipped: boolean;
  readonly coinBalance: number;
  readonly unlimitedCoins: boolean;
  readonly onEquip: (cosmetic: PublicCosmetic) => void;
  readonly onPurchase: (cosmetic: PublicCosmetic) => void;
}) {
  if (equipped) {
    return (
      <span className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-400/12 px-2 text-[10px] font-black uppercase text-emerald-200">
        <CheckCircle2 className="size-3.5" />
        Equipped
      </span>
    );
  }

  if (owned) {
    return (
      <Button className="h-9 w-full px-2 text-xs" size="sm" onClick={() => onEquip(cosmetic)}>
        Equip
      </Button>
    );
  }

  if (!cosmetic.isSupporter && cosmetic.coinPrice !== null && cosmetic.coinPrice > 0) {
    if (unlimitedCoins || coinBalance >= cosmetic.coinPrice) {
      return (
        <Button className="h-9 w-full px-2 text-xs" size="sm" onClick={() => onPurchase(cosmetic)}>
          Unlock · {cosmetic.coinPrice}
        </Button>
      );
    }

    return (
      <span className="grid h-9 w-full place-items-center rounded-md bg-white/6 px-2 text-[10px] font-black uppercase text-zinc-400">
        {cosmetic.coinPrice} coins needed
      </span>
    );
  }

  return (
    <span
      className={cn(
        "grid h-9 w-full place-items-center rounded-md px-2 text-[10px] font-black uppercase",
        cosmetic.isSupporter ? "bg-[var(--gold)]/18 text-[var(--gold)]" : "bg-white/8 text-zinc-300"
      )}
    >
      {getLockedCosmeticLabel(cosmetic)}
    </span>
  );
}

function getLockedCosmeticLabel(cosmetic: PublicCosmetic): string {
  if (cosmetic.isSupporter) {
    return "Supporter";
  }

  if (cosmetic.coinPrice !== null) {
    return cosmetic.coinPrice === 0 ? "Earned" : `${cosmetic.coinPrice} coins`;
  }

  return cosmetic.rarity;
}

function getCosmeticOwnershipLabel(
  cosmetic: PublicCosmetic,
  unlock: PublicGuestProfile["unlocks"][number] | undefined
): string {
  if (unlock?.source === "ADMIN_GRANT") {
    return "creator access";
  }

  if (cosmetic.isSupporter) {
    return "supporter";
  }

  if (cosmetic.coinPrice !== null && cosmetic.coinPrice > 0) {
    return `${cosmetic.coinPrice} coins`;
  }

  return cosmetic.rarity;
}

function CosmeticPreview({
  cosmetic,
  large = false
}: {
  readonly cosmetic: PublicCosmetic;
  readonly large?: boolean;
}) {
  if (cosmetic.kind === "CARD_BACK") {
    return (
      <div
        className={cn("relative shrink-0", large ? "h-32 w-28" : "h-14 w-14")}
        aria-label={`${cosmetic.name} deck preview`}
      >
        <div
          className={cn(
            "card-back absolute left-0 top-1 grid -rotate-6 place-items-center rounded-md border border-white/20 shadow-lg",
            large ? "h-28 w-20" : "h-12 w-9",
            getCardBackClass(cosmetic)
          )}
        >
          <div
            className={cn("rounded-sm border border-white/45", large ? "h-16 w-10" : "h-7 w-4")}
          />
        </div>
        <div
          data-rank="A"
          data-royal="false"
          data-suit-symbol="♦"
          className={cn(
            "card-face absolute bottom-0 right-0 grid rotate-6 overflow-hidden rounded-md border shadow-lg",
            large ? "h-28 w-20" : "h-12 w-9",
            getCardFaceClass(cosmetic),
            getCardFaceRarityClass(cosmetic)
          )}
        >
          <span className="card-face-theme-art" aria-hidden="true" />
          <span className="card-face-theme-rail" aria-hidden="true" />
          <span className="card-face-theme-suit" aria-hidden="true" />
          <span className="card-face-royal-mark" aria-hidden="true" />
          <span
            className={cn(
              "card-face-corner relative z-10 pl-1 pt-1 font-black leading-none text-red-600",
              large ? "text-base" : "text-[10px]"
            )}
          >
            A<br />♦
          </span>
          <span
            className={cn(
              "card-face-emblem relative z-10 self-center justify-self-center leading-none text-red-600",
              large ? "text-3xl" : "text-lg"
            )}
          >
            <span>♦</span>
          </span>
        </div>
      </div>
    );
  }

  if (cosmetic.kind === "TABLE_THEME") {
    return (
      <div
        className={cn(
          "table-felt relative shrink-0 overflow-hidden rounded-[50%] border border-emerald-200/25 shadow-lg",
          large ? "h-24 w-full max-w-44" : "h-10 w-12",
          getTableThemeClass(cosmetic)
        )}
      />
    );
  }

  if (cosmetic.kind === "PROFILE_BORDER") {
    return (
      <div
        className={cn(
          "grid shrink-0 place-items-center rounded-full border-2 bg-black/30 shadow-lg",
          large ? "h-20 w-20" : "h-11 w-11",
          getProfileBorderClass(cosmetic)
        )}
      >
        <Sparkles className={cn("text-[var(--gold)]", large ? "size-7" : "size-4")} />
      </div>
    );
  }

  if (cosmetic.kind === "AVATAR") {
    const imageUrl = getAvatarCosmeticImage(cosmetic);

    return (
      <div
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-full border font-black shadow-lg",
          large ? "h-20 w-20 text-xl" : "h-11 w-11 text-sm",
          getAvatarCosmeticClass(cosmetic)
        )}
      >
        {imageUrl === null ? (
          getAvatarCosmeticSymbol(cosmetic)
        ) : (
          <span
            className="size-full bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/8">
      <Palette className="size-4 text-zinc-300" />
    </div>
  );
}

function formatCosmeticKind(kind: PublicCosmetic["kind"]): string {
  if (kind === "CARD_BACK") {
    return "Full deck";
  }

  return kind
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMatchMode(mode: PublicRoomState["mode"]): string {
  if (mode === "RANKED") {
    return "Ranked";
  }

  if (mode === "TOURNAMENT") {
    return "Tournament";
  }

  if (mode === "LOCAL_DEMO") {
    return "Demo";
  }

  return "Casual";
}

function ProfileMetric({
  label,
  value
}: {
  readonly label: string;
  readonly value: number | string;
}) {
  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2">
      <p className="text-base font-black">{value}</p>
      <p className="text-[11px] text-zinc-400">{label}</p>
    </div>
  );
}

function ActiveTableDrawer({
  panel,
  room,
  onClose,
  onSendChat,
  mutedPlayerIds,
  onToggleMute,
  onReportPlayer
}: {
  readonly panel: ActiveTablePanel | null;
  readonly room: PublicRoomState | null;
  readonly onClose: () => void;
  readonly onSendChat: (body: string) => void;
  readonly mutedPlayerIds: ReadonlySet<string>;
  readonly onToggleMute: (playerId: string) => void;
  readonly onReportPlayer: (
    input: ReportPlayerInput
  ) => Promise<ServerAck<PublicModerationReceipt>>;
}) {
  if (panel === null) {
    return null;
  }

  const title = panel === "chat" ? "Table Chat" : "Rules";

  return (
    <aside className="hud-glass absolute right-3 top-3 z-40 max-h-[calc(100%-1.5rem)] w-[min(24rem,calc(100%-1.5rem))] overflow-y-auto rounded-[1.25rem] border border-white/10 p-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black">{title}</p>
          <p className="text-xs text-zinc-400">
            {room === null ? "No active room" : `${formatMatchMode(room.mode)} · ${room.status}`}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>

      {panel === "chat" ? (
        <RoomChat
          messages={room?.recentChat ?? []}
          disabled={room === null}
          mutedPlayerIds={mutedPlayerIds}
          yourPlayerId={room?.yourPlayerId ?? null}
          onSend={onSendChat}
          onToggleMute={onToggleMute}
          onReportPlayer={onReportPlayer}
        />
      ) : null}

      {panel === "rules" ? <TableRulesPanel room={room} /> : null}
    </aside>
  );
}

function getTradeHandPrompt(room: PublicRoomState, selectedCards: readonly Card[]): string {
  const incomingRequest = room.tradePhase.requests.find(
    (request) => request.toPlayerId === room.yourPlayerId
  );

  if (incomingRequest !== undefined) {
    return `${selectedCards.length} selected · choose one ${incomingRequest.requestedRank} to accept`;
  }

  if (room.tradePhase.yourRequestUsed || room.tradePhase.yourTradeCompleted) {
    return "Trade decision complete · normal play starts shortly";
  }

  return `${selectedCards.length} selected · choose one card to offer`;
}

function TableRulesPanel({ room }: { readonly room: PublicRoomState | null }) {
  const bombRule =
    room?.rules.bombEndsTrick === true
      ? "Bombs immediately end the trick; no stronger bomb response is allowed."
      : "After a bomb, only a stronger bomb can answer.";
  const suitOrder =
    room?.rules.deckType === "arena-six"
      ? "Diamonds, clubs, hearts, spades, stars, crowns from low to high."
      : "Diamonds, clubs, hearts, spades from low to high.";
  const highestCard = room?.rules.deckType === "arena-six" ? "2 of crowns" : "2 of spades";
  const arenaRules =
    room?.rules.deckType === "arena-six"
      ? [
          "Arena 6 uses a 78-card deck. Pairs, trips, and quads may use any combination of its six suits.",
          "Five or six cards of one rank are not a separate hand. Arena 6 bombs remain exactly four matching cards plus one off-rank kicker."
        ]
      : [];
  const tradeRule =
    room?.tradePhase.status === "disabled"
      ? []
      : [
          "Casual trade variant: humans have 20 seconds before the first move to send one request and complete at most one one-for-one trade."
        ];

  return (
    <div className="grid gap-3">
      <div className="border-y border-white/10 py-3">
        <p className="text-xs font-black uppercase text-[var(--aqua)]">How a trick works</p>
        <p className="mt-2 text-xs leading-5 text-zinc-300">
          <strong className="text-white">Empty center:</strong> the active player leads any valid
          combination. <strong className="text-white">Cards in the center:</strong> play a higher
          hand of the same type or pass. When nobody beats the last play, its player clears the
          center and leads again.
        </p>
      </div>

      <div className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
        <p className="text-xs font-black uppercase text-[var(--gold)]">Rank order</p>
        <p className="mt-2 text-sm font-bold text-zinc-100">3 4 5 6 7 8 9 10 J Q K A 2</p>
        <p className="mt-2 text-xs text-zinc-400">
          {suitOrder} 3 of diamonds is lowest; {highestCard} is highest.
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-black uppercase text-[var(--gold)]">Legal combinations</p>
        <HandCombinationGuide compact />
      </div>

      <ol className="mt-1 grid gap-2">
        {[...DEUCES_RULES, ...arenaRules, bombRule, ...tradeRule].map((rule, index) => (
          <li
            key={rule}
            className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-300"
          >
            <span className="mr-2 font-black text-[var(--gold)]">{index + 1}</span>
            {rule}
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoomChat({
  messages,
  disabled,
  mutedPlayerIds,
  yourPlayerId,
  onSend,
  onToggleMute,
  onReportPlayer
}: {
  readonly messages: readonly PublicChatMessage[];
  readonly disabled: boolean;
  readonly mutedPlayerIds: ReadonlySet<string>;
  readonly yourPlayerId: string | null;
  readonly onSend: (body: string) => void;
  readonly onToggleMute: (playerId: string) => void;
  readonly onReportPlayer: (
    input: ReportPlayerInput
  ) => Promise<ServerAck<PublicModerationReceipt>>;
}) {
  const [draft, setDraft] = useState("");
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleMessages = messages.filter((message) => !mutedPlayerIds.has(message.playerId));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (draft.trim() === "") {
      return;
    }

    onSend(draft);
    setDraft("");
  }

  return (
    <section className="rounded-[1rem] border border-white/10 bg-black/20 p-2">
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span className="flex items-center gap-2">
          <MessageCircle className="size-3.5 text-[var(--gold)]" />
          Table Chat
        </span>
        <span className="text-[10px] text-zinc-500">{visibleMessages.length} recent</span>
      </div>

      <div className="mt-2 max-h-28 overflow-y-auto pr-1">
        {visibleMessages.length === 0 ? (
          <p className="py-3 text-center text-xs text-zinc-500">No messages yet.</p>
        ) : (
          visibleMessages.slice(-8).map((chatMessage) => (
            <div key={chatMessage.id} className="mb-2 last:mb-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-bold text-zinc-300">
                  {chatMessage.playerName}
                </p>
                {chatMessage.playerId !== yourPlayerId ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="rounded p-1 text-zinc-500 transition hover:bg-white/8 hover:text-white"
                      type="button"
                      aria-label={`Mute ${chatMessage.playerName}`}
                      title={`Mute ${chatMessage.playerName}`}
                      onClick={() => onToggleMute(chatMessage.playerId)}
                    >
                      <VolumeX className="size-3" />
                    </button>
                    <button
                      className="rounded p-1 text-zinc-500 transition hover:bg-red-400/10 hover:text-red-200"
                      type="button"
                      aria-label={`Report message from ${chatMessage.playerName}`}
                      title="Report message"
                      onClick={() =>
                        setReportingMessageId((current) =>
                          current === chatMessage.id ? null : chatMessage.id
                        )
                      }
                    >
                      <ShieldAlert className="size-3" />
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="break-words text-xs text-zinc-400">{chatMessage.body}</p>
              {reportingMessageId === chatMessage.id ? (
                <PlayerReportForm
                  targetPlayerId={chatMessage.playerId}
                  messageId={chatMessage.id}
                  onCancel={() => setReportingMessageId(null)}
                  onSubmit={async (input) => {
                    const result = await onReportPlayer(input);
                    if (result.ok) {
                      setReportingMessageId(null);
                    }
                    return result;
                  }}
                />
              ) : null}
            </div>
          ))
        )}
      </div>

      <form className="mt-2 flex gap-2" onSubmit={submitChat}>
        <input
          ref={inputRef}
          className="h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-white/7 px-2 text-xs text-white outline-none focus:border-[var(--gold)]"
          maxLength={240}
          placeholder={disabled ? "Join a room to chat" : "Message"}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button size="sm" disabled={disabled || draft.trim() === ""}>
          <Send className="size-4" />
        </Button>
      </form>
    </section>
  );
}

function TradePhaseOverlay({
  room,
  timerNow,
  selectedCards,
  targetPlayerId,
  requestedRank,
  onTargetPlayerChange,
  onRequestedRankChange,
  onRequest,
  onRespond
}: {
  readonly room: PublicRoomState;
  readonly timerNow: number;
  readonly selectedCards: readonly Card[];
  readonly targetPlayerId: string;
  readonly requestedRank: Rank;
  readonly onTargetPlayerChange: (playerId: string) => void;
  readonly onRequestedRankChange: (rank: Rank) => void;
  readonly onRequest: () => void;
  readonly onRespond: (requestId: string, accept: boolean) => void;
}) {
  const yourPlayerId = room.yourPlayerId;
  const incomingRequest = room.tradePhase.requests.find(
    (request) => request.toPlayerId === yourPlayerId
  );
  const outgoingRequest = room.tradePhase.requests.find(
    (request) => request.fromPlayerId === yourPlayerId
  );
  const incomingPlayer = room.players.find((player) => player.id === incomingRequest?.fromPlayerId);
  const yourPlayer = room.players.find((player) => player.id === yourPlayerId);
  const targets = room.players.filter(
    (player) => player.id !== yourPlayerId && player.kind === "human" && player.connected
  );
  const secondsRemaining =
    room.tradePhase.deadlineAt === null
      ? 0
      : Math.max(0, Math.ceil((new Date(room.tradePhase.deadlineAt).getTime() - timerNow) / 1000));

  return (
    <motion.section
      className="hud-glass absolute left-1/2 top-1/2 z-40 w-[min(31rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 border border-[var(--gold)]/45 p-4 shadow-2xl backdrop-blur-xl sm:p-5"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Handshake className="size-5 text-[var(--gold)]" />
          <div>
            <p className="text-sm font-black">Card trade</p>
            <p className="text-xs text-zinc-400">One request · one accepted trade</p>
          </div>
        </div>
        <span className="grid min-w-10 place-items-center rounded-full bg-[var(--gold)] px-2 py-1 font-mono text-sm font-black text-black">
          {secondsRemaining}s
        </span>
      </div>

      {incomingRequest !== undefined ? (
        <div>
          <p className="text-sm font-bold text-zinc-200">
            {getRoomPlayerName(room, incomingRequest.fromPlayerId)} offers this card for one of your{" "}
            <span className="text-[var(--gold)]">{incomingRequest.requestedRank}s</span>.
          </p>
          <div className="my-4 flex justify-center">
            <OnlineCard
              card={incomingRequest.offeredCard}
              cardTheme={
                incomingPlayer === undefined
                  ? null
                  : getEquippedCosmetic(incomingPlayer, "CARD_BACK")
              }
              compact
            />
          </div>
          <p className="mb-3 text-center text-xs font-semibold text-zinc-400">
            Select one matching card from your hand to accept.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => onRespond(incomingRequest.id, false)}>
              Decline
            </Button>
            <Button
              disabled={
                selectedCards.length !== 1 ||
                selectedCards[0]?.rank !== incomingRequest.requestedRank
              }
              onClick={() => onRespond(incomingRequest.id, true)}
            >
              Accept trade
            </Button>
          </div>
        </div>
      ) : outgoingRequest !== undefined ? (
        <div className="py-4 text-center">
          <p className="text-base font-black">Request sent</p>
          <p className="mt-1 text-sm text-zinc-400">
            Waiting for {getRoomPlayerName(room, outgoingRequest.toPlayerId)} to respond.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <OnlineCard
              card={outgoingRequest.offeredCard}
              cardTheme={
                yourPlayer === undefined ? null : getEquippedCosmetic(yourPlayer, "CARD_BACK")
              }
              compact
            />
            <ArrowRight className="size-5 text-zinc-500" />
            <span className="grid size-16 place-items-center rounded-full border border-white/12 bg-black/28 text-2xl font-black text-[var(--gold)]">
              {outgoingRequest.requestedRank}
            </span>
          </div>
        </div>
      ) : room.tradePhase.yourTradeCompleted ? (
        <p className="rounded-md bg-emerald-400/12 px-4 py-5 text-center text-sm font-bold text-emerald-200">
          Trade complete. Normal play begins when the timer ends.
        </p>
      ) : room.tradePhase.yourRequestUsed ? (
        <p className="rounded-md bg-white/7 px-4 py-5 text-center text-sm font-bold text-zinc-300">
          Your request is finished. Waiting for the trade window to close.
        </p>
      ) : (
        <div className="grid gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            Select exactly one card from your hand, then choose what rank you want back.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-zinc-300">
              Player
              <select
                className="mt-1 h-10 w-full rounded-md border border-white/12 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-[var(--gold)]"
                value={targetPlayerId}
                onChange={(event) => onTargetPlayerChange(event.target.value)}
              >
                {targets.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-zinc-300">
              Rank wanted
              <select
                className="mt-1 h-10 w-full rounded-md border border-white/12 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-[var(--gold)]"
                value={requestedRank}
                onChange={(event) => onRequestedRankChange(event.target.value as Rank)}
              >
                {RANKS.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            disabled={selectedCards.length !== 1 || targetPlayerId === ""}
            onClick={onRequest}
          >
            <Handshake className="size-4" />
            Send trade request
          </Button>
        </div>
      )}

      {room.tradePhase.completedTradeCount > 0 ? (
        <p className="mt-3 text-center text-[11px] font-semibold text-zinc-500">
          {room.tradePhase.completedTradeCount} trade
          {room.tradePhase.completedTradeCount === 1 ? "" : "s"} completed at this table
        </p>
      ) : null}
    </motion.section>
  );
}

function OnlineTable({
  room,
  timerNow,
  dealAnimationKey,
  onCreateBotGame,
  onLeaveRoom,
  onReviewDecisions,
  mutedPlayerIds,
  onToggleMute,
  onSetBlocked,
  onReportPlayer
}: {
  readonly room: PublicRoomState | null;
  readonly timerNow: number;
  readonly dealAnimationKey: string | null;
  readonly onCreateBotGame: () => void;
  readonly onLeaveRoom: () => void;
  readonly onReviewDecisions: () => Promise<ServerAck<readonly PublicReplayDecisionReview[]>>;
  readonly mutedPlayerIds: ReadonlySet<string>;
  readonly onToggleMute: (playerId: string) => void;
  readonly onSetBlocked: (playerId: string, blocked: boolean) => void;
  readonly onReportPlayer: (
    input: ReportPlayerInput
  ) => Promise<ServerAck<PublicModerationReceipt>>;
}) {
  const players = room?.players ?? [];
  const yourPlayer = players.find((player) => player.id === room?.yourPlayerId) ?? players[0];
  const seatedPlayers = getClockwiseSeatedPlayers(players, room?.yourPlayerId ?? null);
  const tableTheme =
    yourPlayer === undefined ? null : getEquippedCosmetic(yourPlayer, "TABLE_THEME");
  const trickPlayer = players.find(
    (player) => player.id === room?.currentTrick?.lastPlayedByPlayerId
  );
  const trickCardTheme =
    trickPlayer === undefined ? null : getEquippedCosmetic(trickPlayer, "CARD_BACK");
  const timerLabel = formatTurnTimer(room, timerNow);
  const activePlayer = players.find((player) => player.id === room?.activePlayerId);
  const isYourTurn =
    room !== null && room.yourPlayerId !== null && room.activePlayerId === room.yourPlayerId;
  const isOpeningLead = room?.turnNumber === 0 && room.currentTrick === null;
  const openTableTitle =
    room === null
      ? "Open table"
      : room.status === "waiting"
        ? "Waiting for players"
        : room.tradePhase.status === "open"
          ? "Trade window open"
          : isYourTurn
            ? isOpeningLead
              ? "Lead with 3♦"
              : "Your lead"
            : "Open table";
  const openTablePrompt =
    room === null
      ? "Create or join a room to take a seat."
      : room.status === "waiting"
        ? "The host can begin when the table is ready."
        : room.tradePhase.status === "open"
          ? "Complete any trades before normal play begins."
          : isYourTurn
            ? isOpeningLead
              ? "Your opening play must include the 3 of diamonds."
              : "Play any legal hand to start the next trick."
            : `${activePlayer?.name ?? "The active player"} is choosing the next lead.`;
  const currentLeadName =
    room?.currentTrick === null || room === null
      ? null
      : getRoomPlayerName(room, room.currentTrick.lastPlayedByPlayerId);
  const lastEvent = room?.recentEvents.at(-1) ?? null;
  const latestPass =
    lastEvent?.wasPass === true
      ? {
          eventKey: `${lastEvent.turnNumber}-${lastEvent.playerId}`,
          playerName: getRoomPlayerName(room, lastEvent.playerId)
        }
      : null;
  const trickEntryOffset =
    room === null || lastEvent === null || lastEvent.wasPass
      ? { x: 0, y: 36, rotate: 0 }
      : getTrickEntryOffset(
          seatedPlayers.findIndex((player) => player.id === lastEvent.playerId),
          seatedPlayers.length
        );
  const [visiblePassKey, setVisiblePassKey] = useState<string | null>(null);
  const [selectedStatsPlayerId, setSelectedStatsPlayerId] = useState<string | null>(null);
  const selectedStatsPlayer =
    room?.players.find((player) => player.id === selectedStatsPlayerId) ?? null;

  useEffect(() => {
    if (latestPass === null) {
      setVisiblePassKey(null);
      return;
    }

    setVisiblePassKey(latestPass.eventKey);
    const timeout = window.setTimeout(() => setVisiblePassKey(null), 1800);

    return () => window.clearTimeout(timeout);
  }, [latestPass?.eventKey]);

  return (
    <section
      className={cn(
        "table-felt table-oval absolute inset-0 overflow-hidden border border-white/10 p-3 lg:p-5",
        getTableThemeClass(tableTheme)
      )}
    >
      <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-bold uppercase text-zinc-200 backdrop-blur">
        <CircleDot className="size-3 text-[var(--aqua)]" />
        {room === null ? "No table" : `${formatMatchMode(room.mode)} table`}
      </div>

      {timerLabel !== null ? (
        <p className="absolute right-3 top-3 z-30 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-xs font-black text-[var(--gold)] shadow-lg backdrop-blur sm:hidden">
          {timerLabel}
        </p>
      ) : null}

      <AnimatePresence>
        {dealAnimationKey !== null ? (
          <DealAnimationOverlay key={dealAnimationKey} seatCount={seatedPlayers.length} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {latestPass !== null && visiblePassKey === latestPass.eventKey ? (
          <motion.div
            key={latestPass.eventKey}
            className="absolute left-1/2 top-[18%] z-30 -translate-x-1/2 rounded-full border border-white/12 bg-black/55 px-5 py-2 text-sm font-black text-zinc-100 shadow-2xl backdrop-blur"
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            {latestPass.playerName} passed
          </motion.div>
        ) : null}
      </AnimatePresence>

      {players.length === 0 ? (
        <div className="absolute inset-x-6 top-16 z-10 rounded-full border border-dashed border-white/15 bg-black/18 px-4 py-3 text-center text-sm text-zinc-300">
          Create or join a room to take a seat.
        </div>
      ) : room?.status !== "complete" ? (
        seatedPlayers.map((player, index) =>
          player.id === room?.yourPlayerId ? null : (
            <OnlineSeat
              key={player.id}
              player={player}
              active={room?.activePlayerId === player.id}
              position={index}
              seatCount={seatedPlayers.length}
              onOpenStats={() => setSelectedStatsPlayerId(player.id)}
            />
          )
        )
      ) : null}

      <AnimatePresence>
        {selectedStatsPlayer !== null ? (
          <PlayerStatsPopover
            key={selectedStatsPlayer.id}
            player={selectedStatsPlayer}
            canModerate={
              selectedStatsPlayer.kind === "human" && selectedStatsPlayer.id !== room?.yourPlayerId
            }
            muted={mutedPlayerIds.has(selectedStatsPlayer.id)}
            blocked={room?.blockedPlayerIds.includes(selectedStatsPlayer.id) ?? false}
            onToggleMute={() => onToggleMute(selectedStatsPlayer.id)}
            onSetBlocked={(blocked) => onSetBlocked(selectedStatsPlayer.id, blocked)}
            onReportPlayer={onReportPlayer}
            onClose={() => setSelectedStatsPlayerId(null)}
          />
        ) : null}
      </AnimatePresence>

      <div className="relative z-10 grid h-full min-h-[42rem] translate-y-14 place-items-center pb-44 text-center sm:min-h-[46rem] sm:pb-48 lg:min-h-0">
        <div className="trick-island w-[min(32rem,86vw)] px-5 pb-6 pt-24">
          <p className="text-sm font-semibold uppercase text-zinc-300">
            {currentLeadName === null ? "Current Trick" : `Last play by ${currentLeadName}`}
          </p>
          <h2 className="mt-1 text-2xl font-black">
            {room?.currentTrick === null || room === null
              ? openTableTitle
              : formatHandType(room.currentTrick.hand.type)}
          </h2>
          {timerLabel !== null ? (
            <p className="mx-auto mt-2 hidden w-fit rounded-full border border-white/10 bg-black/24 px-3 py-1 text-sm font-black text-[var(--gold)] sm:block">
              {timerLabel}
            </p>
          ) : null}
          <div className="mt-5 flex min-h-28 flex-wrap justify-center gap-2">
            <AnimatePresence mode="sync">
              {room?.currentTrick === null || room === null ? (
                <motion.div
                  className={cn(
                    "rounded-full border px-5 py-3 text-base font-semibold backdrop-blur",
                    isYourTurn && room?.tradePhase.status !== "open"
                      ? "border-[var(--gold)]/45 bg-[var(--gold)]/12 text-amber-50 shadow-[0_0_28px_rgba(242,193,78,0.12)]"
                      : "border-white/12 bg-black/18 text-zinc-300"
                  )}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                >
                  {openTablePrompt}
                </motion.div>
              ) : (
                room.currentTrick.hand.cards.map((card, index) => (
                  <motion.div
                    key={`${room.turnNumber}-${getCardId(card)}`}
                    layout
                    layoutId={`table-card-${room.roomCode}-${getCardId(card)}`}
                    initial={{
                      opacity: 0,
                      x: trickEntryOffset.x,
                      y: trickEntryOffset.y,
                      scale: 0.82,
                      rotate: trickEntryOffset.rotate + index - 2
                    }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, y: -20, scale: 0.92 }}
                    transition={{
                      delay: Math.min(0.2, index * 0.04),
                      type: "spring",
                      stiffness: 205,
                      damping: 25,
                      mass: 0.78
                    }}
                  >
                    <OnlineCard card={card} cardTheme={trickCardTheme} compact />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {room?.status === "complete" ? (
            <MatchResultsPanel
              room={room}
              onCreateBotGame={onCreateBotGame}
              onLeaveRoom={onLeaveRoom}
              onReviewDecisions={onReviewDecisions}
              mutedPlayerIds={mutedPlayerIds}
              onToggleMute={onToggleMute}
              onSetBlocked={onSetBlocked}
              onReportPlayer={onReportPlayer}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MatchResultsPanel({
  room,
  onCreateBotGame,
  onLeaveRoom,
  onReviewDecisions,
  mutedPlayerIds,
  onToggleMute,
  onSetBlocked,
  onReportPlayer
}: {
  readonly room: PublicRoomState;
  readonly onCreateBotGame: () => void;
  readonly onLeaveRoom: () => void;
  readonly onReviewDecisions: () => Promise<ServerAck<readonly PublicReplayDecisionReview[]>>;
  readonly mutedPlayerIds: ReadonlySet<string>;
  readonly onToggleMute: (playerId: string) => void;
  readonly onSetBlocked: (playerId: string, blocked: boolean) => void;
  readonly onReportPlayer: (
    input: ReportPlayerInput
  ) => Promise<ServerAck<PublicModerationReceipt>>;
}) {
  const rows = getPlacementRows(room);
  const yourPlacement = rows.find((row) => row.player.id === room.yourPlayerId)?.placement ?? null;
  const coinsEarned = yourPlacement === null ? null : getArenaCoinReward(yourPlacement, room.mode);
  const tournamentBonus =
    room.tournament?.stage === "final" && yourPlacement !== null
      ? ([500, 250, 100, 100] as const)[yourPlacement - 1]
      : null;
  const [showReview, setShowReview] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [simulationReviews, setSimulationReviews] = useState<
    readonly PublicReplayDecisionReview[] | null
  >(null);
  const [reviewStatus, setReviewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [selectedStatsPlayerId, setSelectedStatsPlayerId] = useState<string | null>(null);
  const review = getPlayerMatchReview(room);
  const timeline = getMoveTimelineRows(room);
  const selectedStatsPlayer =
    room.players.find((player) => player.id === selectedStatsPlayerId) ?? null;

  async function toggleDecisionReview() {
    if (showReview) {
      setShowReview(false);
      return;
    }

    setShowReview(true);

    if (simulationReviews !== null || reviewStatus === "loading") {
      return;
    }

    setReviewStatus("loading");
    setReviewError(null);
    const result = await onReviewDecisions();

    if (result.ok) {
      setSimulationReviews(result.data);
      setReviewStatus("idle");
      return;
    }

    setReviewStatus("error");
    setReviewError(result.error);
  }

  return (
    <motion.div
      className="mx-auto mt-5 max-h-[min(27rem,68vh)] w-[min(24rem,92vw)] overflow-y-auto overscroll-contain rounded-[1rem] border border-[var(--gold)]/50 bg-black/42 p-3 text-left shadow-2xl backdrop-blur"
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-black text-[var(--gold)]">
          <Sparkles className="size-4" />
          Match complete
        </p>
        <span className="rounded-full border border-white/10 bg-white/8 px-2 py-1 text-[10px] font-bold uppercase text-zinc-300">
          {formatMatchMode(room.mode)}
        </span>
      </div>

      {coinsEarned !== null ? (
        <div className="mb-3 flex items-center justify-between rounded-[0.8rem] border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-3 py-2">
          <span className="text-xs font-bold text-zinc-200">Match reward</span>
          <span className="text-sm font-black text-[var(--gold)]">+{coinsEarned} Arena Coins</span>
        </div>
      ) : null}
      {tournamentBonus !== null && tournamentBonus !== undefined ? (
        <div className="mb-3 flex items-center justify-between rounded-[0.8rem] border border-rose-300/35 bg-rose-300/10 px-3 py-2">
          <span className="text-xs font-bold text-zinc-200">Arena Cup final prize</span>
          <span className="text-sm font-black text-rose-200">+{tournamentBonus} coins</span>
        </div>
      ) : null}

      <ol className="grid gap-2">
        {rows.map(({ player, placement }) => (
          <li
            key={player.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-[0.8rem] border px-3 py-2",
              placement === 1
                ? "border-[var(--gold)]/50 bg-[var(--gold)]/14"
                : "border-white/10 bg-white/7"
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-black",
                  placement === 1 ? "bg-[var(--gold)] text-black" : "bg-black/30 text-zinc-300"
                )}
              >
                {placement}
              </span>
              <div className="min-w-0">
                <button
                  className="block max-w-full truncate text-left text-sm font-black underline-offset-4 transition hover:text-[var(--gold)] hover:underline"
                  type="button"
                  onClick={() => setSelectedStatsPlayerId(player.id)}
                >
                  {placement === 1 ? (
                    <Crown className="mr-1 inline size-3.5 text-[var(--gold)]" />
                  ) : null}
                  {player.name}
                </button>
                <p className="text-xs text-zinc-400">{ordinal(placement)}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-black/28 px-2 py-1 text-xs font-bold text-zinc-300">
              {player.cardsRemaining} left
            </span>
          </li>
        ))}
      </ol>

      {showReview ? (
        <motion.div
          className="mt-3 rounded-[0.9rem] border border-white/10 bg-black/24 p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-xs font-black uppercase text-[var(--aqua)]">Decision review</p>
          <div className="mt-2 grid gap-1.5">
            {reviewStatus === "loading" ? (
              <p className="rounded-[0.7rem] bg-white/7 px-2 py-1.5 text-xs text-zinc-300">
                Replaying your highest-choice turns with guided Monte Carlo rollouts...
              </p>
            ) : reviewStatus === "error" ? (
              <p className="rounded-[0.7rem] bg-red-400/12 px-2 py-1.5 text-xs text-red-200">
                {reviewError ?? "Replay analysis could not run."}
              </p>
            ) : simulationReviews?.length === 0 ? (
              <p className="rounded-[0.7rem] bg-white/7 px-2 py-1.5 text-xs text-zinc-300">
                This match had no multi-option turns to compare for your seat.
              </p>
            ) : (
              simulationReviews?.map((decision) => (
                <div
                  key={decision.turnNumber}
                  className="rounded-[0.7rem] border border-white/10 bg-white/7 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-zinc-100">
                      Turn {decision.turnNumber} comparison
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                        decision.severity === "high"
                          ? "bg-red-400/15 text-red-200"
                          : decision.severity === "medium"
                            ? "bg-[var(--gold)]/18 text-[var(--gold)]"
                            : "bg-white/8 text-zinc-300"
                      )}
                    >
                      {decision.severity} gap
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    You played: {formatReviewMove(decision.chosen.move)}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold text-zinc-200">
                    Rollout favorite: {formatReviewMove(decision.simulationFavorite.move)}
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] text-zinc-400">
                    <span>
                      Win estimate {formatPercent(decision.chosen.winRate)} →{" "}
                      {formatPercent(decision.simulationFavorite.winRate)}
                    </span>
                    <span>
                      Avg. place {decision.chosen.averagePlacement.toFixed(2)} →{" "}
                      {decision.simulationFavorite.averagePlacement.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    {decision.alternativesEvaluated} legal choices · {decision.chosen.rollouts}{" "}
                    rollouts each · 95% range {formatPercent(decision.chosen.winRateLow)}–
                    {formatPercent(decision.chosen.winRateHigh)}
                  </p>
                  {decision.chosen.completionRate < 1 ? (
                    <p className="mt-0.5 text-[10px] text-[var(--gold)]">
                      {formatPercent(decision.chosen.completionRate)} of chosen-move playouts
                      finished before the turn cap.
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          {reviewStatus !== "loading" ? (
            <>
              <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                Estimates use heuristic-guided Monte Carlo playouts with random exploration, not a
                solved strategy model. The 95% range shows uncertainty and results can vary between
                runs.
              </p>
              <ul className="mt-2 grid gap-1.5 text-xs text-zinc-300">
                {review.map((item) => (
                  <li key={item} className="rounded-[0.7rem] bg-white/7 px-2 py-1.5">
                    {item}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </motion.div>
      ) : null}

      {showTimeline ? (
        <motion.div
          className="mt-3 rounded-[0.9rem] border border-white/10 bg-black/24 p-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase text-[var(--aqua)]">Move timeline</p>
            <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-black text-zinc-300">
              {timeline.length} events
            </span>
          </div>
          <ol className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1 text-xs text-zinc-300">
            {timeline.length === 0 ? (
              <li className="rounded-[0.7rem] bg-white/7 px-2 py-1.5">
                No replay events were recorded for this completed table.
              </li>
            ) : (
              timeline.map((event) => (
                <li key={event.id} className="rounded-[0.7rem] bg-white/7 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-zinc-100">{event.playerName}</span>
                    <span className="font-mono text-[10px] text-zinc-500">T{event.turnNumber}</span>
                  </div>
                  <p className="mt-0.5 text-zinc-300">{event.description}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{event.cardsRemainingLabel}</p>
                </li>
              ))
            )}
          </ol>
        </motion.div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={reviewStatus === "loading"}
          onClick={() => void toggleDecisionReview()}
        >
          <Gauge className="size-4" />
          {reviewStatus === "loading"
            ? "Analyzing..."
            : showReview
              ? "Hide review"
              : "Review decisions"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowTimeline((current) => !current)}
        >
          <History className="size-4" />
          {showTimeline ? "Hide timeline" : "Move timeline"}
        </Button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={onCreateBotGame}>
          <Play className="size-4" />
          New table
        </Button>
        <Button size="sm" variant="secondary" onClick={onLeaveRoom}>
          <DoorOpen className="size-4" />
          Leave table
        </Button>
      </div>

      <AnimatePresence>
        {selectedStatsPlayer !== null ? (
          <PlayerStatsPopover
            key={selectedStatsPlayer.id}
            player={selectedStatsPlayer}
            canModerate={
              selectedStatsPlayer.kind === "human" && selectedStatsPlayer.id !== room.yourPlayerId
            }
            muted={mutedPlayerIds.has(selectedStatsPlayer.id)}
            blocked={room.blockedPlayerIds.includes(selectedStatsPlayer.id)}
            onToggleMute={() => onToggleMute(selectedStatsPlayer.id)}
            onSetBlocked={(blocked) => onSetBlocked(selectedStatsPlayer.id, blocked)}
            onReportPlayer={onReportPlayer}
            onClose={() => setSelectedStatsPlayerId(null)}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function DealAnimationOverlay({ seatCount }: { readonly seatCount: number }) {
  const visibleSeatCount = Math.max(2, Math.min(seatCount, MAX_CASUAL_PLAYERS_PER_ROOM));

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/20 backdrop-blur-[1px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative h-44 w-64">
        <motion.div
          className="absolute left-1/2 top-1/2 h-24 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[var(--gold)]/60 bg-[#142a4f] shadow-2xl"
          initial={{ rotate: -8, scale: 0.92 }}
          animate={{ rotate: [0, -10, 8, -4, 0], scale: [0.92, 1.02, 0.98, 1] }}
          transition={{ duration: 0.95, ease: "easeInOut" }}
        />
        {Array.from({ length: 9 }).map((_, index) => (
          <motion.div
            key={index}
            className="absolute left-1/2 top-1/2 h-24 w-16 rounded-md border border-white/18 bg-[linear-gradient(135deg,#1a386b,#0a1630)] shadow-xl"
            initial={{
              x: "-50%",
              y: "-50%",
              rotate: index * 2 - 8,
              opacity: 0,
              scale: 0.96
            }}
            animate={{
              x: `calc(-50% + ${(index - 4) * 18}px)`,
              y: `calc(-50% + ${Math.abs(index - 4) * 4}px)`,
              rotate: (index - 4) * 6,
              opacity: [0, 1, 1, 0],
              scale: [0.96, 1, 1, 0.9]
            }}
            transition={{
              delay: 0.08 + index * 0.045,
              duration: 1.05,
              ease: "easeInOut"
            }}
          >
            <div className="m-2 h-[calc(100%-1rem)] rounded border border-white/12 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.18),transparent_34%),linear-gradient(135deg,rgba(242,193,78,0.22),transparent_45%)]" />
          </motion.div>
        ))}

        {Array.from({ length: visibleSeatCount * 2 }).map((_, index) => {
          const seatIndex = index % visibleSeatCount;
          const dealRound = Math.floor(index / visibleSeatCount);
          const destination = getTrickEntryOffset(seatIndex, visibleSeatCount);

          return (
            <motion.div
              key={`deal-${index}`}
              className="absolute left-1/2 top-1/2 h-16 w-11 rounded border border-white/20 bg-[linear-gradient(135deg,#1a386b,#0a1630)] shadow-xl"
              initial={{ x: "-50%", y: "-50%", opacity: 0, scale: 0.82, rotate: 0 }}
              animate={{
                x: [`-50%`, `calc(-50% + ${destination.x}px)`],
                y: [`-50%`, `calc(-50% + ${destination.y}px)`],
                opacity: [0, 1, 1, 0],
                scale: [0.82, 0.92, 0.88],
                rotate: [0, destination.rotate]
              }}
              transition={{
                delay: 0.9 + dealRound * 0.28 + seatIndex * 0.07,
                duration: 0.58,
                ease: [0.22, 1, 0.36, 1]
              }}
            />
          );
        })}

        <motion.p
          className="absolute inset-x-0 bottom-0 text-center text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
          transition={{ duration: 1.05, delay: 0.12 }}
        >
          Shuffling
        </motion.p>
        <motion.p
          className="absolute inset-x-0 bottom-0 text-center text-xs font-black uppercase tracking-[0.18em] text-[var(--aqua)]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
          transition={{ duration: 1.05, delay: 1.02 }}
        >
          Dealing
        </motion.p>
      </div>
    </motion.div>
  );
}

function OnlineSeat({
  player,
  active,
  position,
  seatCount,
  onOpenStats
}: {
  readonly player: PublicRoomPlayer;
  readonly active: boolean;
  readonly position: number;
  readonly seatCount: number;
  readonly onOpenStats: () => void;
}) {
  const profileBorder = getEquippedCosmetic(player, "PROFILE_BORDER");
  const avatarCosmetic = getEquippedCosmetic(player, "AVATAR");
  const avatarCosmeticImage = getAvatarCosmeticImage(avatarCosmetic);
  const cardBack = getEquippedCosmetic(player, "CARD_BACK");
  const seatPosition = getSeatPositionClass(position, seatCount);
  const handOrientation = getSeatHandOrientation(position, seatCount);

  return (
    <div
      className={cn(
        "absolute z-20 flex gap-1 sm:gap-2",
        handOrientation === "top"
          ? "flex-col items-center"
          : handOrientation === "left"
            ? "flex-row items-center"
            : "flex-row-reverse items-center",
        seatPosition
      )}
    >
      <div
        className={cn(
          "seat-panel relative flex w-28 items-center gap-2 border px-2.5 py-2 sm:w-36",
          active
            ? "border-[var(--gold)] bg-[rgba(242,193,78,0.13)] shadow-[0_0_36px_rgba(242,193,78,0.14)]"
            : profileBorder !== null
              ? getProfileBorderClass(profileBorder)
              : "border-white/10"
        )}
        aria-current={active ? "true" : undefined}
      >
        <AnimatePresence>
          {active ? (
            <motion.span
              className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-amber-100/30 bg-[var(--gold)] px-2 py-0.5 text-[10px] font-black uppercase text-black shadow-lg"
              initial={{ opacity: 0, y: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 3, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
            >
              <Play className="size-2.5 fill-current" />
              Turn
            </motion.span>
          ) : null}
        </AnimatePresence>
        <div
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-black sm:size-9",
            avatarCosmetic === null
              ? player.connected
                ? "border-emerald-200/35 bg-emerald-400/12 text-emerald-100"
                : "border-zinc-500/35 bg-zinc-500/12 text-zinc-300"
              : getAvatarCosmeticClass(avatarCosmetic)
          )}
        >
          {avatarCosmeticImage !== null ? (
            <span
              className="size-full rounded-full bg-cover bg-center"
              style={{ backgroundImage: `url(${avatarCosmeticImage})` }}
            />
          ) : avatarCosmetic === null &&
            player.imageUrl !== null &&
            player.imageUrl !== undefined ? (
            <span
              className="size-full rounded-full bg-cover bg-center"
              style={{ backgroundImage: `url(${player.imageUrl})` }}
            />
          ) : avatarCosmetic === null ? (
            player.name.slice(0, 1).toUpperCase()
          ) : (
            getAvatarCosmeticSymbol(avatarCosmetic)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <button
            className="block max-w-full truncate text-left text-sm font-black underline-offset-4 transition hover:text-[var(--gold)] hover:underline"
            type="button"
            onClick={onOpenStats}
          >
            {player.name}
          </button>
          <p className="text-xs font-semibold text-zinc-300">{player.cardsRemaining} cards left</p>
          <span className="sr-only">{player.connected ? "online" : "away"}</span>
        </div>
      </div>
      <OnlineOpponentHand
        count={player.cardsRemaining}
        cardBack={cardBack}
        orientation={handOrientation}
      />
    </div>
  );
}

function PlayerStatsPopover({
  player,
  canModerate,
  muted,
  blocked,
  onToggleMute,
  onSetBlocked,
  onReportPlayer,
  onClose
}: {
  readonly player: PublicRoomPlayer;
  readonly canModerate: boolean;
  readonly muted: boolean;
  readonly blocked: boolean;
  readonly onToggleMute: () => void;
  readonly onSetBlocked: (blocked: boolean) => void;
  readonly onReportPlayer: (
    input: ReportPlayerInput
  ) => Promise<ServerAck<PublicModerationReceipt>>;
  readonly onClose: () => void;
}) {
  const stats = player.stats;
  const [showReport, setShowReport] = useState(false);

  return (
    <motion.aside
      className="hud-glass absolute right-4 top-16 z-40 w-[min(20rem,calc(100%-2rem))] rounded-[1.1rem] border border-white/10 p-4 text-left shadow-2xl backdrop-blur-xl"
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-black">{player.name}</p>
          <p className="text-xs uppercase text-zinc-400">{player.kind}</p>
        </div>
        <Button className="h-8 px-3" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ProfileMetric label="Cards" value={player.cardsRemaining} />
        <ProfileMetric label="Rating" value={stats?.rating ?? "-"} />
        <ProfileMetric label="Wins" value={stats?.wins ?? "-"} />
        <ProfileMetric
          label="Avg place"
          value={
            stats?.averagePlacement === null || stats === null
              ? "-"
              : stats.averagePlacement.toFixed(2)
          }
        />
      </div>

      {canModerate ? (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-3 gap-1.5">
            <Button size="sm" variant="secondary" onClick={onToggleMute}>
              {muted ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              {muted ? "Unmute" : "Mute"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onSetBlocked(!blocked)}>
              <Ban className="size-3.5" />
              {blocked ? "Unblock" : "Block"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowReport((current) => !current)}
            >
              <ShieldAlert className="size-3.5" />
              Report
            </Button>
          </div>
          {showReport ? (
            <PlayerReportForm
              targetPlayerId={player.id}
              onCancel={() => setShowReport(false)}
              onSubmit={async (input) => {
                const result = await onReportPlayer(input);
                if (result.ok) {
                  setShowReport(false);
                }
                return result;
              }}
            />
          ) : null}
        </div>
      ) : null}
    </motion.aside>
  );
}

function PlayerReportForm({
  targetPlayerId,
  messageId,
  onCancel,
  onSubmit
}: {
  readonly targetPlayerId: string;
  readonly messageId?: string;
  readonly onCancel: () => void;
  readonly onSubmit: (input: ReportPlayerInput) => Promise<ServerAck<PublicModerationReceipt>>;
}) {
  const [reason, setReason] = useState<PlayerReportReason>("HARASSMENT");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const result = await onSubmit({
      targetPlayerId,
      reason,
      ...(details.trim() === "" ? {} : { details: details.trim() }),
      ...(messageId === undefined ? {} : { messageId })
    });
    setStatus(result.ok ? "idle" : "error");
  }

  return (
    <form
      className="mt-2 grid gap-2 rounded-[0.8rem] border border-red-300/15 bg-red-400/5 p-2"
      onSubmit={submitReport}
    >
      <select
        className="h-8 rounded-md border border-white/10 bg-[#11171b] px-2 text-xs text-white outline-none focus:border-red-200/40"
        value={reason}
        onChange={(event) => setReason(event.target.value as PlayerReportReason)}
      >
        {REPORT_REASON_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <textarea
        className="min-h-16 resize-none rounded-md border border-white/10 bg-black/24 px-2 py-1.5 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-red-200/40"
        maxLength={500}
        placeholder="Optional context for the moderator"
        value={details}
        onChange={(event) => setDetails(event.target.value)}
      />
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="secondary" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending..." : "Submit report"}
        </Button>
      </div>
      {status === "error" ? (
        <p className="text-[11px] font-bold text-red-200">The report could not be submitted.</p>
      ) : null}
    </form>
  );
}

function OnlineOpponentHand({
  count,
  cardBack,
  orientation
}: {
  readonly count: number;
  readonly cardBack: PublicCosmetic | null;
  readonly orientation: "top" | "left" | "right";
}) {
  const vertical = orientation !== "top";
  const cardWidth = 36;
  const cardHeight = 54;
  const cardStep = count <= 6 ? 12 : count <= 10 ? 9 : 7;
  const compactCardWidth = 20;
  const compactCardHeight = 30;
  const compactCardStep = count <= 6 ? 6 : 3.5;
  const handLength = Math.max(
    vertical ? cardHeight : cardWidth,
    (vertical ? cardHeight : cardWidth) + Math.max(0, count - 1) * cardStep
  );
  const compactHandLength = Math.max(
    vertical ? compactCardHeight : compactCardWidth,
    (vertical ? compactCardHeight : compactCardWidth) + Math.max(0, count - 1) * compactCardStep
  );

  return (
    <div
      className="opponent-hand relative shrink-0"
      style={
        {
          "--opponent-hand-width": `${vertical ? cardWidth : handLength}px`,
          "--opponent-hand-height": `${vertical ? handLength : cardHeight}px`,
          "--opponent-hand-compact-width": `${vertical ? compactCardWidth : compactHandLength}px`,
          "--opponent-hand-compact-height": `${vertical ? compactHandLength : compactCardHeight}px`
        } as CSSProperties
      }
      aria-label={`${count} face-down cards remaining`}
    >
      <AnimatePresence initial={false}>
        {Array.from({ length: count }).map((_, index) => {
          const centerDistance = Math.abs(index - (count - 1) / 2);
          const rotationOffset = index - (count - 1) / 2;

          return (
            <motion.div
              aria-hidden="true"
              key={`online-opponent-card-back-${index}`}
              className={cn(
                "card-back opponent-card-back absolute rounded-[5px] border border-white/30 shadow-lg",
                getCardBackClass(cardBack)
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={
                {
                  "--opponent-card-left": `${vertical ? centerDistance * 0.55 : index * cardStep}px`,
                  "--opponent-card-top": `${vertical ? index * cardStep : centerDistance * 0.9}px`,
                  "--opponent-card-rotation": `${rotationOffset * (vertical ? 0.55 : 1.15)}deg`,
                  "--opponent-card-compact-left": `${vertical ? centerDistance * 0.25 : index * compactCardStep}px`,
                  "--opponent-card-compact-top": `${vertical ? index * compactCardStep : centerDistance * 0.45}px`,
                  "--opponent-card-compact-rotation": `${rotationOffset * (vertical ? 0.3 : 0.72)}deg`,
                  transformOrigin: vertical
                    ? orientation === "left"
                      ? "125% 50%"
                      : "-25% 50%"
                    : "50% 120%"
                } as MotionStyle & Record<`--${string}`, string>
              }
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function getEquippedCosmetic(player: PublicRoomPlayer, kind: PublicCosmetic["kind"]) {
  return (
    player.equippedCosmetics.find((equippedCosmetic) => equippedCosmetic.kind === kind)?.cosmetic ??
    null
  );
}

function getTableThemeClass(cosmetic: PublicCosmetic | null): string {
  if (cosmetic?.slug === "midnight-felt-table") {
    return "table-theme-midnight-felt";
  }

  if (cosmetic?.slug === "lagoon-table") {
    return "table-theme-lagoon";
  }

  if (cosmetic?.slug === "obsidian-table") {
    return "table-theme-obsidian";
  }

  if (cosmetic?.slug === "koi-garden-table") {
    return "table-theme-koi-garden";
  }

  if (cosmetic?.slug === "jungle-club-table") {
    return "table-theme-jungle-club";
  }

  if (cosmetic?.slug === "celestial-observatory-table") {
    return "table-theme-celestial-observatory";
  }

  if (cosmetic?.slug === "ember-throne-table") {
    return "table-theme-ember-throne";
  }

  return "";
}

function getCardBackClass(cosmetic: PublicCosmetic | null): string {
  if (cosmetic?.slug === "classic-red-card-back") {
    return "card-back-classic-red";
  }

  if (cosmetic?.slug === "neon-grid-card-back") {
    return "card-back-neon-grid";
  }

  if (cosmetic?.slug === "ember-court-card-back") {
    return "card-back-ember-court";
  }

  if (cosmetic?.slug === "pool-shark-card-back") {
    return "card-back-pool-shark";
  }

  if (cosmetic?.slug === "koi-current-card-back") {
    return "card-back-koi-current";
  }

  if (cosmetic?.slug === "orchard-salon-card-back") {
    return "card-back-orchard-salon";
  }

  if (cosmetic?.slug === "bengal-bloom-card-back") {
    return "card-back-bengal-bloom";
  }

  if (cosmetic?.slug === "arena-six-crest-card-back") {
    return "card-back-arena-six";
  }

  if (cosmetic?.slug === "celestial-vault-card-back") {
    return "card-back-celestial-vault";
  }

  if (cosmetic?.slug === "ember-sovereign-card-back") {
    return "card-back-ember-sovereign";
  }

  if (cosmetic?.slug === "voidglass-prism-card-back") {
    return "card-back-voidglass-prism";
  }

  return "";
}

function getCardFaceClass(cosmetic: PublicCosmetic | null): string {
  const faceClasses: Readonly<Record<string, string>> = {
    "classic-red-card-back": "card-face-classic-red",
    "neon-grid-card-back": "card-face-neon-grid",
    "ember-court-card-back": "card-face-ember-court",
    "pool-shark-card-back": "card-face-pool-shark",
    "koi-current-card-back": "card-face-koi-current",
    "orchard-salon-card-back": "card-face-orchard-salon",
    "bengal-bloom-card-back": "card-face-bengal-bloom",
    "arena-six-crest-card-back": "card-face-arena-six",
    "celestial-vault-card-back": "card-face-celestial-vault",
    "ember-sovereign-card-back": "card-face-ember-sovereign",
    "voidglass-prism-card-back": "card-face-voidglass-prism"
  };

  return cosmetic === null ? "" : (faceClasses[cosmetic.slug] ?? "");
}

function getCardFaceRarityClass(cosmetic: PublicCosmetic | null): string {
  if (cosmetic === null) {
    return "card-face-rarity-common";
  }

  return `card-face-rarity-${cosmetic.rarity}`;
}

function getProfileBorderClass(cosmetic: PublicCosmetic | null): string {
  if (cosmetic?.slug === "aqua-profile-border") {
    return "profile-border-aqua";
  }

  if (cosmetic?.slug === "founder-gold-border") {
    return "profile-border-founder-gold";
  }

  if (cosmetic?.slug === "gold-division-border") {
    return "border-amber-300/80 shadow-[0_0_24px_rgba(252,211,77,0.28)]";
  }

  if (cosmetic?.slug === "platinum-division-border") {
    return "border-cyan-100/80 shadow-[0_0_24px_rgba(207,250,254,0.24)]";
  }

  if (cosmetic?.slug === "diamond-division-border") {
    return "border-sky-300/90 shadow-[0_0_28px_rgba(56,189,248,0.34)]";
  }

  if (cosmetic?.slug === "arena-master-border") {
    return "border-fuchsia-300/90 shadow-[0_0_30px_rgba(232,121,249,0.38)]";
  }

  if (cosmetic?.slug === "tournament-champion-border") {
    return "border-rose-300/90 shadow-[0_0_30px_rgba(251,113,133,0.38)]";
  }

  return "border-[var(--gold)]/55";
}

function getAvatarCosmeticClass(cosmetic: PublicCosmetic | null): string {
  if (cosmetic?.slug === "aqua-pulse-avatar") {
    return "avatar-cosmetic-aqua";
  }

  if (cosmetic?.slug === "crown-chip-avatar") {
    return "avatar-cosmetic-crown";
  }

  if (cosmetic?.slug === "koi-guardian-avatar") {
    return "avatar-cosmetic-koi";
  }

  if (cosmetic?.slug === "blackberry-bandit-avatar") {
    return "avatar-cosmetic-blackberry";
  }

  if (cosmetic?.slug === "ember-regent-avatar") {
    return "avatar-cosmetic-ember";
  }

  return "border-emerald-200/35 bg-emerald-400/12 text-emerald-100";
}

function getAvatarCosmeticImage(cosmetic: PublicCosmetic | null): string | null {
  if (cosmetic?.kind !== "AVATAR") {
    return null;
  }

  return cosmetic.previewUrl;
}

function getAvatarCosmeticSymbol(cosmetic: PublicCosmetic | null): string {
  if (cosmetic?.slug === "crown-chip-avatar") {
    return "C";
  }

  if (cosmetic?.slug === "aqua-pulse-avatar") {
    return "A";
  }

  return "P";
}

function formatTurnTimer(room: PublicRoomState | null, now: number): string | null {
  if (room?.turnTimer === null || room === null) {
    return null;
  }

  if (room.turnTimer.deadlineAt === null) {
    return `${room.turnTimer.secondsPerTurn}s timer`;
  }

  const secondsLeft = Math.max(
    0,
    Math.ceil((new Date(room.turnTimer.deadlineAt).getTime() - now) / 1000)
  );

  return `${secondsLeft}s to move`;
}

function getPlacementRows(
  room: PublicRoomState
): readonly { readonly player: PublicRoomPlayer; readonly placement: number }[] {
  const orderedPlayerIds = [
    ...room.placements,
    ...room.players
      .filter((player) => !room.placements.includes(player.id))
      .sort((left, right) => left.cardsRemaining - right.cardsRemaining)
      .map((player) => player.id)
  ];

  return orderedPlayerIds
    .map((playerId, index) => {
      const player = room.players.find((candidate) => candidate.id === playerId);

      return player === undefined ? null : { player, placement: index + 1 };
    })
    .filter(
      (row): row is { readonly player: PublicRoomPlayer; readonly placement: number } =>
        row !== null
    );
}

function getArenaCoinReward(placement: number, mode: PublicRoomState["mode"]): number {
  const rankedBonus = mode === "RANKED" ? getRankedCoinBonus(placement as 1 | 2 | 3 | 4) : 0;

  if (placement === 1) {
    return 120 + rankedBonus;
  }

  if (placement === 2) {
    return 80 + rankedBonus;
  }

  if (placement === 3) {
    return 50 + rankedBonus;
  }

  return 25 + rankedBonus;
}

type MoveTimelineRow = {
  readonly id: string;
  readonly playerName: string;
  readonly turnNumber: number;
  readonly description: string;
  readonly cardsRemainingLabel: string;
};

function getMoveTimelineRows(room: PublicRoomState): readonly MoveTimelineRow[] {
  return room.recentEvents.map((event, index) => {
    const playerName = getRoomPlayerName(room, event.playerId);
    const cardsAfter = event.cardsRemainingAfter[event.playerId];
    const cardsRemainingLabel =
      cardsAfter === undefined
        ? "Cards remaining unknown"
        : `${cardsAfter} card${cardsAfter === 1 ? "" : "s"} left`;

    return {
      id: `${event.turnNumber}-${event.playerId}-${index}`,
      playerName,
      turnNumber: event.turnNumber,
      description: formatTimelineMove(event),
      cardsRemainingLabel
    };
  });
}

function formatTimelineMove(event: PublicGameEvent): string {
  if (event.wasPass || event.move.type === "pass") {
    return "Passed";
  }

  const handType = getMoveHandType(event);
  const cardList = event.move.cards.map(formatCard).join(" ");
  const legalContext =
    event.legalMoveCount === 1 ? "1 legal option" : `${event.legalMoveCount} legal options`;

  return `${handType === null ? "Played" : formatHandType(handType)}: ${cardList} · ${legalContext}`;
}

function formatReviewMove(move: Move): string {
  if (move.type === "pass") {
    return "Pass";
  }

  const hand = detectHand(move.cards);
  const handLabel = hand.type === "invalid" ? "Play" : formatHandType(hand.type);

  return `${handLabel} (${move.cards.map(formatCard).join(" ")})`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getPlayerMatchReview(room: PublicRoomState): readonly string[] {
  const playerId = room.yourPlayerId;
  const player = room.players.find((candidate) => candidate.id === playerId);

  if (playerId === null || player === undefined) {
    return ["Join a completed table to see your personal strategy notes."];
  }

  const placement = getPlacementRows(room).find((row) => row.player.id === playerId)?.placement;
  const playerEvents = room.recentEvents.filter((event) => event.playerId === playerId);
  const review: string[] = [];
  const summary = summarizePlayerEvents(playerEvents);
  const finalLine =
    placement === undefined
      ? `${player.name} finished with ${player.cardsRemaining} cards left.`
      : `${player.name} finished ${ordinal(placement)} with ${player.cardsRemaining} cards left.`;

  review.push(finalLine);

  if (playerEvents.length === 0) {
    return [
      ...review,
      "No completed moves were recorded for your seat, so there is not enough replay data to review yet."
    ];
  }

  review.push(
    `${summary.playCount} plays and ${summary.passCount} passes were recorded from your seat.`
  );

  if (summary.voluntaryPassCount > 0) {
    review.push(
      `${summary.voluntaryPassCount} passes happened with more than one legal option recorded.`
    );
  } else if (summary.passCount > 0) {
    review.push(
      "Your passes appear to be forced or low-choice spots based on the legal move counts."
    );
  }

  if (summary.multiCardShedCount > 0) {
    review.push(
      `${summary.multiCardShedCount} plays shed multiple cards, removing ${summary.cardsShedByMultiCardPlays} cards total.`
    );
  } else {
    review.push("No multi-card sheds were recorded from your seat.");
  }

  if (summary.leadCount > 0) {
    review.push(
      `You led ${summary.leadCount} ${pluralize("trick", summary.leadCount)}: ${formatHandTypeBreakdown(summary.leadTypeCounts)}.`
    );
  }

  if (summary.bombCount > 0) {
    review.push(
      `${summary.bombCount} bomb ${pluralize("play", summary.bombCount)} ${summary.bombCount === 1 ? "was" : "were"} recorded.`
    );
  }

  if (summary.lowHandPressureTurn !== null) {
    review.push(
      `Late-game pressure started around turn ${summary.lowHandPressureTurn}, when you dropped to ${summary.lowestCardsAfterPlay} cards.`
    );
  }

  review.push("The comparisons above are calculated from reconstructed game states and rollouts.");

  return review;
}

type PlayerEventSummary = {
  readonly playCount: number;
  readonly passCount: number;
  readonly voluntaryPassCount: number;
  readonly multiCardShedCount: number;
  readonly cardsShedByMultiCardPlays: number;
  readonly leadCount: number;
  readonly leadTypeCounts: Readonly<Record<string, number>>;
  readonly bombCount: number;
  readonly lowestCardsAfterPlay: number | null;
  readonly lowHandPressureTurn: number | null;
};

function summarizePlayerEvents(events: readonly PublicGameEvent[]): PlayerEventSummary {
  let playCount = 0;
  let passCount = 0;
  let voluntaryPassCount = 0;
  let multiCardShedCount = 0;
  let cardsShedByMultiCardPlays = 0;
  let leadCount = 0;
  let bombCount = 0;
  let lowestCardsAfterPlay: number | null = null;
  let lowHandPressureTurn: number | null = null;
  const leadTypeCounts: Record<string, number> = {};

  for (const event of events) {
    if (event.wasPass) {
      passCount += 1;

      if (event.legalMoveCount > 1) {
        voluntaryPassCount += 1;
      }

      continue;
    }

    playCount += 1;

    if (event.move.type !== "play") {
      continue;
    }

    const handType = getMoveHandType(event);
    const cardsAfterPlay = event.cardsRemainingAfter[event.playerId] ?? null;

    if (event.move.cards.length >= 2) {
      multiCardShedCount += 1;
      cardsShedByMultiCardPlays += event.move.cards.length;
    }

    if (event.currentTrickBefore === null) {
      leadCount += 1;
      leadTypeCounts[handType ?? "unknown"] = (leadTypeCounts[handType ?? "unknown"] ?? 0) + 1;
    }

    if (handType === "bomb") {
      bombCount += 1;
    }

    if (
      cardsAfterPlay !== null &&
      (lowestCardsAfterPlay === null || cardsAfterPlay < lowestCardsAfterPlay)
    ) {
      lowestCardsAfterPlay = cardsAfterPlay;

      if (cardsAfterPlay <= 4 && lowHandPressureTurn === null) {
        lowHandPressureTurn = event.turnNumber;
      }
    }
  }

  return {
    playCount,
    passCount,
    voluntaryPassCount,
    multiCardShedCount,
    cardsShedByMultiCardPlays,
    leadCount,
    leadTypeCounts,
    bombCount,
    lowestCardsAfterPlay,
    lowHandPressureTurn
  };
}

function getMoveHandType(event: PublicGameEvent): HandType | null {
  if (event.move.type === "pass") {
    return null;
  }

  const hand = detectHand(event.move.cards);
  return hand.type === "invalid" ? null : hand.type;
}

function formatHandTypeBreakdown(counts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return "no lead type data";
  }

  return entries
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([type, count]) => `${count} ${formatHandTypeLabel(type)}`)
    .join(", ");
}

function formatHandTypeLabel(type: string): string {
  return type.replaceAll("-", " ");
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

function getConnectionLabel(status: RealtimeConnectionStatus): string {
  if (status === "online") {
    return "Online";
  }

  return status === "waking" ? "Waking server" : "Offline";
}

function getConnectionBadgeClass(status: RealtimeConnectionStatus): string {
  if (status === "online") {
    return "bg-emerald-300 text-emerald-950";
  }

  return status === "waking" ? "bg-amber-300 text-amber-950" : "bg-red-300 text-red-950";
}

function OnlineCard({
  card,
  cardTheme = null,
  selected = false,
  playable = false,
  compact = false
}: {
  readonly card: Card;
  readonly cardTheme?: PublicCosmetic | null;
  readonly selected?: boolean;
  readonly playable?: boolean;
  readonly compact?: boolean;
}) {
  const suitColorClass = getCardSuitColorClass(card.suit);

  return (
    <div
      data-rank={card.rank}
      data-royal={card.rank === "J" || card.rank === "Q" || card.rank === "K"}
      data-suit-symbol={suitSymbol(card.suit)}
      className={cn(
        "card-face relative grid overflow-hidden rounded-md border shadow-xl transition",
        getCardFaceClass(cardTheme),
        getCardFaceRarityClass(cardTheme),
        compact ? "h-20 w-14" : "h-24 w-16 sm:h-28 sm:w-20",
        selected
          ? "border-[var(--gold)] ring-2 ring-[var(--gold)]"
          : playable
            ? "border-[var(--aqua)]/70 shadow-[0_0_20px_rgba(61,214,208,0.16)]"
            : "border-black/20"
      )}
    >
      <span className="card-face-theme-art" aria-hidden="true" />
      <span className="card-face-theme-rail" aria-hidden="true" />
      <span className="card-face-theme-suit" aria-hidden="true" />
      <span className="card-face-royal-mark" aria-hidden="true" />
      <div
        className={cn(
          "card-face-corner absolute left-1.5 top-1.5 z-10 text-left font-black leading-none",
          suitColorClass
        )}
      >
        <div className={compact ? "text-sm" : "text-base sm:text-lg"}>{card.rank}</div>
        <div className={compact ? "text-xs" : "text-sm sm:text-base"}>{suitSymbol(card.suit)}</div>
      </div>
      <div
        className={cn(
          "card-face-emblem relative z-10 self-center justify-self-center text-center",
          suitColorClass
        )}
      >
        <span className={cn("block leading-none", compact ? "text-2xl" : "text-4xl sm:text-5xl")}>
          {suitSymbol(card.suit)}
        </span>
        <span
          className={cn(
            "mt-1 block font-black leading-none tracking-normal",
            compact ? "text-[9px]" : "text-[10px] sm:text-xs"
          )}
        >
          {formatRankName(card.rank)}
        </span>
      </div>
      <div
        className={cn(
          "card-face-corner absolute bottom-1.5 right-1.5 z-10 rotate-180 text-left font-black leading-none",
          suitColorClass
        )}
      >
        <div className={compact ? "text-sm" : "text-base sm:text-lg"}>{card.rank}</div>
        <div className={compact ? "text-xs" : "text-sm sm:text-base"}>{suitSymbol(card.suit)}</div>
      </div>
    </div>
  );
}

function formatCard(card: Card): string {
  return `${card.rank}${suitSymbol(card.suit)}`;
}

function formatCardName(card: Card): string {
  return `${formatRankName(card.rank)} of ${formatSuitName(card.suit)}`;
}

function formatRankName(rank: Card["rank"]): string {
  if (rank === "J") {
    return "Jack";
  }

  if (rank === "Q") {
    return "Queen";
  }

  if (rank === "K") {
    return "King";
  }

  if (rank === "A") {
    return "Ace";
  }

  return rank;
}

function formatSuitName(suit: Card["suit"]): string {
  if (suit === "diamonds") {
    return "diamonds";
  }

  if (suit === "clubs") {
    return "clubs";
  }

  if (suit === "hearts") {
    return "hearts";
  }

  if (suit === "spades") {
    return "spades";
  }

  if (suit === "stars") {
    return "stars";
  }

  return "crowns";
}

function sortHandForDisplay(
  cards: readonly Card[],
  mode: HandSortMode,
  manualCardOrderIds: readonly string[]
): readonly Card[] {
  if (mode === "manual") {
    const orderIndex = new Map(manualCardOrderIds.map((cardId, index) => [cardId, index]));

    return [...cards].sort((left, right) => {
      const leftIndex = orderIndex.get(getCardId(left)) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.get(getCardId(right)) ?? Number.MAX_SAFE_INTEGER;

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return compareCards(left, right);
    });
  }

  if (mode === "suit") {
    return [...cards].sort(compareCardsBySuit);
  }

  if (mode === "sets") {
    const rankCounts = new Map<Card["rank"], number>();

    for (const card of cards) {
      rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    }

    return [...cards].sort((left, right) => {
      const countComparison = (rankCounts.get(right.rank) ?? 0) - (rankCounts.get(left.rank) ?? 0);

      if (countComparison !== 0) {
        return countComparison;
      }

      return compareCards(left, right);
    });
  }

  return [...cards].sort(compareCards);
}

function normalizeManualCardOrder(
  currentOrder: readonly string[],
  cards: readonly Card[]
): readonly string[] {
  const handIds: readonly string[] = cards.map((card) => getCardId(card));
  const handIdSet = new Set(handIds);
  const preservedIds = currentOrder.filter((cardId) => handIdSet.has(cardId));
  const missingIds = handIds.filter((cardId) => !preservedIds.includes(cardId));

  return [...preservedIds, ...missingIds];
}

function getClockwiseSeatedPlayers(
  players: readonly PublicRoomPlayer[],
  yourPlayerId: string | null
): readonly PublicRoomPlayer[] {
  if (players.length <= 1) {
    return players;
  }

  const anchorIndex = players.findIndex((player) => player.id === yourPlayerId);

  if (anchorIndex === -1) {
    return players.slice(0, MAX_CASUAL_PLAYERS_PER_ROOM);
  }

  const anchoredPlayers = [...players.slice(anchorIndex), ...players.slice(0, anchorIndex)].slice(
    0,
    MAX_CASUAL_PLAYERS_PER_ROOM
  );

  return anchoredPlayers;
}

function getSeatPositionClass(position: number, seatCount: number): string {
  const seatLayouts: Readonly<Record<number, readonly string[]>> = {
    1: ["bottom-5 left-1/2 -translate-x-1/2"],
    2: ["bottom-5 left-1/2 -translate-x-1/2", "left-1/2 top-14 -translate-x-1/2"],
    3: [
      "bottom-5 left-1/2 -translate-x-1/2",
      "left-4 top-[44%] -translate-y-1/2 sm:left-6",
      "right-4 top-[44%] -translate-y-1/2 sm:right-6"
    ],
    4: [
      "bottom-5 left-1/2 -translate-x-1/2",
      "left-4 top-1/2 -translate-y-1/2 sm:left-6",
      "left-1/2 top-14 -translate-x-1/2",
      "right-4 top-1/2 -translate-y-1/2 sm:right-6"
    ],
    5: [
      "bottom-5 left-1/2 -translate-x-1/2",
      "left-4 top-[62%] -translate-y-1/2 sm:left-6",
      "left-[16%] top-20 -translate-x-1/2",
      "right-[16%] top-20 translate-x-1/2",
      "right-4 top-[62%] -translate-y-1/2 sm:right-6"
    ],
    6: [
      "bottom-5 left-1/2 -translate-x-1/2",
      "left-4 top-[66%] -translate-y-1/2 sm:left-6",
      "left-4 top-[31%] -translate-y-1/2 sm:left-6",
      "left-1/2 top-14 -translate-x-1/2",
      "right-4 top-[31%] -translate-y-1/2 sm:right-6",
      "right-4 top-[66%] -translate-y-1/2 sm:right-6"
    ]
  };

  return (
    seatLayouts[seatCount]?.[position] ??
    CLASSIC_CLOCKWISE_SEAT_LAYOUT[position] ??
    CLASSIC_CLOCKWISE_SEAT_LAYOUT[0] ??
    ""
  );
}

function getSeatHandOrientation(position: number, seatCount: number): "top" | "left" | "right" {
  if (
    seatCount === 2 ||
    position === seatCount / 2 ||
    (seatCount === 5 && (position === 2 || position === 3))
  ) {
    return "top";
  }

  return position < seatCount / 2 ? "left" : "right";
}

function getTrickEntryOffset(
  position: number,
  seatCount: number
): {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
} {
  if (position <= 0) {
    return { x: 0, y: 220, rotate: 4 };
  }

  const lastIndex = seatCount - 1;
  const midpoint = lastIndex / 2;

  if (position === Math.round(midpoint) && seatCount % 2 === 0) {
    return { x: 0, y: -130, rotate: -4 };
  }

  const side = position <= midpoint ? -1 : 1;
  const verticalBias = Math.abs(position - midpoint) / Math.max(1, midpoint);

  return {
    x: side * (150 + verticalBias * 70),
    y: -32 + verticalBias * 92,
    rotate: side * (5 + verticalBias * 5)
  };
}

function loadHandSortMode(): HandSortMode {
  if (typeof window === "undefined") {
    return "rank";
  }

  const savedMode = window.localStorage.getItem(HAND_SORT_STORAGE_KEY);

  return HAND_SORT_OPTIONS.some((option) => option.mode === savedMode)
    ? (savedMode as HandSortMode)
    : "rank";
}

function compareCardsBySuit(left: Card, right: Card): number {
  const suitComparison = getSuitStrength(left.suit) - getSuitStrength(right.suit);

  if (suitComparison !== 0) {
    return suitComparison;
  }

  return getRankStrength(left.rank) - getRankStrength(right.rank);
}

function formatHandType(type: string): string {
  return type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRatingDelta(delta: number | null): string {
  if (delta === null) {
    return "rating";
  }

  return delta >= 0 ? `+${delta}` : `${delta}`;
}

function getMaxCardsPerPlayer(deckType: DeckType, playerCount: number): number {
  const deckSize = getDeckSize(deckType);
  return Math.max(DEFAULT_CARDS_PER_PLAYER, Math.floor(deckSize / playerCount));
}

function getMaxPlayersForSetup(deckType: DeckType, cardsPerPlayer: number): number {
  return Math.min(MAX_CASUAL_PLAYERS_PER_ROOM, Math.floor(getDeckSize(deckType) / cardsPerPlayer));
}

function getDeckSize(deckType: DeckType): number {
  return deckType === "arena-six" ? 78 : 52;
}

function ordinal(value: number): string {
  const suffix =
    value % 10 === 1 && value % 100 !== 11
      ? "st"
      : value % 10 === 2 && value % 100 !== 12
        ? "nd"
        : value % 10 === 3 && value % 100 !== 13
          ? "rd"
          : "th";

  return `${value}${suffix} place`;
}

function getRoomPlayerName(room: PublicRoomState | null, playerId: string): string {
  return room?.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function suitSymbol(suit: Card["suit"]): string {
  switch (suit) {
    case "diamonds":
      return "♦";
    case "clubs":
      return "♣";
    case "hearts":
      return "♥";
    case "spades":
      return "♠";
    case "stars":
      return "★";
    case "crowns":
      return "♛";
  }
}

function getCardSuitColorClass(suit: Card["suit"]): string {
  if (suit === "diamonds" || suit === "hearts") {
    return "text-red-600";
  }

  if (suit === "stars") {
    return "text-amber-600";
  }

  if (suit === "crowns") {
    return "text-violet-700";
  }

  return "text-zinc-950";
}
