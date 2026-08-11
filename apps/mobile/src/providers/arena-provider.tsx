import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeckType, Move } from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  ProfileAvatarKey,
  PublicBotDifficulty,
  PublicBotPace,
  PublicGuestProfile,
  PublicLobbyState,
  PublicRankedQueueState,
  PublicRoomState,
  PublicTournamentQueueState,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
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
const GUEST_ID_KEY = "deuces-arena-mobile-guest-id";
const PLAYER_NAME_KEY = "deuces-arena-mobile-player-name";

type ConnectionStatus = "waking" | "online" | "offline";

type BotGameOptions = {
  readonly playerCount: number;
  readonly botCount: number;
  readonly cardsPerPlayer: number;
  readonly deckType: DeckType;
  readonly difficulty: PublicBotDifficulty;
  readonly pace: PublicBotPace;
};

type ArenaContextValue = {
  readonly connectionStatus: ConnectionStatus;
  readonly serverUrl: string;
  readonly guestId: string | null;
  readonly playerName: string;
  readonly profile: PublicGuestProfile | null;
  readonly lobby: PublicLobbyState | null;
  readonly rankedQueue: PublicRankedQueueState | null;
  readonly tournamentQueue: PublicTournamentQueueState | null;
  readonly room: PublicRoomState | null;
  readonly notice: string;
  readonly createBotGame: (options: BotGameOptions) => Promise<boolean>;
  readonly createCasualRoom: () => Promise<boolean>;
  readonly startCurrentRoom: (botCount: number) => Promise<boolean>;
  readonly joinRoom: (roomCode: string) => Promise<boolean>;
  readonly leaveRoom: () => Promise<void>;
  readonly submitMove: (move: Move) => Promise<boolean>;
  readonly updateProfile: (displayName: string, avatarKey: ProfileAvatarKey) => Promise<boolean>;
  readonly refreshLobby: () => void;
};

const ArenaContext = createContext<ArenaContextValue | null>(null);

export function ArenaProvider({ children }: { readonly children: ReactNode }) {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const guestIdRef = useRef<string | null>(null);
  const playerNameRef = useRef("Player");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("waking");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("Player");
  const [profile, setProfile] = useState<PublicGuestProfile | null>(null);
  const [lobby, setLobby] = useState<PublicLobbyState | null>(null);
  const [rankedQueue, setRankedQueue] = useState<PublicRankedQueueState | null>(null);
  const [tournamentQueue, setTournamentQueue] = useState<PublicTournamentQueueState | null>(null);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [notice, setNotice] = useState("Connecting to live tables...");

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

  const refreshProfile = useCallback((activeGuestId: string) => {
    socketRef.current?.emit("profile:get", { guestId: activeGuestId }, (ack) => {
      if (!ack.ok) return;
      setProfile(ack.data);
      if (ack.data.displayName !== null) {
        playerNameRef.current = ack.data.displayName;
        setPlayerName(ack.data.displayName);
      }
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

    async function connect() {
      const storedGuestId = await AsyncStorage.getItem(GUEST_ID_KEY);
      const activeGuestId = storedGuestId ?? createGuestId();
      const storedName = await AsyncStorage.getItem(PLAYER_NAME_KEY);

      if (storedGuestId === null) await AsyncStorage.setItem(GUEST_ID_KEY, activeGuestId);
      if (disposed) return;

      guestIdRef.current = activeGuestId;
      playerNameRef.current = storedName ?? "Player";
      setGuestId(activeGuestId);
      setPlayerName(playerNameRef.current);

      socket = io(SERVER_URL, {
        autoConnect: true,
        reconnection: true,
        timeout: 75_000,
        transports: ["websocket", "polling"]
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnectionStatus("online");
        setNotice("Connected to Deuces Arena.");
        refreshLobby();
        refreshProfile(activeGuestId);
      });
      socket.on("disconnect", () => {
        setConnectionStatus("offline");
        setNotice("Connection lost. Reconnecting automatically...");
      });
      socket.on("connect_error", () => {
        setConnectionStatus("offline");
        setNotice("The free server may be waking up. We will keep trying.");
      });
      socket.on("room:state", setRoom);
      socket.on("lobby:state", setLobby);
      socket.on("ranked:state", setRankedQueue);
      socket.on("tournament:state", setTournamentQueue);
      socket.on("game:error", ({ message }) => setNotice(message));
    }

    void connect();
    return () => {
      disposed = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [refreshLobby, refreshProfile]);

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
      guestId,
      playerName,
      profile,
      lobby,
      rankedQueue,
      tournamentQueue,
      room,
      notice,
      createBotGame,
      createCasualRoom,
      startCurrentRoom,
      joinRoom,
      leaveRoom,
      submitMove,
      updateProfile,
      refreshLobby
    }),
    [
      connectionStatus,
      createBotGame,
      createCasualRoom,
      guestId,
      joinRoom,
      leaveRoom,
      lobby,
      notice,
      playerName,
      profile,
      rankedQueue,
      refreshLobby,
      room,
      submitMove,
      startCurrentRoom,
      tournamentQueue,
      updateProfile
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
