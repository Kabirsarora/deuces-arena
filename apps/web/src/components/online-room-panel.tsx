"use client";

import {
  compareCards,
  detectHand,
  generateLegalMoves,
  getCardId,
  getRankStrength,
  getSuitStrength,
  type Card,
  type DeckType,
  type GameEvent,
  type HandType,
  type Move
} from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  FeedbackKind,
  PublicBotDifficulty,
  PublicBotPace,
  PublicChatMessage,
  PublicCosmetic,
  PublicFeedbackReceipt,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicOpenRoom,
  PublicRankedQueueState,
  PublicRoomPlayer,
  PublicRoomState,
  ProfileAvatarKey,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  Copy,
  Crown,
  DoorOpen,
  Gauge,
  History,
  ListOrdered,
  LogOut,
  MessageCircle,
  Palette,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  Users,
  X
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { io, type Socket } from "socket.io-client";

import { SignInWithGoogleButton, SignOutButton } from "@/components/auth-buttons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OnlineHubMode = "bots" | "casual" | "ranked";
type ActiveTablePanel = "chat" | "rules";
type HandSortMode = "rank" | "suit" | "sets" | "manual";
type AuthUser = {
  readonly profileId: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly image: string | null;
};

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const ROOM_SESSION_KEY = "deuces-arena-room-session";
const GUEST_ID_KEY = "deuces-arena-guest-id";
const HAND_SORT_STORAGE_KEY = "deuces-arena-hand-sort";
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
  "3 of diamonds starts and must be included in the first play.",
  "Follow the lead type: single, pair, trips, full house, or exact-length straight.",
  "Straights must match the exact length that opened the trick.",
  "Players may pass even when they have a legal higher play.",
  "A bomb is four of a kind plus one kicker and can beat normal hands.",
  "When everyone else passes, the last player to make a valid play leads the next trick."
];
const MANUAL_CARD_DRAG_STEP_PX = 58;
const FEEDBACK_KIND_OPTIONS: readonly { readonly value: FeedbackKind; readonly label: string }[] = [
  { value: "BUG", label: "Bug" },
  { value: "IDEA", label: "Idea" },
  { value: "UI", label: "UI" },
  { value: "BALANCE", label: "Balance" }
];
const CLASSIC_CLOCKWISE_SEAT_LAYOUT: readonly string[] = [
  "bottom-5 left-1/2 -translate-x-1/2",
  "left-4 top-1/2 -translate-y-1/2 sm:left-6",
  "left-1/2 top-14 -translate-x-1/2",
  "right-4 top-1/2 -translate-y-1/2 sm:right-6"
];

export function OnlineRoomPanel({ authUser }: { readonly authUser: AuthUser | null }) {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const lastCompletionRefreshRef = useRef<string | null>(null);
  const lastDealAnimationKeyRef = useRef<string | null>(null);
  const lastObservedChatKeyRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
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
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [dealAnimationKey, setDealAnimationKey] = useState<string | null>(null);
  const [handDealtVisible, setHandDealtVisible] = useState(true);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [message, setMessage] = useState("Create a room, invite a friend, or start with bots.");

  const selectedCards = useMemo(
    () => room?.yourHand.filter((card) => selectedCardIds.includes(getCardId(card))) ?? [],
    [room?.yourHand, selectedCardIds]
  );
  const displayedHand = useMemo(
    () => sortHandForDisplay(room?.yourHand ?? [], handSortMode, manualCardOrderIds),
    [handSortMode, manualCardOrderIds, room?.yourHand]
  );
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
  const activePlayer = room?.players.find((player) => player.id === room.activePlayerId) ?? null;
  const turnStatus =
    activePlayer?.kind === "bot"
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
    setManualCardOrderIds((current) => normalizeManualCardOrder(current, room?.yourHand ?? []));
  }, [room?.yourHand]);

  useLayoutEffect(() => {
    if (room?.status !== "in-progress" || room.turnNumber !== 0 || room.yourHand.length === 0) {
      setDealAnimationKey(null);
      setHandDealtVisible(true);
      return;
    }

    const nextDealAnimationKey = `${room.roomCode}-${room.yourHand
      .map((card) => getCardId(card))
      .join(".")}`;

    if (lastDealAnimationKeyRef.current === nextDealAnimationKey) {
      return;
    }

    lastDealAnimationKeyRef.current = nextDealAnimationKey;
    setDealAnimationKey(nextDealAnimationKey);
    setHandDealtVisible(false);

    const revealHandTimeout = window.setTimeout(() => setHandDealtVisible(true), 850);
    const clearDealTimeout = window.setTimeout(() => setDealAnimationKey(null), 2400);

    return () => {
      window.clearTimeout(revealHandTimeout);
      window.clearTimeout(clearDealTimeout);
    };
  }, [room]);

  useEffect(() => {
    const inviteCode = getRoomCodeFromUrl();

    if (inviteCode !== null) {
      setJoinCode(inviteCode);
      setMessage(`Invite loaded for room ${inviteCode}.`);
    }

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
      autoConnect: true
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setMessage("Connected to realtime server.");
      refreshProfile(socket, getActiveProfileId(), setProfile);
      refreshLeaderboard(socket, setLeaderboard);
      refreshLobby(socket, setLobby);
      refreshRankedQueue(socket, setRankedQueue);
      refreshMatchHistory(socket, getActiveProfileId(), setMatchHistory);
      refreshCosmetics(socket, setCosmetics);
      const session = loadRoomSession();

      if (session !== null) {
        socket.emit("room:reconnect", session, (ack) => {
          if (ack.ok) {
            setRoom(ack.data);
            setMessage("Reconnected to room.");
          }
        });
      }
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setMessage("Disconnected from realtime server.");
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
    socket.on("chat:message", (chatMessage) => {
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

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
      avatarKey: profile?.avatarKey ?? profileAvatarKey,
      ...player.stats,
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
  }, [profile?.equippedCosmetics, profile?.unlocks, room]);

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
    setBotSeats((current) => Math.min(current, availableBotSeats));
  }, [availableBotSeats]);

  useEffect(() => {
    setCardsPerPlayer((current) => Math.min(current, getMaxCardsPerPlayer(deckType, playerCount)));
  }, [deckType, playerCount]);

  useEffect(() => {
    if (room?.turnTimer?.deadlineAt === null || room?.turnTimer === null) {
      return;
    }

    setTimerNow(Date.now());
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, [room?.turnTimer]);

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
        saveRoomSession(createAck.data);
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
            botPace
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
        botPace
      },
      handleRoomAck("Game started.")
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
        saveRoomSession(ack.data);
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
        playerName={playerName}
        authUser={authUser}
        profile={profile}
        profileDisplayName={profileDisplayName}
        profileAvatarKey={profileAvatarKey}
        hubMode={hubMode}
        joinCode={joinCode}
        lobby={lobby}
        rankedQueue={rankedQueue}
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
        onBotSeatsChange={setBotSeats}
        onDeckTypeChange={setDeckType}
        onPlayerCountChange={setPlayerCount}
        onCardsPerPlayerChange={setCardsPerPlayer}
        onTimerEnabledChange={setLobbyTimerEnabled}
        onTimerSecondsChange={setTurnTimerSeconds}
        onBombEndsTrickChange={setBombEndsTrick}
        onBotDifficultyChange={setBotDifficulty}
        onBotPaceChange={setBotPace}
        onEquipCosmetic={equipCosmetic}
        onSubmitFeedback={submitFeedback}
      />
    );
  }

  if (room.status === "waiting") {
    return (
      <OnlineWaitingRoom
        room={room}
        connected={connected}
        message={message}
        botSeats={selectedBotSeats}
        maxBotSeats={availableBotSeats}
        deckType={deckType}
        playerCount={selectedPlayerCount}
        cardsPerPlayer={selectedCardsPerPlayer}
        timerEnabled={lobbyTimerEnabled}
        timerSeconds={turnTimerSeconds}
        bombEndsTrick={bombEndsTrick}
        botDifficulty={botDifficulty}
        botPace={botPace}
        roomCanStart={roomCanStart}
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
        onBotSeatsChange={setBotSeats}
        onDeckTypeChange={setDeckType}
        onPlayerCountChange={setPlayerCount}
        onCardsPerPlayerChange={setCardsPerPlayer}
        onTimerEnabledChange={setLobbyTimerEnabled}
        onTimerSecondsChange={setTurnTimerSeconds}
        onBombEndsTrickChange={setBombEndsTrick}
        onBotDifficultyChange={setBotDifficulty}
        onBotPaceChange={setBotPace}
      />
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 text-white sm:px-5 lg:px-8">
      <section className="mx-auto grid w-full max-w-[100rem] gap-3 lg:h-[calc(100vh-1.5rem)] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
        <ActiveRoomBar
          room={room}
          connected={connected}
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

        <section className="relative min-h-[28rem] lg:min-h-0">
          <OnlineTable
            room={room}
            timerNow={timerNow}
            dealAnimationKey={dealAnimationKey}
            onCreateBotGame={createBotGame}
            onLeaveRoom={leaveRoom}
          />
          <ActiveTableDrawer
            panel={activeTablePanel}
            room={room}
            onClose={() => setActiveTablePanel(null)}
            onSendChat={sendChat}
          />
        </section>

        <section className="hand-dock border border-white/10 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Your Hand</p>
              <p className="text-xs text-zinc-400">
                {isYourTurn
                  ? playableCardCount === 0 && canPass
                    ? "No legal play available · pass to continue"
                    : `${selectedCards.length} selected · ${legalMoves.length} legal options`
                  : turnStatus}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <div className="flex rounded-full border border-white/10 bg-black/24 p-1">
                {HAND_SORT_OPTIONS.map((option) => (
                  <button
                    key={option.mode}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-black transition",
                      handSortMode === option.mode
                        ? "bg-[var(--gold)] text-black"
                        : "text-zinc-400 hover:bg-white/8 hover:text-white"
                    )}
                    type="button"
                    onClick={() => setHandSortMode(option.mode)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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

          <div className="flex min-h-28 items-end overflow-x-auto px-1 pb-2 pt-5 sm:min-h-32">
            <div className="flex items-end gap-1 sm:gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {(handDealtVisible ? displayedHand : []).map((card, index) => {
                  const selected = selectedCardIds.includes(getCardId(card));
                  const playable = isYourTurn && playableCardIds.has(getCardId(card));

                  return (
                    <motion.button
                      key={getCardId(card)}
                      layout
                      type="button"
                      className="shrink-0 rounded-md disabled:cursor-default"
                      initial={
                        dealAnimationKey === null
                          ? { opacity: 0, y: 42, scale: 0.96 }
                          : {
                              opacity: 0,
                              x: 220 - index * 18,
                              y: -260,
                              scale: 0.72,
                              rotate: index % 2 === 0 ? -8 : 8
                            }
                      }
                      animate={{ opacity: 1, y: selected ? -18 : 0, scale: selected ? 1.03 : 1 }}
                      exit={{
                        opacity: 0,
                        x: Math.max(-140, Math.min(140, (index - displayedHand.length / 2) * 18)),
                        y: -280,
                        scale: 0.72,
                        rotate: index % 2 === 0 ? -10 : 10
                      }}
                      transition={{
                        delay: dealAnimationKey === null ? 0 : Math.min(0.65, index * 0.045),
                        type: "spring",
                        stiffness: 300,
                        damping: 32,
                        mass: 0.85
                      }}
                      drag="x"
                      dragSnapToOrigin
                      dragElastic={0.18}
                      dragMomentum={false}
                      onDragStart={() => setHandSortMode("manual")}
                      onDragEnd={(_event, info) => handleManualCardDrag(card, info)}
                      {...(isYourTurn
                        ? {
                            whileHover: {
                              y: selected ? -20 : -8
                            }
                          }
                        : {})}
                      onClick={() => toggleCard(card)}
                    >
                      <OnlineCard card={card} selected={selected} playable={playable} />
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function OnlineLobbyHub({
  connected,
  playerName,
  authUser,
  profile,
  profileDisplayName,
  profileAvatarKey,
  hubMode,
  joinCode,
  lobby,
  rankedQueue,
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
  onSubmitFeedback
}: {
  readonly connected: boolean;
  readonly playerName: string;
  readonly authUser: AuthUser | null;
  readonly profile: PublicGuestProfile | null;
  readonly profileDisplayName: string;
  readonly profileAvatarKey: ProfileAvatarKey;
  readonly hubMode: OnlineHubMode;
  readonly joinCode: string;
  readonly lobby: PublicLobbyState | null;
  readonly rankedQueue: PublicRankedQueueState | null;
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
  readonly onSubmitFeedback: (input: {
    readonly kind: FeedbackKind;
    readonly body: string;
    readonly contactEmail: string;
  }) => Promise<ServerAck<PublicFeedbackReceipt>>;
}) {
  const activity = lobby?.activity;
  const openRooms = lobby?.openRooms ?? [];
  const selectedBotSeats = Math.min(botSeats, maxBotSeats);

  return (
    <main className="min-h-screen px-3 py-8 text-white sm:px-5 lg:px-8">
      <section className="online-hub mx-auto min-h-[calc(100vh-4rem)] w-full max-w-[92rem] overflow-hidden rounded-[1.25rem] border border-white/10 shadow-2xl">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:p-8">
          <section className="flex min-h-0 flex-col">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[var(--aqua)]">
                  Deuces Arena
                </p>
                <h1 className="text-3xl font-black sm:text-4xl">Choose a Table</h1>
                <p className="mt-2 text-sm font-semibold text-zinc-400">
                  {activity?.connectedUsers ?? 0} online · {activity?.playersInActiveGames ?? 0}{" "}
                  playing · {activity?.openRooms ?? 0} open rooms
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-black",
                    connected ? "bg-emerald-300 text-emerald-950" : "bg-red-300 text-red-950"
                  )}
                >
                  {connected ? "Online" : "Offline"}
                </span>
              </div>
            </header>

            <div className="mb-5 grid grid-cols-3 gap-2 rounded-full border border-white/10 bg-black/30 p-1.5">
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
            </div>

            <div className="grid gap-4">
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
                      max={MAX_CASUAL_PLAYERS_PER_ROOM}
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
                  meta={`${activity?.openRooms ?? 0} open · ${activity?.playersInActiveGames ?? 0} playing`}
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
                  onJoin={onJoinRanked}
                  onLeave={onLeaveRanked}
                />
              ) : null}
            </div>

            <p className="mt-auto pt-5 text-sm font-semibold text-zinc-300">{message}</p>
          </section>

          <aside className="grid content-start gap-4">
            <MinimalProfileCard
              playerName={playerName}
              authUser={authUser}
              profile={profile}
              profileDisplayName={profileDisplayName}
              profileAvatarKey={profileAvatarKey}
              onPlayerNameChange={onPlayerNameChange}
              onProfileDisplayNameChange={onProfileDisplayNameChange}
              onProfileAvatarKeyChange={onProfileAvatarKeyChange}
              onProfileSave={onProfileSave}
            />

            <details className="online-panel p-4">
              <summary className="cursor-pointer list-none text-sm font-black">More</summary>
              <div className="mt-3 grid gap-3">
                <LeaderboardSummary entries={leaderboard} />
                <MatchHistorySummary entries={matchHistory} />
                <FeedbackSummary
                  defaultEmail={authUser?.email ?? ""}
                  onSubmitFeedback={onSubmitFeedback}
                />
                <RulesSummary />
                <CosmeticsSummary
                  cosmetics={cosmetics}
                  profile={profile}
                  onEquip={onEquipCosmetic}
                />
              </div>
            </details>
          </aside>
        </div>
      </section>
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
      className={cn(
        "flex min-h-14 items-center justify-center gap-3 rounded-full text-sm font-black transition sm:text-base",
        active
          ? "bg-[var(--table)] text-white shadow-lg"
          : "text-zinc-400 hover:bg-white/8 hover:text-white"
      )}
      type="button"
      onClick={() => onSelect(mode)}
    >
      {icon}
      {label}
    </button>
  );
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
  onEnabledChange,
  onSecondsChange
}: {
  readonly enabled: boolean;
  readonly seconds: number;
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
        disabled={!enabled}
        onChange={(event) => onSecondsChange(Number(event.target.value))}
      />
      <p className="mt-1 text-zinc-400">{seconds}s per turn</p>
    </div>
  );
}

function CompactBotDifficulty({
  value,
  onChange
}: {
  readonly value: PublicBotDifficulty;
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
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompactBotPace({
  value,
  onChange
}: {
  readonly value: PublicBotPace;
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
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-zinc-400">
        Relaxed adds a longer pause before each bot move.
      </p>
    </div>
  );
}

function CompactDeckControl({
  value,
  onChange
}: {
  readonly value: DeckType;
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
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-zinc-400">
        Arena 6 adds ★ Stars and ♛ Crowns above spades.
      </p>
    </div>
  );
}

function CompactRuleToggle({
  label,
  enabled,
  onChange
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex min-h-20 items-center justify-between gap-3 rounded-[1.1rem] border border-white/10 bg-black/22 p-4 text-sm font-bold">
      <span>
        {label}
        <span className="mt-1 block text-xs font-semibold text-zinc-400">
          A bomb immediately wins the trick.
        </span>
      </span>
      <input
        className="size-4 shrink-0 accent-[var(--gold)]"
        type="checkbox"
        checked={enabled}
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
    <div className="mt-5">
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
  onJoin,
  onLeave
}: {
  readonly queue: PublicRankedQueueState | null;
  readonly profile: PublicGuestProfile | null;
  readonly connected: boolean;
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProfileMetric label="Queued" value={`${queuedPlayers}/${requiredPlayers}`} />
        <ProfileMetric label="Position" value={queuePosition} />
        <ProfileMetric label="ETA" value={etaLabel} />
        <ProfileMetric label="Your ELO" value={profile?.rating ?? 1000} />
      </div>
      <Button
        className="mt-6 h-14 w-full text-lg"
        disabled={!connected}
        variant={joined ? "secondary" : "primary"}
        onClick={joined ? onLeave : onJoin}
      >
        {joined ? "Leave Queue" : "Find Ranked Match"}
      </Button>
    </section>
  );
}

function MinimalProfileCard({
  playerName,
  authUser,
  profile,
  profileDisplayName,
  profileAvatarKey,
  onPlayerNameChange,
  onProfileDisplayNameChange,
  onProfileAvatarKeyChange,
  onProfileSave
}: {
  readonly playerName: string;
  readonly authUser: AuthUser | null;
  readonly profile: PublicGuestProfile | null;
  readonly profileDisplayName: string;
  readonly profileAvatarKey: ProfileAvatarKey;
  readonly onPlayerNameChange: (value: string) => void;
  readonly onProfileDisplayNameChange: (value: string) => void;
  readonly onProfileAvatarKeyChange: (value: ProfileAvatarKey) => void;
  readonly onProfileSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const accountName = authUser?.name ?? authUser?.email ?? null;

  return (
    <section className="online-panel p-5">
      <div className="flex items-center gap-3">
        <ProfileAvatar avatarKey={profile?.avatarKey ?? profileAvatarKey} />
        <div className="min-w-0">
          <p className="truncate text-lg font-black">{profile?.displayName ?? playerName}</p>
          <p className="text-sm text-zinc-400">{profile?.rating ?? 1000} rating</p>
        </div>
      </div>
      <div className="mt-4 rounded-[1rem] border border-white/10 bg-black/20 p-3">
        {authUser === null ? (
          <>
            <p className="text-xs font-bold uppercase text-zinc-500">Guest profile</p>
            <p className="mt-1 text-sm text-zinc-300">
              Sign in to keep rating, match history, and cosmetics across devices.
            </p>
            <SignInWithGoogleButton className="mt-3 h-10 w-full" />
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase text-emerald-300">Signed in</p>
            <p className="mt-1 truncate text-sm font-bold text-zinc-200">{accountName}</p>
            <SignOutButton className="mt-3 h-10 w-full" />
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
    </section>
  );
}

function ActiveRoomBar({
  room,
  connected,
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
  readonly connected: boolean;
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
    <header className="hud-glass flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 px-3 py-2 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "size-3 shrink-0 rounded-full",
            connected ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.45)]" : "bg-red-300"
          )}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {room === null ? "Realtime Table" : `${formatMatchMode(room.mode)} Table`}
          </p>
          <p className="truncate text-xs text-zinc-400">{room === null ? message : turnStatus}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
  message,
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
  roomCanStart,
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
  onBotDifficultyChange,
  onBotPaceChange
}: {
  readonly room: PublicRoomState;
  readonly connected: boolean;
  readonly message: string;
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
  readonly roomCanStart: boolean;
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
  readonly onBotDifficultyChange: (difficulty: PublicBotDifficulty) => void;
  readonly onBotPaceChange: (pace: PublicBotPace) => void;
}) {
  const seatedHumans = room.players.filter((player) => player.kind === "human").length;
  const seatsNeeded = Math.max(0, playerCount - room.players.length - botSeats);
  const inviteUrl = getRoomInviteUrl(room.roomCode);

  return (
    <main className="min-h-screen px-3 py-8 text-white sm:px-5 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[92rem] gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="waiting-room-table relative grid min-h-[38rem] place-items-center overflow-hidden px-5 py-10 text-center">
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

          <WaitingSeats players={room.players} botSeats={botSeats} />

          <div className="relative z-10 w-[min(38rem,92vw)] rounded-[1.5rem] border border-white/12 bg-black/42 px-5 py-5 text-white shadow-2xl backdrop-blur">
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
          </div>

          <p className="absolute bottom-6 left-1/2 z-10 w-[min(40rem,90vw)] -translate-x-1/2 text-sm font-semibold text-zinc-300">
            {message}
          </p>
        </section>

        <aside className="online-panel grid content-start gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-[var(--aqua)]">Room Setup</p>
              <h1 className="text-xl font-black">Casual Table</h1>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-xs font-black",
                connected ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"
              )}
            >
              {connected ? "Online" : "Offline"}
            </span>
          </div>

          <CompactRange
            label="Table seats"
            value={playerCount}
            min={Math.max(2, room.players.length)}
            max={MAX_CASUAL_PLAYERS_PER_ROOM}
            disabled={!connected}
            onChange={onPlayerCountChange}
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
            disabled={!connected}
            onChange={onBotSeatsChange}
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

          <Button className="h-12" variant={yourReady ? "secondary" : "primary"} onClick={onReady}>
            <CheckCircle2 className="size-4" />
            {yourReady ? "Ready" : "Mark Ready"}
          </Button>
          <Button className="h-12" disabled={!roomCanStart} onClick={onStart}>
            <Play className="size-4" />
            {botSeats > 0 ? `Start With ${botSeats} Bot${botSeats === 1 ? "" : "s"}` : "Start Game"}
          </Button>
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
  botSeats
}: {
  readonly players: readonly PublicRoomPlayer[];
  readonly botSeats: number;
}) {
  const visibleSeats = [
    ...players.map((player) => ({
      id: player.id,
      label: player.name,
      detail: player.ready ? "ready" : player.kind,
      kind: player.kind
    })),
    ...Array.from({ length: botSeats }).map((_, index) => ({
      id: `bot-preview-${index}`,
      label: `Bot ${index + 1}`,
      detail: "queued",
      kind: "bot" as const
    }))
  ].slice(0, 4);
  const seatPositions = [
    "left-1/2 top-[12%] -translate-x-1/2",
    "right-[8%] top-1/2 -translate-y-1/2",
    "left-1/2 bottom-[9%] -translate-x-1/2",
    "left-[8%] top-1/2 -translate-y-1/2"
  ];

  return (
    <>
      {visibleSeats.map((seat, index) => (
        <div
          key={seat.id}
          className={cn(
            "seat-panel absolute z-10 flex min-w-44 items-center gap-3 border px-3 py-2 text-left",
            seatPositions[index]
          )}
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-black/30 text-sm font-black">
            {seat.kind === "bot" ? (
              <Bot className="size-5 text-[var(--aqua)]" />
            ) : (
              seat.label.slice(0, 1).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-sm font-black">{seat.label}</p>
            <p className="text-xs text-zinc-400">{seat.detail}</p>
          </div>
        </div>
      ))}
    </>
  );
}

function saveRoomSession(room: PublicRoomState): void {
  if (room.yourPlayerId === null) {
    return;
  }

  window.localStorage.setItem(
    ROOM_SESSION_KEY,
    JSON.stringify({
      roomCode: room.roomCode,
      playerId: room.yourPlayerId
    })
  );
}

function removeRoomSession(): void {
  window.localStorage.removeItem(ROOM_SESSION_KEY);
}

function loadRoomSession(): { readonly roomCode: string; readonly playerId: string } | null {
  const rawSession = window.localStorage.getItem(ROOM_SESSION_KEY);

  if (rawSession === null) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as {
      roomCode?: unknown;
      playerId?: unknown;
    };

    if (typeof parsedSession.roomCode === "string" && typeof parsedSession.playerId === "string") {
      return {
        roomCode: parsedSession.roomCode,
        playerId: parsedSession.playerId
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
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  return url.toString();
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

function ProfileAvatar({ avatarKey }: { readonly avatarKey: ProfileAvatarKey }) {
  return (
    <div
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border text-lg shadow-lg",
        avatarKey === "heart"
          ? "border-rose-200/40 bg-rose-500/15 text-rose-100"
          : avatarKey === "spade"
            ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
            : avatarKey === "club"
              ? "border-emerald-200/35 bg-emerald-400/12 text-emerald-100"
              : "border-sky-200/35 bg-sky-400/12 text-sky-100"
      )}
    >
      {getAvatarSymbol(avatarKey)}
    </div>
  );
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

function MatchHistorySummary({ entries }: { readonly entries: readonly PublicMatchHistoryItem[] }) {
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

      <div className="mt-3 grid gap-2">
        {entries.length === 0 ? (
          <p className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-400">
            Completed online matches will appear here.
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.matchId}
              className="rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2"
            >
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
                {entry.movesPlayed ?? 0} moves · {entry.bombsPlayed} bombs ·{" "}
                {entry.roomCode ?? "archived"}
              </p>
            </div>
          ))
        )}
      </div>
    </details>
  );
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

function RulesSummary() {
  return (
    <details className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">
        <span className="flex items-center gap-2">
          <BookOpen className="size-4 text-[var(--gold)]" />
          Rules
        </span>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs font-normal text-zinc-300">
          Deuces
        </span>
      </summary>

      <ul className="mt-3 grid gap-2">
        {DEUCES_RULES.map((rule) => (
          <li
            key={rule}
            className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-300"
          >
            {rule}
          </li>
        ))}
      </ul>
    </details>
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
  cosmetics,
  profile,
  onEquip
}: {
  readonly cosmetics: readonly PublicCosmetic[];
  readonly profile: PublicGuestProfile | null;
  readonly onEquip: (cosmetic: PublicCosmetic) => void;
}) {
  const visibleCosmetics = cosmetics.slice(0, 4);
  const unlockedIds = new Set(profile?.unlocks.map((unlock) => unlock.cosmetic.id) ?? []);
  const equippedIds = new Set(
    profile?.equippedCosmetics.map((equippedCosmetic) => equippedCosmetic.cosmetic.id) ?? []
  );

  return (
    <details className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">
        <span className="flex items-center gap-2">
          <Palette className="size-4 text-[var(--gold)]" />
          Cosmetics
        </span>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs font-normal text-zinc-300">
          {cosmetics.length}
        </span>
      </summary>

      <div className="mt-3 grid gap-2">
        {visibleCosmetics.length === 0 ? (
          <p className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-400">
            Cosmetic catalog loads from the realtime server.
          </p>
        ) : (
          visibleCosmetics.map((cosmetic) => (
            <div
              key={cosmetic.id}
              className="flex items-center gap-3 rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2"
            >
              <CosmeticPreview cosmetic={cosmetic} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{cosmetic.name}</p>
                <p className="text-[11px] text-zinc-400">
                  {formatCosmeticKind(cosmetic.kind)} · {getCosmeticOwnershipLabel(cosmetic)}
                </p>
              </div>
              <CosmeticAction
                cosmetic={cosmetic}
                owned={unlockedIds.has(cosmetic.id)}
                equipped={equippedIds.has(cosmetic.id)}
                onEquip={onEquip}
              />
            </div>
          ))
        )}
      </div>
    </details>
  );
}

function CosmeticAction({
  cosmetic,
  owned,
  equipped,
  onEquip
}: {
  readonly cosmetic: PublicCosmetic;
  readonly owned: boolean;
  readonly equipped: boolean;
  readonly onEquip: (cosmetic: PublicCosmetic) => void;
}) {
  if (equipped) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-black uppercase text-emerald-200">
        Equipped
      </span>
    );
  }

  if (owned) {
    return (
      <Button className="h-7 shrink-0 px-2 text-[10px]" size="sm" onClick={() => onEquip(cosmetic)}>
        Equip
      </Button>
    );
  }

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase",
        cosmetic.isSupporter ? "bg-[var(--gold)]/18 text-[var(--gold)]" : "bg-white/8 text-zinc-300"
      )}
    >
      {cosmetic.isSupporter ? "Supporter" : cosmetic.rarity}
    </span>
  );
}

function getCosmeticOwnershipLabel(cosmetic: PublicCosmetic): string {
  if (cosmetic.isSupporter) {
    return "supporter";
  }

  return cosmetic.rarity;
}

function CosmeticPreview({ cosmetic }: { readonly cosmetic: PublicCosmetic }) {
  if (cosmetic.kind === "CARD_BACK") {
    return (
      <div className="grid h-12 w-9 shrink-0 place-items-center rounded-md border border-white/20 bg-[linear-gradient(135deg,#e11d48,#7f1d1d)] shadow-lg">
        <div className="h-7 w-4 rounded-sm border border-white/45" />
      </div>
    );
  }

  if (cosmetic.kind === "TABLE_THEME") {
    return (
      <div className="h-10 w-12 shrink-0 rounded-[50%] border border-emerald-200/25 bg-[radial-gradient(circle,#134e4a,#042f2e_70%)] shadow-lg" />
    );
  }

  if (cosmetic.kind === "PROFILE_BORDER") {
    return (
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[var(--gold)] bg-black/30 shadow-lg">
        <Sparkles className="size-4 text-[var(--gold)]" />
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
  onSendChat
}: {
  readonly panel: ActiveTablePanel | null;
  readonly room: PublicRoomState | null;
  readonly onClose: () => void;
  readonly onSendChat: (body: string) => void;
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
        <RoomChat messages={room?.recentChat ?? []} disabled={room === null} onSend={onSendChat} />
      ) : null}

      {panel === "rules" ? <TableRulesPanel room={room} /> : null}
    </aside>
  );
}

function TableRulesPanel({ room }: { readonly room: PublicRoomState | null }) {
  const bombRule =
    room?.rules.bombEndsTrick === true
      ? "Bombs immediately end the trick; no stronger bomb response is allowed."
      : "After a bomb, only a stronger bomb can answer.";
  const suitOrder =
    room?.rules.deckType === "arena-six"
      ? "Diamonds, clubs, hearts, spades, stars, crowns from low to high. Stars and crowns are placeholder Arena 6 suits."
      : "Diamonds, clubs, hearts, spades from low to high.";
  const highestCard = room?.rules.deckType === "arena-six" ? "2 of crowns" : "2 of spades";

  return (
    <div className="grid gap-3">
      <div className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
        <p className="text-xs font-black uppercase text-[var(--gold)]">Rank order</p>
        <p className="mt-2 text-sm font-bold text-zinc-100">3 4 5 6 7 8 9 10 J Q K A 2</p>
        <p className="mt-2 text-xs text-zinc-400">
          {suitOrder} 3 of diamonds is lowest; {highestCard} is highest.
        </p>
      </div>

      <ol className="grid gap-2">
        {[...DEUCES_RULES, bombRule].map((rule, index) => (
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
  onSend
}: {
  readonly messages: readonly PublicChatMessage[];
  readonly disabled: boolean;
  readonly onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

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
        <span className="text-[10px] text-zinc-500">{messages.length} recent</span>
      </div>

      <div className="mt-2 max-h-28 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="py-3 text-center text-xs text-zinc-500">No messages yet.</p>
        ) : (
          messages.slice(-4).map((chatMessage) => (
            <div key={chatMessage.id} className="mb-2 last:mb-0">
              <p className="truncate text-[11px] font-bold text-zinc-300">
                {chatMessage.playerName}
              </p>
              <p className="break-words text-xs text-zinc-400">{chatMessage.body}</p>
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

function OnlineTable({
  room,
  timerNow,
  dealAnimationKey,
  onCreateBotGame,
  onLeaveRoom
}: {
  readonly room: PublicRoomState | null;
  readonly timerNow: number;
  readonly dealAnimationKey: string | null;
  readonly onCreateBotGame: () => void;
  readonly onLeaveRoom: () => void;
}) {
  const players = room?.players ?? [];
  const yourPlayer = players.find((player) => player.id === room?.yourPlayerId) ?? players[0];
  const seatedPlayers = getClockwiseSeatedPlayers(players, room?.yourPlayerId ?? null);
  const tableTheme =
    yourPlayer === undefined ? null : getEquippedCosmetic(yourPlayer, "TABLE_THEME");
  const timerLabel = formatTurnTimer(room, timerNow);
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
    const timeout = window.setTimeout(() => setVisiblePassKey(null), 1400);

    return () => window.clearTimeout(timeout);
  }, [latestPass?.eventKey]);

  return (
    <section
      className={cn(
        "table-felt table-oval relative h-full min-h-[28rem] overflow-hidden border border-white/10 p-3 sm:min-h-[34rem] lg:min-h-0 lg:p-5",
        getTableThemeClass(tableTheme)
      )}
    >
      <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-bold uppercase text-zinc-300 backdrop-blur">
        <CircleDot className="size-3 text-[var(--aqua)]" />
        {room === null ? "No table" : `${formatMatchMode(room.mode)} table`}
      </div>

      <AnimatePresence>
        {dealAnimationKey !== null ? <DealAnimationOverlay key={dealAnimationKey} /> : null}
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
        seatedPlayers.map((player, index) => (
          <OnlineSeat
            key={player.id}
            player={player}
            active={room?.activePlayerId === player.id}
            position={index}
            seatCount={seatedPlayers.length}
            onOpenStats={() => setSelectedStatsPlayerId(player.id)}
          />
        ))
      ) : null}

      <AnimatePresence>
        {selectedStatsPlayer !== null ? (
          <PlayerStatsPopover
            key={selectedStatsPlayer.id}
            player={selectedStatsPlayer}
            onClose={() => setSelectedStatsPlayerId(null)}
          />
        ) : null}
      </AnimatePresence>

      <div className="relative z-10 grid h-full min-h-[26rem] place-items-center text-center sm:min-h-[30rem] lg:min-h-0">
        <div className="trick-island w-[min(32rem,86vw)] px-5 py-6">
          <p className="text-xs font-semibold uppercase text-zinc-400">
            {currentLeadName === null ? "Current Trick" : `Last play by ${currentLeadName}`}
          </p>
          <h2 className="mt-1 text-2xl font-black">
            {room?.currentTrick === null || room === null
              ? "Open table"
              : formatHandType(room.currentTrick.hand.type)}
          </h2>
          {timerLabel !== null ? (
            <p className="mx-auto mt-2 w-fit rounded-full border border-white/10 bg-black/24 px-3 py-1 text-xs font-bold text-[var(--gold)]">
              {timerLabel}
            </p>
          ) : null}
          <div className="mt-5 flex min-h-28 flex-wrap justify-center gap-2">
            <AnimatePresence mode="popLayout">
              {room?.currentTrick === null || room === null ? (
                <motion.div
                  className="rounded-full border border-dashed border-white/18 bg-black/18 px-7 py-7 text-sm text-zinc-300"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                >
                  Waiting for the next lead.
                </motion.div>
              ) : (
                room.currentTrick.hand.cards.map((card, index) => (
                  <motion.div
                    key={`${room.turnNumber}-${getCardId(card)}`}
                    layout
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
                      delay: Math.min(0.28, index * 0.055),
                      type: "spring",
                      stiffness: 280,
                      damping: 30,
                      mass: 0.9
                    }}
                  >
                    <OnlineCard card={card} compact />
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
  onLeaveRoom
}: {
  readonly room: PublicRoomState;
  readonly onCreateBotGame: () => void;
  readonly onLeaveRoom: () => void;
}) {
  const rows = getPlacementRows(room);
  const [showReview, setShowReview] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [selectedStatsPlayerId, setSelectedStatsPlayerId] = useState<string | null>(null);
  const review = getPlayerMatchReview(room);
  const timeline = getMoveTimelineRows(room);
  const selectedStatsPlayer =
    room.players.find((player) => player.id === selectedStatsPlayerId) ?? null;

  return (
    <motion.div
      className="mx-auto mt-5 w-[min(24rem,92vw)] rounded-[1rem] border border-[var(--gold)]/50 bg-black/42 p-3 text-left shadow-2xl backdrop-blur"
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
          <ul className="mt-2 grid gap-1.5 text-xs text-zinc-300">
            {review.map((item) => (
              <li key={item} className="rounded-[0.7rem] bg-white/7 px-2 py-1.5">
                {item}
              </li>
            ))}
          </ul>
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
        <Button size="sm" variant="secondary" onClick={() => setShowReview((current) => !current)}>
          <Gauge className="size-4" />
          {showReview ? "Hide review" : "Review decisions"}
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
            onClose={() => setSelectedStatsPlayerId(null)}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function DealAnimationOverlay() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/18 backdrop-blur-[1px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div className="relative h-44 w-64">
        <motion.div
          className="absolute left-1/2 top-1/2 h-24 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border border-[var(--gold)]/60 bg-[#142a4f] shadow-2xl"
          initial={{ rotate: -8, scale: 0.92 }}
          animate={{ rotate: [0, -12, 10, -5, 0], scale: [0.92, 1.02, 0.98, 1] }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
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
              x: `calc(-50% + ${(index - 4) * 22}px)`,
              y: `calc(-50% + ${Math.abs(index - 4) * 5}px)`,
              rotate: (index - 4) * 7,
              opacity: [0, 1, 1, 0],
              scale: [0.96, 1, 1, 0.9]
            }}
            transition={{
              delay: 0.14 + index * 0.055,
              duration: 1.65,
              ease: "easeInOut"
            }}
          >
            <div className="m-2 h-[calc(100%-1rem)] rounded border border-white/12 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.18),transparent_34%),linear-gradient(135deg,rgba(242,193,78,0.22),transparent_45%)]" />
          </motion.div>
        ))}
        <motion.p
          className="absolute inset-x-0 bottom-0 text-center text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
          transition={{ duration: 1.7, delay: 0.24 }}
        >
          Shuffling
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
  const cardBack = getEquippedCosmetic(player, "CARD_BACK");
  const seatPosition = getSeatPositionClass(position, seatCount);

  return (
    <div
      className={cn(
        "seat-panel absolute z-20 flex w-[min(13.5rem,calc(100%-2rem))] items-center justify-between gap-2 border px-2.5 py-2 sm:w-56",
        seatPosition,
        active
          ? "border-[var(--gold)] bg-[rgba(242,193,78,0.13)] shadow-[0_0_36px_rgba(242,193,78,0.14)]"
          : profileBorder !== null
            ? "border-[var(--gold)]/55"
            : "border-white/10"
      )}
    >
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border text-xs font-black",
          player.connected
            ? "border-emerald-200/35 bg-emerald-400/12 text-emerald-100"
            : "border-zinc-500/35 bg-zinc-500/12 text-zinc-300"
        )}
      >
        {player.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <button
          className="block max-w-full truncate text-left text-sm font-bold underline-offset-4 transition hover:text-[var(--gold)] hover:underline"
          type="button"
          onClick={onOpenStats}
        >
          {player.name}
        </button>
        <p className="text-xs text-zinc-400">
          {player.cardsRemaining} cards · {player.connected ? "online" : "away"}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <OnlineMiniCardStack count={Math.min(player.cardsRemaining, 3)} cardBack={cardBack} />
        <span
          className={cn(
            "hidden rounded-full px-2 py-1 text-[10px] font-black sm:block",
            player.ready ? "bg-emerald-400/15 text-emerald-200" : "bg-white/7 text-zinc-300"
          )}
        >
          {player.ready ? "Ready" : player.kind}
        </span>
      </div>
    </div>
  );
}

function PlayerStatsPopover({
  player,
  onClose
}: {
  readonly player: PublicRoomPlayer;
  readonly onClose: () => void;
}) {
  const stats = player.stats;

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
    </motion.aside>
  );
}

function OnlineMiniCardStack({
  count,
  cardBack
}: {
  readonly count: number;
  readonly cardBack: PublicCosmetic | null;
}) {
  return (
    <div className="relative hidden h-8 w-10 sm:block">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`online-card-back-${index}`}
          className={cn(
            "card-back absolute h-8 w-5 rounded-sm border border-white/15 shadow-lg",
            getCardBackClass(cardBack)
          )}
          style={{
            left: index * 7,
            transform: `rotate(${(index - 1) * 5}deg)`
          }}
        />
      ))}
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

  return "";
}

function getCardBackClass(cosmetic: PublicCosmetic | null): string {
  if (cosmetic?.slug === "classic-red-card-back") {
    return "card-back-classic-red";
  }

  return "";
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

function formatTimelineMove(event: GameEvent): string {
  if (event.wasPass || event.move.type === "pass") {
    return "Passed";
  }

  const handType = getMoveHandType(event);
  const cardList = event.move.cards.map(formatCard).join(" ");
  const legalContext =
    event.legalMoveCount === 1 ? "1 legal option" : `${event.legalMoveCount} legal options`;

  return `${handType === null ? "Played" : formatHandType(handType)}: ${cardList} · ${legalContext}`;
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
      `${summary.voluntaryPassCount} passes happened while at least one playable response likely existed. Those turns are good candidates for later simulation review.`
    );
  } else if (summary.passCount > 0) {
    review.push(
      "Your passes appear to be forced or low-choice spots based on the legal move counts."
    );
  }

  if (summary.multiCardShedCount > 0) {
    review.push(
      `${summary.multiCardShedCount} plays shed multiple cards, removing ${summary.cardsShedByMultiCardPlays} cards total. Multi-card sheds are usually the first replay moments to inspect.`
    );
  } else {
    review.push(
      "No multi-card sheds were visible, so the match may have left too many cards moving one at a time."
    );
  }

  if (summary.leadCount > 0) {
    review.push(
      `You led ${summary.leadCount} ${pluralize("trick", summary.leadCount)}: ${formatHandTypeBreakdown(summary.leadTypeCounts)}. Lead choices shape the table, so these are useful coach targets.`
    );
  }

  if (summary.bombCount > 0) {
    review.push(
      `${summary.bombCount} bomb ${pluralize("play", summary.bombCount)} ${summary.bombCount === 1 ? "was" : "were"} recorded. Later review can compare whether saving it changed placement odds.`
    );
  }

  if (summary.lowHandPressureTurn !== null) {
    review.push(
      `Late-game pressure started around turn ${summary.lowHandPressureTurn}, when you dropped to ${summary.lowestCardsAfterPlay} cards.`
    );
  }

  review.push(
    "Next step for stronger coaching: run simulations from these replay spots instead of guessing from fixed strategy rules."
  );

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

function summarizePlayerEvents(events: readonly GameEvent[]): PlayerEventSummary {
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

function getMoveHandType(event: GameEvent): HandType | null {
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

function OnlineCard({
  card,
  selected = false,
  playable = false,
  compact = false
}: {
  readonly card: Card;
  readonly selected?: boolean;
  readonly playable?: boolean;
  readonly compact?: boolean;
}) {
  const red = card.suit === "diamonds" || card.suit === "hearts";
  const special = card.suit === "stars" || card.suit === "crowns";

  return (
    <motion.div
      layout
      className={cn(
        "card-face grid rounded-md border p-2 shadow-xl transition",
        compact ? "h-20 w-14" : "h-24 w-16 sm:h-28 sm:w-20",
        selected
          ? "border-[var(--gold)] ring-2 ring-[var(--gold)]"
          : playable
            ? "border-[var(--aqua)]/70 shadow-[0_0_24px_rgba(61,214,208,0.18)]"
            : "border-black/12",
        !compact && !playable && !selected ? "opacity-72 saturate-75" : ""
      )}
    >
      <div
        className={cn(
          "text-left font-black leading-none",
          red ? "text-red-600" : special ? "text-amber-600" : "text-zinc-950"
        )}
      >
        <div className={compact ? "text-base" : "text-lg"}>{card.rank}</div>
        <div className={compact ? "text-sm" : "text-base"}>{suitSymbol(card.suit)}</div>
      </div>
      <div
        className={cn(
          "self-center text-center text-3xl font-black",
          red ? "text-red-600" : special ? "text-amber-600" : "text-zinc-950"
        )}
      >
        {suitSymbol(card.suit)}
      </div>
    </motion.div>
  );
}

function formatCard(card: Card): string {
  return `${card.rank}${suitSymbol(card.suit)}`;
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
  const deckSize = deckType === "arena-six" ? 78 : 52;
  return Math.max(DEFAULT_CARDS_PER_PLAYER, Math.floor(deckSize / playerCount));
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
