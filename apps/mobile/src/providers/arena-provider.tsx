import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeckType, Move } from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  FeedbackKind,
  ProfileAvatarKey,
  PublicBotDifficulty,
  PublicBotPace,
  PublicChatMessage,
  PublicCosmetic,
  PublicFeedbackReceipt,
  PublicGuestProfile,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicRankedQueueState,
  PublicRoomState,
  PublicTournamentQueueState,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { io, type Socket } from "socket.io-client";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "https://api.deucesarena.com";
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://deucesarena.com";
const GUEST_ID_KEY = "deuces-arena-mobile-guest-id";
const PLAYER_NAME_KEY = "deuces-arena-mobile-player-name";
const ROOM_SESSION_KEY = "deuces-arena-mobile-room-session";
const ACCOUNT_SESSION_KEY = "deuces-arena-mobile-account-session";

type ConnectionStatus = "waking" | "online" | "offline";

type BotGameOptions = {
  readonly playerCount: number;
  readonly botCount: number;
  readonly cardsPerPlayer: number;
  readonly deckType: DeckType;
  readonly difficulty: PublicBotDifficulty;
  readonly pace: PublicBotPace;
};

type StoredRoomSession = {
  readonly roomCode: string;
  readonly playerId: string;
  readonly guestId: string;
};

export type MobileAccountSession = {
  readonly token: string;
  readonly expiresAt: string;
  readonly profileId: string;
  readonly displayName: string | null;
  readonly imageUrl: string | null;
};

type ArenaContextValue = {
  readonly connectionStatus: ConnectionStatus;
  readonly serverUrl: string;
  readonly account: MobileAccountSession | null;
  readonly accountWorking: boolean;
  readonly guestId: string | null;
  readonly playerName: string;
  readonly profile: PublicGuestProfile | null;
  readonly cosmetics: readonly PublicCosmetic[];
  readonly matchHistory: readonly PublicMatchHistoryItem[];
  readonly lobby: PublicLobbyState | null;
  readonly rankedQueue: PublicRankedQueueState | null;
  readonly tournamentQueue: PublicTournamentQueueState | null;
  readonly room: PublicRoomState | null;
  readonly notice: string;
  readonly createBotGame: (options: BotGameOptions) => Promise<boolean>;
  readonly createCasualRoom: () => Promise<boolean>;
  readonly startCurrentRoom: (botCount: number) => Promise<boolean>;
  readonly joinRoom: (roomCode: string) => Promise<boolean>;
  readonly joinRanked: () => Promise<boolean>;
  readonly leaveRanked: () => Promise<boolean>;
  readonly joinTournament: () => Promise<boolean>;
  readonly leaveTournament: () => Promise<boolean>;
  readonly leaveRoom: () => Promise<void>;
  readonly submitMove: (move: Move) => Promise<boolean>;
  readonly sendChat: (body: string) => Promise<boolean>;
  readonly equipCosmetic: (cosmeticId: string) => Promise<boolean>;
  readonly purchaseCosmetic: (cosmeticId: string) => Promise<boolean>;
  readonly submitFeedback: (kind: FeedbackKind, body: string) => Promise<boolean>;
  readonly updateProfile: (displayName: string, avatarKey: ProfileAvatarKey) => Promise<boolean>;
  readonly refreshProfileData: () => void;
  readonly refreshLobby: () => void;
  readonly signInWithGoogle: () => Promise<void>;
  readonly signOutAccount: () => Promise<void>;
};

const ArenaContext = createContext<ArenaContextValue | null>(null);

export function ArenaProvider({ children }: { readonly children: ReactNode }) {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const guestIdRef = useRef<string | null>(null);
  const playerNameRef = useRef("Player");
  const completedRoomRef = useRef<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [account, setAccount] = useState<MobileAccountSession | null>(null);
  const [accountWorking, setAccountWorking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("waking");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("Player");
  const [profile, setProfile] = useState<PublicGuestProfile | null>(null);
  const [cosmetics, setCosmetics] = useState<readonly PublicCosmetic[]>([]);
  const [matchHistory, setMatchHistory] = useState<readonly PublicMatchHistoryItem[]>([]);
  const [lobby, setLobby] = useState<PublicLobbyState | null>(null);
  const [rankedQueue, setRankedQueue] = useState<PublicRankedQueueState | null>(null);
  const [tournamentQueue, setTournamentQueue] = useState<PublicTournamentQueueState | null>(null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [notice, setNotice] = useState("Connecting to live tables...");

  useEffect(() => {
    let disposed = false;

    async function restoreAccount() {
      const stored = await readAccountSession();
      if (disposed) return;
      setAccount(stored);
      setAuthReady(true);
    }

    void restoreAccount();
    return () => {
      disposed = true;
    };
  }, []);

  const refreshLobby = useCallback(() => {
    const socket = socketRef.current;
    if (socket === null || !socket.connected) return;

    socket.emit("lobby:get", (ack) => {
      if (ack.ok) setLobby(ack.data);
    });
    socket.emit("ranked:get", (ack) => {
      if (ack.ok) setRankedQueue(ack.data);
    });
    socket.emit("tournament:get", (ack) => {
      if (ack.ok) setTournamentQueue(ack.data);
    });
  }, []);

  const refreshProfileDataForGuest = useCallback((activeGuestId: string) => {
    const socket = socketRef.current;
    if (socket === null || !socket.connected) return;

    socket.emit("profile:get", { guestId: activeGuestId }, (ack) => {
      if (!ack.ok) return;
      setProfile(ack.data);
      if (ack.data.displayName !== null) {
        playerNameRef.current = ack.data.displayName;
        setPlayerName(ack.data.displayName);
      }
    });
    socket.emit("cosmetics:list", (ack) => {
      if (ack.ok) setCosmetics(ack.data);
    });
    socket.emit("profile:history", { guestId: activeGuestId, limit: 12 }, (ack) => {
      if (ack.ok) setMatchHistory(ack.data);
    });
  }, []);

  const refreshProfileData = useCallback(() => {
    if (guestIdRef.current !== null) refreshProfileDataForGuest(guestIdRef.current);
  }, [refreshProfileDataForGuest]);

  const signInWithGoogle = useCallback(async () => {
    setAccountWorking(true);
    setNotice("Opening secure Google sign-in...");

    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${WEB_URL}/mobile-connect`,
        "deucesarena://auth"
      );

      if (result.type !== "success") {
        setNotice("Google sign-in was cancelled.");
        return;
      }

      const callback = Linking.parse(result.url);
      const handoff = firstQueryValue(callback.queryParams?.handoff);

      if (handoff === null) {
        setNotice("The website did not return a valid account connection.");
        return;
      }

      const response = await fetch(`${SERVER_URL}/auth/mobile/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffToken: handoff })
      });
      const body = (await response.json()) as Partial<MobileAccountSession> & { error?: string };

      if (
        !response.ok ||
        typeof body.token !== "string" ||
        typeof body.expiresAt !== "string" ||
        typeof body.profileId !== "string"
      ) {
        setNotice(body.error ?? "Unable to connect this Google account.");
        return;
      }

      const session: MobileAccountSession = {
        token: body.token,
        expiresAt: body.expiresAt,
        profileId: body.profileId,
        displayName: normalizeDisplayName(firstQueryValue(callback.queryParams?.name)),
        imageUrl: normalizeImageUrl(firstQueryValue(callback.queryParams?.image))
      };
      await writeAccountSession(session);
      await AsyncStorage.removeItem(ROOM_SESSION_KEY);
      setRoom(null);
      setProfile(null);
      setMatchHistory([]);
      setAccount(session);
      setNotice("Google account connected. Syncing your Arena profile...");
    } catch {
      setNotice("Unable to complete Google sign-in. Please try again.");
    } finally {
      setAccountWorking(false);
    }
  }, []);

  const signOutAccount = useCallback(async () => {
    setAccountWorking(true);
    await deleteAccountSession();
    await AsyncStorage.removeItem(ROOM_SESSION_KEY);
    setRoom(null);
    setProfile(null);
    setMatchHistory([]);
    setAccount(null);
    setNotice("Signed out. Continuing with your guest profile.");
    setAccountWorking(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;

    let disposed = false;
    let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

    async function connect() {
      const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      const localGuestId = storedGuestId ?? createGuestId();
      const activeGuestId = account?.profileId ?? localGuestId;
      const storedName = await AsyncStorage.getItem(PLAYER_NAME_KEY);

      if (storedGuestId === null) await AsyncStorage.setItem(GUEST_ID_KEY, localGuestId);
      if (disposed) return;

      guestIdRef.current = activeGuestId;
      playerNameRef.current = account?.displayName ?? storedName ?? "Player";
      setGuestId(activeGuestId);
      setPlayerName(playerNameRef.current);
      setConnectionStatus("waking");
      setProfile(null);
      setMatchHistory([]);

      socket = io(SERVER_URL, {
        autoConnect: true,
        ...(account === null ? {} : { auth: { token: account.token } }),
        reconnection: true,
        timeout: 75_000,
        transports: ["websocket", "polling"]
      });
      socketRef.current = socket;

      socket.on("connect", async () => {
        setConnectionStatus("online");
        setNotice("Connected to Deuces Arena.");
        refreshLobby();
        if (account === null) {
          refreshProfileDataForGuest(activeGuestId);
        } else {
          socket?.emit(
            "profile:sync-account",
            { displayName: account.displayName, imageUrl: account.imageUrl },
            (ack) => {
              if (ack.ok) {
                setProfile(ack.data);
                playerNameRef.current = ack.data.displayName ?? playerNameRef.current;
                setPlayerName(playerNameRef.current);
              } else {
                setNotice(ack.error);
              }
              refreshProfileDataForGuest(activeGuestId);
            }
          );
        }

        const storedRoom = await readStoredRoomSession();
        if (storedRoom === null || storedRoom.guestId !== activeGuestId || !socket?.connected)
          return;

        socket.emit(
          "room:reconnect",
          {
            roomCode: storedRoom.roomCode,
            playerId: storedRoom.playerId,
            guestId: activeGuestId
          },
          (ack) => {
            if (ack.ok) {
              setRoom(ack.data);
              setNotice(`Rejoined table ${ack.data.roomCode}.`);
              return;
            }
            void AsyncStorage.removeItem(ROOM_SESSION_KEY);
          }
        );
      });
      socket.on("disconnect", () => {
        setConnectionStatus("offline");
        setNotice("Connection lost. Reconnecting automatically...");
      });
      socket.on("connect_error", (error) => {
        if (account !== null && error.message.includes("Invalid or expired account session")) {
          void deleteAccountSession();
          setAccount(null);
          setNotice("Your mobile session expired. Sign in again to restore account features.");
          return;
        }
        setConnectionStatus("offline");
        setNotice("The free server may be waking up. We will keep trying.");
      });
      socket.on("room:state", setRoom);
      socket.on("lobby:state", setLobby);
      socket.on("ranked:state", setRankedQueue);
      socket.on("tournament:state", setTournamentQueue);
      socket.on("chat:message", (message: PublicChatMessage) => {
        setRoom((current) => {
          if (current === null || current.recentChat.some((item) => item.id === message.id)) {
            return current;
          }
          return { ...current, recentChat: [...current.recentChat, message].slice(-50) };
        });
      });
      socket.on("game:error", ({ message }) => setNotice(message));
    }

    void connect();
    return () => {
      disposed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [account, authReady, refreshLobby, refreshProfileDataForGuest]);

  useEffect(() => {
    if (room?.yourPlayerId === null || room?.yourPlayerId === undefined || guestId === null) return;

    const session: StoredRoomSession = {
      roomCode: room.roomCode,
      playerId: room.yourPlayerId,
      guestId
    };
    void AsyncStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(session));
  }, [guestId, room?.roomCode, room?.yourPlayerId]);

  useEffect(() => {
    if (room?.status !== "complete" || completedRoomRef.current === room.roomCode) return;
    completedRoomRef.current = room.roomCode;
    refreshProfileData();
  }, [refreshProfileData, room?.roomCode, room?.status]);

  const createCasualRoom = useCallback(async () => {
    const identity = activeIdentity(socketRef.current, guestIdRef.current);
    if (identity === null) {
      setNotice("Still connecting to the arena.");
      return false;
    }

    const ack = await emitWithAck<PublicRoomState>((callback) =>
      identity.socket.emit(
        "room:create",
        { playerName: playerNameRef.current, guestId: identity.guestId },
        callback
      )
    );
    return handleRoomAck(ack, setRoom, setNotice);
  }, []);

  const createBotGame = useCallback(async (options: BotGameOptions) => {
    const identity = activeIdentity(socketRef.current, guestIdRef.current);
    if (identity === null) {
      setNotice("Still connecting to the arena.");
      return false;
    }

    const createAck = await emitWithAck<PublicRoomState>((callback) =>
      identity.socket.emit(
        "room:create",
        { playerName: playerNameRef.current, guestId: identity.guestId },
        callback
      )
    );
    if (!createAck.ok) {
      setNotice(createAck.error);
      return false;
    }

    const startAck = await emitWithAck<PublicRoomState>((callback) =>
      identity.socket.emit(
        "room:start",
        {
          roomCode: createAck.data.roomCode,
          botCount: options.botCount,
          botDifficulty: options.difficulty,
          botPace: options.pace,
          rules: {
            bombEndsTrick: false,
            deckType: options.deckType,
            playerCount: options.playerCount,
            cardsPerPlayer: options.cardsPerPlayer
          },
          timer: { enabled: false, secondsPerTurn: 45 },
          trade: { enabled: false }
        },
        callback
      )
    );
    return handleRoomAck(startAck, setRoom, setNotice);
  }, []);

  const joinRoom = useCallback(async (roomCode: string) => {
    const identity = activeIdentity(socketRef.current, guestIdRef.current);
    if (identity === null) {
      setNotice("Still connecting to the arena.");
      return false;
    }

    const ack = await emitWithAck<PublicRoomState>((callback) =>
      identity.socket.emit(
        "room:join",
        {
          roomCode: roomCode.trim().toUpperCase(),
          playerName: playerNameRef.current,
          guestId: identity.guestId
        },
        callback
      )
    );
    return handleRoomAck(ack, setRoom, setNotice);
  }, []);

  const joinRanked = useCallback(async () => {
    const socket = socketRef.current;
    if (account === null) {
      setNotice("Sign in with Google before joining ranked.");
      return false;
    }
    if (socket === null || !socket.connected) return false;

    const ack = await emitWithAck<PublicRankedQueueState>((callback) =>
      socket.emit("ranked:join", { playerName: playerNameRef.current }, callback)
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return false;
    }
    setRankedQueue(ack.data);
    setNotice("Joined the ranked queue.");
    return true;
  }, [account]);

  const leaveRanked = useCallback(async () => {
    const socket = socketRef.current;
    if (socket === null || !socket.connected) return false;

    const ack = await emitWithAck<PublicRankedQueueState>((callback) =>
      socket.emit("ranked:leave", callback)
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return false;
    }
    setRankedQueue(ack.data);
    setNotice("Left the ranked queue.");
    return true;
  }, []);

  const joinTournament = useCallback(async () => {
    const socket = socketRef.current;
    if (account === null) {
      setNotice("Sign in with Google before joining a tournament.");
      return false;
    }
    if (socket === null || !socket.connected) return false;

    const ack = await emitWithAck<PublicTournamentQueueState>((callback) =>
      socket.emit("tournament:join", { playerName: playerNameRef.current }, callback)
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return false;
    }
    setTournamentQueue(ack.data);
    setNotice("Joined the tournament queue.");
    return true;
  }, [account]);

  const leaveTournament = useCallback(async () => {
    const socket = socketRef.current;
    if (socket === null || !socket.connected) return false;

    const ack = await emitWithAck<PublicTournamentQueueState>((callback) =>
      socket.emit("tournament:leave", callback)
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return false;
    }
    setTournamentQueue(ack.data);
    setNotice("Left the tournament queue.");
    return true;
  }, []);

  const startCurrentRoom = useCallback(
    async (botCount: number) => {
      const socket = socketRef.current;
      if (socket === null || room === null) return false;

      const ack = await emitWithAck<PublicRoomState>((callback) =>
        socket.emit(
          "room:start",
          {
            roomCode: room.roomCode,
            botCount,
            botDifficulty: room.botDifficulty,
            botPace: room.botPace,
            rules: room.rules,
            timer: { enabled: false, secondsPerTurn: 45 },
            trade: { enabled: false }
          },
          callback
        )
      );
      return handleRoomAck(ack, setRoom, setNotice);
    },
    [room]
  );

  const leaveRoom = useCallback(async () => {
    const socket = socketRef.current;
    if (socket === null || room === null) return;

    const ack = await emitWithAck((callback) =>
      socket.emit("room:leave", { roomCode: room.roomCode }, callback)
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return;
    }
    setRoom(null);
    await AsyncStorage.removeItem(ROOM_SESSION_KEY);
    setNotice("Left the table.");
    refreshLobby();
  }, [refreshLobby, room]);

  const submitMove = useCallback(
    async (move: Move) => {
      const socket = socketRef.current;
      if (socket === null || room === null) return false;

      const ack = await emitWithAck<PublicRoomState>((callback) =>
        socket.emit("game:move", { roomCode: room.roomCode, move }, callback)
      );
      return handleRoomAck(ack, setRoom, setNotice);
    },
    [room]
  );

  const sendChat = useCallback(
    async (body: string) => {
      const socket = socketRef.current;
      if (socket === null || room === null || body.trim() === "") return false;

      const ack = await emitWithAck<PublicChatMessage>((callback) =>
        socket.emit("chat:send", { roomCode: room.roomCode, body }, callback)
      );
      if (!ack.ok) {
        setNotice(ack.error);
        return false;
      }
      return true;
    },
    [room]
  );

  const equipCosmetic = useCallback(async (cosmeticId: string) => {
    const identity = activeIdentity(socketRef.current, guestIdRef.current);
    if (identity === null) return false;

    const ack = await emitWithAck<PublicGuestProfile>((callback) =>
      identity.socket.emit("cosmetics:equip", { guestId: identity.guestId, cosmeticId }, callback)
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return false;
    }
    setProfile(ack.data);
    setNotice("Cosmetic equipped.");
    return true;
  }, []);

  const purchaseCosmetic = useCallback(async (cosmeticId: string) => {
    const identity = activeIdentity(socketRef.current, guestIdRef.current);
    if (identity === null) return false;

    const ack = await emitWithAck<PublicGuestProfile>((callback) =>
      identity.socket.emit(
        "cosmetics:purchase",
        { guestId: identity.guestId, cosmeticId },
        callback
      )
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return false;
    }
    setProfile(ack.data);
    setNotice("Cosmetic unlocked.");
    return true;
  }, []);

  const submitFeedback = useCallback(
    async (kind: FeedbackKind, body: string) => {
      const socket = socketRef.current;
      const activeGuestId = guestIdRef.current;
      if (socket === null || !socket.connected || activeGuestId === null) return false;

      const ack = await emitWithAck<PublicFeedbackReceipt>((callback) =>
        socket.emit(
          "feedback:submit",
          {
            kind,
            body,
            guestId: activeGuestId,
            ...(room === null ? {} : { roomCode: room.roomCode })
          },
          callback
        )
      );
      if (!ack.ok) {
        setNotice(ack.error);
        return false;
      }
      setNotice("Thanks. Your feedback was received.");
      return true;
    },
    [room]
  );

  const updateProfile = useCallback(async (displayName: string, avatarKey: ProfileAvatarKey) => {
    const identity = activeIdentity(socketRef.current, guestIdRef.current);
    if (identity === null) return false;

    const ack = await emitWithAck<PublicGuestProfile>((callback) =>
      identity.socket.emit(
        "profile:update",
        { guestId: identity.guestId, displayName, avatarKey },
        callback
      )
    );
    if (!ack.ok) {
      setNotice(ack.error);
      return false;
    }

    await AsyncStorage.setItem(PLAYER_NAME_KEY, ack.data.displayName ?? displayName);
    playerNameRef.current = ack.data.displayName ?? displayName;
    setPlayerName(playerNameRef.current);
    setProfile(ack.data);
    setNotice("Profile updated.");
    return true;
  }, []);

  const value = useMemo<ArenaContextValue>(
    () => ({
      connectionStatus,
      serverUrl: SERVER_URL,
      account,
      accountWorking,
      guestId,
      playerName,
      profile,
      cosmetics,
      matchHistory,
      lobby,
      rankedQueue,
      tournamentQueue,
      room,
      notice,
      createBotGame,
      createCasualRoom,
      startCurrentRoom,
      joinRoom,
      joinRanked,
      leaveRanked,
      joinTournament,
      leaveTournament,
      leaveRoom,
      submitMove,
      sendChat,
      equipCosmetic,
      purchaseCosmetic,
      submitFeedback,
      updateProfile,
      refreshProfileData,
      refreshLobby,
      signInWithGoogle,
      signOutAccount
    }),
    [
      connectionStatus,
      account,
      accountWorking,
      cosmetics,
      createBotGame,
      createCasualRoom,
      guestId,
      equipCosmetic,
      joinRoom,
      joinRanked,
      leaveRanked,
      joinTournament,
      leaveTournament,
      leaveRoom,
      lobby,
      matchHistory,
      notice,
      playerName,
      profile,
      purchaseCosmetic,
      rankedQueue,
      refreshLobby,
      room,
      sendChat,
      submitFeedback,
      submitMove,
      startCurrentRoom,
      tournamentQueue,
      updateProfile,
      refreshProfileData,
      signInWithGoogle,
      signOutAccount
    ]
  );

  return <ArenaContext.Provider value={value}>{children}</ArenaContext.Provider>;
}

export function useArena(): ArenaContextValue {
  const value = useContext(ArenaContext);
  if (value === null) throw new Error("useArena must be used inside ArenaProvider.");
  return value;
}

function createGuestId(): string {
  return `guest-mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readAccountSession(): Promise<MobileAccountSession | null> {
  const stored = await readSecureValue(ACCOUNT_SESSION_KEY);
  if (stored === null) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<MobileAccountSession>;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      typeof parsed.profileId !== "string" ||
      new Date(parsed.expiresAt).getTime() <= Date.now()
    ) {
      await deleteAccountSession();
      return null;
    }

    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt,
      profileId: parsed.profileId,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null
    };
  } catch {
    await deleteAccountSession();
    return null;
  }
}

async function writeAccountSession(session: MobileAccountSession): Promise<void> {
  const value = JSON.stringify(session);
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.setItemAsync(ACCOUNT_SESSION_KEY, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
    });
    return;
  }
  await AsyncStorage.setItem(ACCOUNT_SESSION_KEY, value);
}

async function readSecureValue(key: string): Promise<string | null> {
  return (await SecureStore.isAvailableAsync())
    ? SecureStore.getItemAsync(key)
    : AsyncStorage.getItem(key);
}

async function deleteAccountSession(): Promise<void> {
  if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(ACCOUNT_SESSION_KEY);
  await AsyncStorage.removeItem(ACCOUNT_SESSION_KEY);
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const normalized = first?.trim();
  return normalized === undefined || normalized === "" ? null : normalized;
}

function normalizeImageUrl(value: string | null): string | null {
  if (value === null || !value.startsWith("https://") || value.length > 500) return null;
  return value;
}

function normalizeDisplayName(value: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (normalized === undefined || normalized.length < 2) return null;
  return normalized.slice(0, 18);
}

async function readStoredRoomSession(): Promise<StoredRoomSession | null> {
  const stored = await AsyncStorage.getItem(ROOM_SESSION_KEY);
  if (stored === null) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<StoredRoomSession>;
    return typeof parsed.roomCode === "string" &&
      typeof parsed.playerId === "string" &&
      typeof parsed.guestId === "string"
      ? { roomCode: parsed.roomCode, playerId: parsed.playerId, guestId: parsed.guestId }
      : null;
  } catch {
    return null;
  }
}

function activeIdentity(
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null,
  guestId: string | null
): {
  readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  readonly guestId: string;
} | null {
  return socket !== null && socket.connected && guestId !== null ? { socket, guestId } : null;
}

function emitWithAck<T = undefined>(
  emit: (callback: (ack: ServerAck<T>) => void) => void
): Promise<ServerAck<T>> {
  return new Promise((resolve) => emit(resolve));
}

function handleRoomAck(
  ack: ServerAck<PublicRoomState>,
  setRoom: (room: PublicRoomState) => void,
  setNotice: (notice: string) => void
): boolean {
  if (!ack.ok) {
    setNotice(ack.error);
    return false;
  }
  setRoom(ack.data);
  setNotice(`Joined table ${ack.data.roomCode}.`);
  return true;
}
