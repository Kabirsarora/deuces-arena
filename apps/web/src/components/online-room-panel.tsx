"use client";

import {
  createReplayTimeline,
  generateLegalMoves,
  getCardId,
  type Card,
  type Move
} from "@deuces-arena/game-engine";
import type {
  ClientToServerEvents,
  PublicChatMessage,
  PublicCosmetic,
  PublicGuestProfile,
  PublicLeaderboardEntry,
  PublicLobbyState,
  PublicMatchHistoryItem,
  PublicMoveEvaluation,
  PublicOpenRoom,
  PublicRankedQueueState,
  PublicRoomPlayer,
  PublicRoomState,
  ProfileAvatarKey,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  Bot,
  CheckCircle2,
  CircleDot,
  Copy,
  Crown,
  Download,
  DoorOpen,
  Gauge,
  History,
  ListOrdered,
  LogOut,
  MessageCircle,
  Palette,
  Play,
  Send,
  Settings,
  Sparkles,
  Trophy,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OnlineHubMode = "bots" | "casual" | "ranked";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const ROOM_SESSION_KEY = "deuces-arena-room-session";
const GUEST_ID_KEY = "deuces-arena-guest-id";
const MAX_PLAYERS_PER_ROOM = 4;
const DEFAULT_RANKED_TIMER_SECONDS = 45;
const AVATAR_OPTIONS: readonly { readonly key: ProfileAvatarKey; readonly label: string }[] = [
  { key: "diamond", label: "Diamonds" },
  { key: "club", label: "Clubs" },
  { key: "heart", label: "Hearts" },
  { key: "spade", label: "Spades" }
];

export function OnlineRoomPanel() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const lastCompletionRefreshRef = useRef<string | null>(null);
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
  const [moveEvaluations, setMoveEvaluations] = useState<readonly PublicMoveEvaluation[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<readonly string[]>([]);
  const [botSeats, setBotSeats] = useState(3);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(45);
  const [lobbyTimerEnabled, setLobbyTimerEnabled] = useState(false);
  const [message, setMessage] = useState("Create a room, invite a friend, or start with bots.");

  const selectedCards = useMemo(
    () => room?.yourHand.filter((card) => selectedCardIds.includes(getCardId(card))) ?? [],
    [room?.yourHand, selectedCardIds]
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
  const canPass = legalMoves.some((move) => move.type === "pass");
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
    room === null ? 3 : Math.max(0, MAX_PLAYERS_PER_ROOM - room.players.length);
  const selectedBotSeats = Math.min(botSeats, availableBotSeats);
  const roomCanStart =
    room !== null &&
    room.status === "waiting" &&
    room.players.length + selectedBotSeats >= MAX_PLAYERS_PER_ROOM &&
    (connectedHumans.length <= 1 || connectedHumans.every((player) => player.ready));

  useEffect(() => {
    if (profile === null) {
      return;
    }

    setProfileDisplayName(profile.displayName ?? playerName);
    setProfileAvatarKey(profile.avatarKey);
  }, [playerName, profile]);

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
      refreshProfile(socket, setProfile);
      refreshLeaderboard(socket, setLeaderboard);
      refreshLobby(socket, setLobby);
      refreshRankedQueue(socket, setRankedQueue);
      refreshMatchHistory(socket, setMatchHistory);
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
      guestId: getOrCreateGuestId(),
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
        refreshProfile(socketRef.current, setProfile);
        refreshCosmetics(socketRef.current, setCosmetics);
      }

      refreshLeaderboard(socketRef.current, setLeaderboard);
      refreshMatchHistory(socketRef.current, setMatchHistory);
    }
  }, [profile?.equippedCosmetics, profile?.unlocks, room]);

  useEffect(() => {
    setMoveEvaluations([]);
  }, [room?.turnNumber, room?.roomCode]);

  useEffect(() => {
    setBotSeats((current) => Math.min(current, availableBotSeats));
  }, [availableBotSeats]);

  function createRoom() {
    socketRef.current?.emit(
      "room:create",
      {
        playerName,
        guestId: getOrCreateGuestId()
      },
      handleRoomAck("Room created.")
    );
  }

  function createBotGame() {
    socketRef.current?.emit(
      "room:create",
      {
        playerName,
        guestId: getOrCreateGuestId()
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
            botCount: 3,
            timer: {
              enabled: lobbyTimerEnabled,
              secondsPerTurn: turnTimerSeconds
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
        guestId: getOrCreateGuestId()
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
        guestId: getOrCreateGuestId(),
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
        guestId: getOrCreateGuestId()
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
        }
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

  function exportReplay() {
    if (room === null) {
      return;
    }

    socketRef.current?.emit("room:replay", { roomCode: room.roomCode }, (ack) => {
      if (!ack.ok) {
        setMessage(ack.error);
        return;
      }

      const replay = {
        exportedAt: new Date().toISOString(),
        source: "online-room",
        ...ack.data,
        timeline: createReplayTimeline(ack.data.events)
      };
      const blob = new Blob([JSON.stringify(replay, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `deuces-arena-room-${ack.data.roomCode}-replay-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Replay exported.");
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

  function evaluateMoves() {
    if (room === null) {
      return;
    }

    socketRef.current?.emit(
      "coach:evaluate",
      { roomCode: room.roomCode, rollouts: 8, maxMoves: 12 },
      (ack) => {
        if (ack.ok) {
          setMoveEvaluations(ack.data);
          setMessage("Move lab updated from random rollouts.");
        } else {
          setMessage(ack.error);
        }
      }
    );
  }

  function equipCosmetic(cosmetic: PublicCosmetic) {
    socketRef.current?.emit(
      "cosmetics:equip",
      {
        guestId: getOrCreateGuestId(),
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

  if (room === null) {
    return (
      <OnlineLobbyHub
        connected={connected}
        playerName={playerName}
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
        timerEnabled={lobbyTimerEnabled}
        timerSeconds={turnTimerSeconds}
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
        onTimerEnabledChange={setLobbyTimerEnabled}
        onTimerSecondsChange={setTurnTimerSeconds}
        onEquipCosmetic={equipCosmetic}
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
        timerEnabled={lobbyTimerEnabled}
        timerSeconds={turnTimerSeconds}
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
        onTimerEnabledChange={setLobbyTimerEnabled}
        onTimerSecondsChange={setTurnTimerSeconds}
      />
    );
  }

  return (
    <main className="min-h-screen px-3 py-10 text-white sm:px-5 lg:px-8">
      <section className="mx-auto grid w-full max-w-[96rem] gap-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <aside className="hud-glass order-2 rounded-[1.5rem] border border-white/10 p-4 backdrop-blur lg:order-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--aqua)]">Online Rooms</p>
              <h1 className="text-2xl font-black">Realtime Table</h1>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-xs font-bold",
                connected ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"
              )}
            >
              {connected ? "Online" : "Offline"}
            </span>
          </div>

          <label className="mb-3 block text-xs font-bold text-zinc-300">
            Display name
            <input
              className="mt-1 h-10 w-full rounded-full border border-white/10 bg-white/8 px-3 text-sm text-white outline-none focus:border-[var(--gold)]"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </label>

          <ProfileSummary
            profile={profile}
            displayName={profileDisplayName}
            avatarKey={profileAvatarKey}
            onDisplayNameChange={setProfileDisplayName}
            onAvatarKeyChange={setProfileAvatarKey}
            onSave={updateProfileIdentity}
          />
          <MatchHistorySummary entries={matchHistory} />
          <LobbySummary
            lobby={lobby}
            connected={connected}
            onJoinRoom={joinOpenRoom}
            currentRoomCode={room?.roomCode ?? null}
          />
          <RankedQueueSummary
            queue={rankedQueue}
            connected={connected}
            inRoom={room !== null}
            onJoin={joinRankedQueue}
            onLeave={leaveRankedQueue}
          />
          <LeaderboardSummary entries={leaderboard} />
          <LobbySettingsSummary
            botSeats={botSeats}
            maxBotSeats={availableBotSeats}
            timerEnabled={lobbyTimerEnabled}
            timerSeconds={turnTimerSeconds}
            disabled={room?.status === "in-progress"}
            onBotSeatsChange={setBotSeats}
            onTimerEnabledChange={setLobbyTimerEnabled}
            onTimerSecondsChange={setTurnTimerSeconds}
          />
          <RulesSummary />
          <CosmeticsSummary cosmetics={cosmetics} profile={profile} onEquip={equipCosmetic} />

          <div className="grid gap-2">
            <Button onClick={createRoom} disabled={!connected}>
              <Users className="size-4" />
              Create Room
            </Button>
            <div className="flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-full border border-white/10 bg-white/8 px-3 text-sm uppercase text-white outline-none focus:border-[var(--gold)]"
                placeholder="Room code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
              />
              <Button
                variant="secondary"
                onClick={joinRoom}
                disabled={!connected || joinCode.trim() === ""}
              >
                Join
              </Button>
            </div>
          </div>

          {room !== null ? (
            <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/7 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-400">Room code</p>
                  <p className="font-mono text-lg font-black">{room.roomCode}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(room.roomCode);
                    setMessage("Room code copied.");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <Button
                className="mt-3 w-full"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(getRoomInviteUrl(room.roomCode));
                  setMessage("Invite link copied.");
                }}
              >
                <Copy className="size-4" />
                Copy Invite Link
              </Button>
              <Button
                className="mt-2 w-full"
                variant="secondary"
                onClick={() => setReady(!yourPlayer?.ready)}
                disabled
              >
                <CheckCircle2 className="size-4" />
                {yourPlayer?.ready ? "Ready" : "Mark Ready"}
              </Button>
              <Button className="mt-2 w-full" onClick={startRoom} disabled={!roomCanStart}>
                <Play className="size-4" />
                {selectedBotSeats > 0
                  ? `Start With ${selectedBotSeats} Bot${selectedBotSeats === 1 ? "" : "s"}`
                  : "Start Game"}
              </Button>
              <Button className="mt-2 w-full" variant="secondary" onClick={exportReplay}>
                <Download className="size-4" />
                Export Replay
              </Button>
              <Button className="mt-2 w-full" variant="secondary" onClick={leaveRoom}>
                <LogOut className="size-4" />
                Leave Room
              </Button>
            </div>
          ) : null}

          <p className="mt-4 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
            {message}
          </p>
        </aside>

        <section className="order-1 grid gap-3 lg:order-1">
          <div className="grid gap-3">
            <OnlineTable room={room} />
            <OnlineMoveTracker
              room={room}
              moveEvaluations={moveEvaluations}
              canEvaluate={isYourTurn}
              onEvaluateMoves={evaluateMoves}
              onSendChat={sendChat}
            />
          </div>

          <section className="hand-dock border border-white/10 p-3 shadow-2xl backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Your Hand</p>
                <p className="text-xs text-zinc-400">
                  {isYourTurn
                    ? `${selectedCards.length} selected · ${legalMoves.length} legal options`
                    : "Waiting"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={passTurn} disabled={!isYourTurn || !canPass}>
                  Pass
                </Button>
                <Button onClick={playSelected} disabled={!isYourTurn || !canPlaySelected}>
                  <Send className="size-4" />
                  Play
                </Button>
              </div>
            </div>

            <div className="flex min-h-32 items-end overflow-x-auto px-1 pb-2 pt-5">
              <div className="flex items-end gap-1 sm:gap-2">
                {(room?.yourHand ?? []).map((card) => {
                  const selected = selectedCardIds.includes(getCardId(card));

                  return (
                    <motion.button
                      key={getCardId(card)}
                      type="button"
                      className="shrink-0 rounded-md disabled:cursor-default"
                      animate={{ y: selected ? -18 : 0 }}
                      onClick={() => toggleCard(card)}
                      disabled={!isYourTurn}
                    >
                      <OnlineCard card={card} selected={selected} />
                    </motion.button>
                  );
                })}
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
  playerName,
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
  timerEnabled,
  timerSeconds,
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
  onTimerEnabledChange,
  onTimerSecondsChange,
  onEquipCosmetic
}: {
  readonly connected: boolean;
  readonly playerName: string;
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
  readonly timerEnabled: boolean;
  readonly timerSeconds: number;
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
  readonly onTimerEnabledChange: (enabled: boolean) => void;
  readonly onTimerSecondsChange: (seconds: number) => void;
  readonly onEquipCosmetic: (cosmetic: PublicCosmetic) => void;
}) {
  const activity = lobby?.activity;
  const openRooms = lobby?.openRooms ?? [];
  const selectedBotSeats = Math.min(botSeats, maxBotSeats);

  return (
    <main className="min-h-screen px-3 py-8 text-white sm:px-5 lg:px-8">
      <section className="online-hub mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[92rem] overflow-hidden rounded-[1.25rem] border border-white/10 shadow-2xl lg:grid-cols-[7.5rem_minmax(0,1fr)]">
        <OnlineHubRail activeMode={hubMode} onModeChange={onHubModeChange} />

        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:p-8">
          <section className="flex min-h-0 flex-col">
            <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[var(--aqua)]">
                  Deuces Arena
                </p>
                <h1 className="text-3xl font-black sm:text-4xl">Choose a Table</h1>
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
                  meta={`${selectedBotSeats} bots · ${timerEnabled ? `${timerSeconds}s timer` : "no timer"}`}
                  actionLabel="Start Bot Game"
                  disabled={!connected}
                  onAction={onCreateBotGame}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CompactRange
                      label="Bot seats"
                      value={selectedBotSeats}
                      min={1}
                      max={Math.max(1, maxBotSeats)}
                      disabled={!connected}
                      onChange={onBotSeatsChange}
                    />
                    <CompactTimerControl
                      enabled={timerEnabled}
                      seconds={timerSeconds}
                      onEnabledChange={onTimerEnabledChange}
                      onSecondsChange={onTimerSecondsChange}
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
              profile={profile}
              profileDisplayName={profileDisplayName}
              profileAvatarKey={profileAvatarKey}
              onPlayerNameChange={onPlayerNameChange}
              onProfileDisplayNameChange={onProfileDisplayNameChange}
              onProfileAvatarKeyChange={onProfileAvatarKeyChange}
              onProfileSave={onProfileSave}
            />

            <section className="online-panel p-5 text-center">
              <Crown className="mx-auto mb-3 size-12 text-yellow-200" />
              <h2 className="text-xl font-black">Cosmetics</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Card backs, table themes, avatars, and badges. Never pay-to-win.
              </p>
            </section>

            <details className="online-panel p-4">
              <summary className="cursor-pointer list-none text-sm font-black">More</summary>
              <div className="mt-3 grid gap-3">
                <LeaderboardSummary entries={leaderboard} />
                <MatchHistorySummary entries={matchHistory} />
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

function OnlineHubRail({
  activeMode,
  onModeChange
}: {
  readonly activeMode: OnlineHubMode;
  readonly onModeChange: (mode: OnlineHubMode) => void;
}) {
  return (
    <nav className="hidden border-r border-white/10 bg-black/22 p-3 lg:grid lg:content-start lg:gap-3">
      <div className="mb-2 grid h-16 place-items-center rounded-[1.4rem] border border-white/10 bg-white/8 text-sm font-black">
        DA
      </div>
      <RailButton
        active={activeMode === "bots"}
        icon={<Bot className="size-6" />}
        label="Bots"
        onClick={() => onModeChange("bots")}
      />
      <RailButton
        active={activeMode === "casual"}
        icon={<Users className="size-6" />}
        label="Rooms"
        onClick={() => onModeChange("casual")}
      />
      <RailButton
        active={activeMode === "ranked"}
        icon={<Trophy className="size-6" />}
        label="Ranked"
        onClick={() => onModeChange("ranked")}
      />
    </nav>
  );
}

function RailButton({
  active,
  icon,
  label,
  onClick
}: {
  readonly active: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "grid justify-items-center gap-2 rounded-[1.35rem] px-3 py-4 text-sm font-black transition",
        active
          ? "bg-[var(--table)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
          : "text-zinc-400 hover:bg-white/8 hover:text-white"
      )}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
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
  connected,
  onJoin,
  onLeave
}: {
  readonly queue: PublicRankedQueueState | null;
  readonly connected: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
}) {
  const joined = queue?.joined ?? false;
  const queuedPlayers = queue?.queuedPlayers ?? 0;
  const requiredPlayers = queue?.requiredPlayers ?? 4;
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
      <div className="grid gap-3 sm:grid-cols-3">
        <ProfileMetric label="Queued" value={`${queuedPlayers}/${requiredPlayers}`} />
        <ProfileMetric label="ETA" value={etaLabel} />
        <ProfileMetric label="Rating" value="ELO" />
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
  profile,
  profileDisplayName,
  profileAvatarKey,
  onPlayerNameChange,
  onProfileDisplayNameChange,
  onProfileAvatarKeyChange,
  onProfileSave
}: {
  readonly playerName: string;
  readonly profile: PublicGuestProfile | null;
  readonly profileDisplayName: string;
  readonly profileAvatarKey: ProfileAvatarKey;
  readonly onPlayerNameChange: (value: string) => void;
  readonly onProfileDisplayNameChange: (value: string) => void;
  readonly onProfileAvatarKeyChange: (value: ProfileAvatarKey) => void;
  readonly onProfileSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="online-panel p-5">
      <div className="flex items-center gap-3">
        <ProfileAvatar avatarKey={profile?.avatarKey ?? profileAvatarKey} />
        <div className="min-w-0">
          <p className="truncate text-lg font-black">{profile?.displayName ?? playerName}</p>
          <p className="text-sm text-zinc-400">{profile?.rating ?? 1000} rating</p>
        </div>
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

function OnlineWaitingRoom({
  room,
  connected,
  message,
  botSeats,
  maxBotSeats,
  timerEnabled,
  timerSeconds,
  roomCanStart,
  yourReady,
  onCopyRoomCode,
  onCopyInvite,
  onReady,
  onStart,
  onLeave,
  onBotSeatsChange,
  onTimerEnabledChange,
  onTimerSecondsChange
}: {
  readonly room: PublicRoomState;
  readonly connected: boolean;
  readonly message: string;
  readonly botSeats: number;
  readonly maxBotSeats: number;
  readonly timerEnabled: boolean;
  readonly timerSeconds: number;
  readonly roomCanStart: boolean;
  readonly yourReady: boolean;
  readonly onCopyRoomCode: () => void;
  readonly onCopyInvite: () => void;
  readonly onReady: () => void;
  readonly onStart: () => void;
  readonly onLeave: () => void;
  readonly onBotSeatsChange: (count: number) => void;
  readonly onTimerEnabledChange: (enabled: boolean) => void;
  readonly onTimerSecondsChange: (seconds: number) => void;
}) {
  const seatedHumans = room.players.filter((player) => player.kind === "human").length;
  const seatsNeeded = Math.max(0, MAX_PLAYERS_PER_ROOM - room.players.length - botSeats);
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

          <div className="grid grid-cols-2 gap-2 text-center">
            <ProfileMetric label="Players" value={`${room.players.length}/4`} />
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
  setProfile: (profile: PublicGuestProfile) => void
): void {
  socket.emit("profile:get", { guestId: getOrCreateGuestId() }, (ack) => {
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
  setMatchHistory: (entries: readonly PublicMatchHistoryItem[]) => void
): void {
  socket.emit("profile:history", { guestId: getOrCreateGuestId(), limit: 5 }, (ack) => {
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

function ProfileSummary({
  profile,
  displayName,
  avatarKey,
  onDisplayNameChange,
  onAvatarKeyChange,
  onSave
}: {
  readonly profile: PublicGuestProfile | null;
  readonly displayName: string;
  readonly avatarKey: ProfileAvatarKey;
  readonly onDisplayNameChange: (value: string) => void;
  readonly onAvatarKeyChange: (value: ProfileAvatarKey) => void;
  readonly onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const savedName = profile?.displayName ?? "Guest Profile";

  return (
    <section className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProfileAvatar avatarKey={profile?.avatarKey ?? avatarKey} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{savedName}</p>
            <p className="text-[11px] text-zinc-500">Guest account</p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs text-zinc-300">
          {profile?.rating ?? 1000}
        </span>
      </div>
      <form
        className="mb-3 rounded-[0.9rem] border border-white/10 bg-white/7 p-2"
        onSubmit={onSave}
      >
        <label className="mb-1 block text-[11px] font-bold uppercase text-zinc-500">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none transition focus:border-[var(--gold)]"
            value={displayName}
            maxLength={18}
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
          <Button className="h-10 px-3" type="submit" size="sm">
            Save
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {AVATAR_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={cn(
                "grid h-9 place-items-center rounded-full border text-sm transition",
                avatarKey === option.key
                  ? "border-[var(--gold)] bg-[var(--gold)]/15"
                  : "border-white/10 bg-black/20 hover:border-white/25"
              )}
              type="button"
              title={option.label}
              onClick={() => onAvatarKeyChange(option.key)}
            >
              {getAvatarSymbol(option.key)}
            </button>
          ))}
        </div>
      </form>
      <div className="grid grid-cols-3 gap-2 text-center">
        <ProfileMetric label="Games" value={profile?.gamesPlayed ?? 0} />
        <ProfileMetric label="Wins" value={profile?.wins ?? 0} />
        <ProfileMetric
          label="Avg"
          value={
            profile?.averagePlacement === null || profile?.averagePlacement === undefined
              ? "-"
              : profile.averagePlacement.toFixed(2)
          }
        />
      </div>
      <div className="mt-2 flex items-center justify-between rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs">
        <span className="text-zinc-400">Unlocked cosmetics</span>
        <span className="font-black text-[var(--gold)]">{profile?.unlocks.length ?? 0}</span>
      </div>
    </section>
  );
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

function LobbySummary({
  lobby,
  connected,
  currentRoomCode,
  onJoinRoom
}: {
  readonly lobby: PublicLobbyState | null;
  readonly connected: boolean;
  readonly currentRoomCode: string | null;
  readonly onJoinRoom: (room: PublicOpenRoom) => void;
}) {
  const activity = lobby?.activity;
  const openRooms = lobby?.openRooms ?? [];

  return (
    <section className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <CircleDot className="size-4 text-emerald-300" />
          Live Lobby
        </p>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs text-zinc-300">
          {activity?.connectedUsers ?? 0} online
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <ProfileMetric label="Open" value={activity?.openRooms ?? 0} />
        <ProfileMetric label="Playing" value={activity?.playersInActiveGames ?? 0} />
        <ProfileMetric label="Tables" value={activity?.activeRooms ?? 0} />
      </div>

      <div className="mt-2 grid gap-2">
        {openRooms.length === 0 ? (
          <p className="rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-400">
            No open rooms right now.
          </p>
        ) : (
          openRooms.slice(0, 3).map((openRoom) => (
            <button
              key={openRoom.roomCode}
              type="button"
              className="flex items-center justify-between gap-2 rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2 text-left transition hover:border-[var(--gold)] hover:bg-white/10 disabled:cursor-default disabled:opacity-50"
              disabled={!connected || currentRoomCode === openRoom.roomCode}
              onClick={() => onJoinRoom(openRoom)}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{openRoom.hostName}'s table</p>
                <p className="text-[11px] text-zinc-400">
                  {openRoom.readyPlayers}/{openRoom.seatedPlayers} ready · {openRoom.roomCode}
                </p>
              </div>
              <DoorOpen className="size-4 shrink-0 text-[var(--gold)]" />
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function RankedQueueSummary({
  queue,
  connected,
  inRoom,
  onJoin,
  onLeave
}: {
  readonly queue: PublicRankedQueueState | null;
  readonly connected: boolean;
  readonly inRoom: boolean;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
}) {
  const joined = queue?.joined ?? false;
  const queuedPlayers = queue?.queuedPlayers ?? 0;
  const requiredPlayers = queue?.requiredPlayers ?? 4;
  const etaLabel =
    queue?.etaSeconds === null || queue === null
      ? "ETA pending"
      : queue.etaSeconds === 0
        ? "Matching now"
        : `~${queue.etaSeconds}s ETA`;

  return (
    <section className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Trophy className="size-4 text-[var(--gold)]" />
          Ranked Queue
        </p>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs text-zinc-300">
          {queuedPlayers}/{requiredPlayers}
        </span>
      </div>

      <div className="mb-3 rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs text-zinc-300">
        4 humans · no bots · {DEFAULT_RANKED_TIMER_SECONDS}s timer · {etaLabel}
      </div>

      <Button
        className="w-full"
        variant={joined ? "secondary" : "primary"}
        disabled={!connected || (!joined && inRoom)}
        onClick={joined ? onLeave : onJoin}
      >
        {joined ? "Leave Ranked Queue" : "Find Ranked Match"}
      </Button>
    </section>
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

function LobbySettingsSummary({
  botSeats,
  maxBotSeats,
  timerEnabled,
  timerSeconds,
  disabled,
  onBotSeatsChange,
  onTimerEnabledChange,
  onTimerSecondsChange
}: {
  readonly botSeats: number;
  readonly maxBotSeats: number;
  readonly timerEnabled: boolean;
  readonly timerSeconds: number;
  readonly disabled: boolean;
  readonly onBotSeatsChange: (count: number) => void;
  readonly onTimerEnabledChange: (enabled: boolean) => void;
  readonly onTimerSecondsChange: (seconds: number) => void;
}) {
  return (
    <details className="mb-3 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">
        <span className="flex items-center gap-2">
          <Settings className="size-4 text-[var(--aqua)]" />
          Lobby Settings
        </span>
        <span className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs font-normal text-zinc-300">
          Casual
        </span>
      </summary>

      <div className="mt-3 grid gap-3">
        <label className="block rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs">
          <span className="mb-2 flex items-center justify-between gap-2">
            <span>
              <span className="block font-bold text-zinc-200">Bot seats</span>
              <span className="text-zinc-400">Casual rooms still need 4 total players.</span>
            </span>
            <span className="font-black text-[var(--gold)]">{botSeats}</span>
          </span>
          <input
            type="range"
            min="0"
            max={maxBotSeats}
            step="1"
            value={botSeats}
            disabled={disabled}
            className="w-full accent-[var(--gold)]"
            onChange={(event) => onBotSeatsChange(Number(event.target.value))}
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs">
          <span>
            <span className="block font-bold text-zinc-200">Turn timer</span>
            <span className="text-zinc-400">Server enforcement comes next.</span>
          </span>
          <input
            type="checkbox"
            className="size-4 accent-[var(--gold)]"
            checked={timerEnabled}
            disabled={disabled}
            onChange={(event) => onTimerEnabledChange(event.target.checked)}
          />
        </label>

        <label className="block rounded-[0.9rem] border border-white/10 bg-white/7 px-3 py-2 text-xs">
          <span className="mb-2 flex items-center justify-between gap-2">
            <span className="font-bold text-zinc-200">Seconds per turn</span>
            <span className="font-black text-[var(--gold)]">{timerSeconds}s</span>
          </span>
          <input
            type="range"
            min="15"
            max="90"
            step="15"
            value={timerSeconds}
            disabled={disabled || !timerEnabled}
            className="w-full accent-[var(--gold)]"
            onChange={(event) => onTimerSecondsChange(Number(event.target.value))}
          />
        </label>
      </div>
    </details>
  );
}

function RulesSummary() {
  const rules = [
    "3 of diamonds starts and must be in the first play.",
    "Follow the lead type: single, pair, trips, full house, or exact-length straight.",
    "Players may pass even when they can beat the current play.",
    "A bomb is four of a kind plus one kicker and can beat normal hands.",
    "After a bomb, only a stronger bomb can answer."
  ];

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
        {rules.map((rule) => (
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

function OnlineMoveTracker({
  room,
  moveEvaluations,
  canEvaluate,
  onEvaluateMoves,
  onSendChat
}: {
  readonly room: PublicRoomState | null;
  readonly moveEvaluations: readonly PublicMoveEvaluation[];
  readonly canEvaluate: boolean;
  readonly onEvaluateMoves: () => void;
  readonly onSendChat: (body: string) => void;
}) {
  const recentEvents = createReplayTimeline(room?.recentEvents ?? [])
    .slice(-6)
    .reverse();

  return (
    <aside className="hud-glass flex min-h-0 flex-col rounded-[1.25rem] border border-white/10 p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <History className="size-4 text-[var(--aqua)]" />
            Table Tools
          </p>
          <p className="text-xs text-zinc-400">{room?.recentEvents.length ?? 0} synced events</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/7 px-2 py-1 text-xs text-zinc-300">
          {room === null ? "idle" : `${formatMatchMode(room.mode)} · ${room.status}`}
        </div>
      </div>

      <details className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 p-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold">
          Players
          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-normal text-zinc-400">
            {room?.players.length ?? 0}
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(room?.players ?? []).map((player) => (
            <OnlinePlayerStat key={player.id} player={player} />
          ))}
        </div>
      </details>

      <details className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 p-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold">
          Replay Log
          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-normal text-zinc-400">
            Open
          </span>
        </summary>
        <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-[0.9rem] border border-white/10 bg-black/20">
          {recentEvents.length === 0 ? (
            <div className="grid h-full min-h-32 place-items-center px-3 text-center text-xs text-zinc-400">
              Accepted moves will stream here.
            </div>
          ) : (
            <ol className="max-h-52 overflow-y-auto p-2">
              {recentEvents.map((event) => (
                <li
                  key={`${event.turnNumber}-${event.playerId}`}
                  className="mb-2 rounded-[0.9rem] border border-white/10 bg-white/6 px-2 py-2 last:mb-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        {getRoomPlayerName(room, event.playerId)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-300">
                        {event.kind === "pass"
                          ? "Passed"
                          : `${formatHandType(event.handType ?? "play")} · ${event.cardCount} cards`}
                      </p>
                    </div>
                    <span className="rounded-full bg-black/28 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      #{event.turnNumber + 1}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                    <Activity className="size-3" />
                    {event.legalMoveCount} legal · {event.cardsRemainingAfter} left
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </details>

      <MoveLab
        evaluations={moveEvaluations}
        disabled={!canEvaluate}
        onEvaluateMoves={onEvaluateMoves}
      />

      <RoomChat messages={room?.recentChat ?? []} disabled={room === null} onSend={onSendChat} />
    </aside>
  );
}

function MoveLab({
  evaluations,
  disabled,
  onEvaluateMoves
}: {
  readonly evaluations: readonly PublicMoveEvaluation[];
  readonly disabled: boolean;
  readonly onEvaluateMoves: () => void;
}) {
  return (
    <details className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 p-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold">
        <span className="flex items-center gap-2">
          <Gauge className="size-3.5 text-[var(--aqua)]" />
          Move Lab
        </span>
        <span className="text-[10px] font-normal text-zinc-500">rollouts</span>
      </summary>

      <Button
        className="mt-3 w-full"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={onEvaluateMoves}
      >
        Analyze Legal Moves
      </Button>

      <div className="mt-2 grid gap-2">
        {evaluations.length === 0 ? (
          <p className="rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2 text-xs text-zinc-500">
            Run analysis on your turn to rank legal moves with random simulations.
          </p>
        ) : (
          evaluations.slice(0, 3).map((evaluation, index) => (
            <div
              key={`${index}-${formatMove(evaluation.move)}`}
              className="rounded-[0.9rem] border border-white/10 bg-white/7 px-2 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold">{formatMove(evaluation.move)}</p>
                <span className="rounded-full bg-black/24 px-2 py-1 text-[10px] text-zinc-300">
                  {(evaluation.winRate * 100).toFixed(0)}%
                </span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                Avg place {evaluation.averagePlacement.toFixed(2)} · {evaluation.rollouts} rollouts
              </p>
            </div>
          ))
        )}
      </div>
    </details>
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

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (draft.trim() === "") {
      return;
    }

    onSend(draft);
    setDraft("");
  }

  return (
    <details className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 p-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold">
        <span className="flex items-center gap-2">
          <MessageCircle className="size-3.5 text-[var(--gold)]" />
          Table Chat
        </span>
        <span className="text-[10px] text-zinc-500">{messages.length} recent</span>
      </summary>

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
    </details>
  );
}

function OnlinePlayerStat({ player }: { readonly player: PublicRoomPlayer }) {
  const equippedCount = player.equippedCosmetics.length;

  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-white/7 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-bold">{player.name}</p>
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            player.connected ? "bg-emerald-300" : "bg-red-300"
          )}
        />
      </div>
      <div className="mt-1 grid gap-y-1 text-[11px] text-zinc-400">
        <span>{player.cardsRemaining} cards</span>
        <span>
          {player.stats === null ? player.kind : `${player.stats.rating} rating`} ·{" "}
          {player.ready ? "ready" : "not ready"}
        </span>
        {equippedCount > 0 ? <span>{equippedCount} cosmetic loadout</span> : null}
      </div>
    </div>
  );
}

function OnlineTable({ room }: { readonly room: PublicRoomState | null }) {
  const players = room?.players ?? [];
  const yourPlayer = players.find((player) => player.id === room?.yourPlayerId) ?? players[0];
  const tableTheme =
    yourPlayer === undefined ? null : getEquippedCosmetic(yourPlayer, "TABLE_THEME");
  const timerLabel = formatTurnTimer(room);
  const currentLeadName =
    room?.currentTrick === null || room === null
      ? null
      : getRoomPlayerName(room, room.currentTrick.lastPlayedByPlayerId);

  return (
    <section
      className={cn(
        "table-felt table-oval relative min-h-[34rem] overflow-hidden border border-white/10 p-3 sm:min-h-[40rem] lg:min-h-[calc(100vh-14rem)] lg:p-5",
        getTableThemeClass(tableTheme)
      )}
    >
      <div className="absolute inset-4 rounded-[44%/18%] border border-white/8" />
      <div className="absolute inset-12 rounded-full border border-white/8" />
      <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-bold uppercase text-zinc-300 backdrop-blur">
        <CircleDot className="size-3 text-[var(--aqua)]" />
        {room === null ? "No table" : `${formatMatchMode(room.mode)} table`}
      </div>

      {players.length === 0 ? (
        <div className="absolute inset-x-6 top-16 z-10 rounded-full border border-dashed border-white/15 bg-black/18 px-4 py-3 text-center text-sm text-zinc-300">
          Create or join a room to take a seat.
        </div>
      ) : (
        players
          .slice(0, 4)
          .map((player, index) => (
            <OnlineSeat
              key={player.id}
              player={player}
              active={room?.activePlayerId === player.id}
              position={index}
            />
          ))
      )}

      <div className="relative z-10 grid min-h-[30rem] place-items-center text-center sm:min-h-[34rem] lg:min-h-[calc(100vh-19rem)]">
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
                room.currentTrick.hand.cards.map((card) => (
                  <OnlineCard key={getCardId(card)} card={card} compact />
                ))
              )}
            </AnimatePresence>
          </div>

          {room?.status === "complete" ? (
            <div className="mx-auto mt-5 w-fit rounded-full border border-[var(--gold)] bg-black/28 px-4 py-3">
              <p className="flex items-center justify-center gap-2 text-sm font-bold text-[var(--gold)]">
                <Sparkles className="size-4" />
                {getRoomPlayerName(room, room.placements[0] ?? "")} wins
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function OnlineSeat({
  player,
  active,
  position
}: {
  readonly player: PublicRoomPlayer;
  readonly active: boolean;
  readonly position: number;
}) {
  const profileBorder = getEquippedCosmetic(player, "PROFILE_BORDER");
  const cardBack = getEquippedCosmetic(player, "CARD_BACK");
  const seatPosition = [
    "left-1/2 top-14 -translate-x-1/2",
    "left-3 top-1/2 -translate-y-1/2 sm:left-5",
    "right-3 top-1/2 -translate-y-1/2 sm:right-5",
    "bottom-5 left-1/2 -translate-x-1/2"
  ][position];

  return (
    <div
      className={cn(
        "seat-panel absolute z-20 flex w-[min(14rem,calc(100%-2rem))] items-center justify-between gap-2 border px-2.5 py-2 sm:w-56",
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
        <p className="truncate text-sm font-bold">{player.name}</p>
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

function formatTurnTimer(room: PublicRoomState | null): string | null {
  if (room?.turnTimer === null || room === null) {
    return null;
  }

  if (room.turnTimer.deadlineAt === null) {
    return `${room.turnTimer.secondsPerTurn}s timer`;
  }

  const secondsLeft = Math.max(
    0,
    Math.ceil((new Date(room.turnTimer.deadlineAt).getTime() - Date.now()) / 1000)
  );

  return `${secondsLeft}s to move`;
}

function OnlineCard({
  card,
  selected = false,
  compact = false
}: {
  readonly card: Card;
  readonly selected?: boolean;
  readonly compact?: boolean;
}) {
  const red = card.suit === "diamonds" || card.suit === "hearts";

  return (
    <motion.div
      layout
      className={cn(
        "card-face grid rounded-md border p-2 shadow-xl",
        compact ? "h-20 w-14" : "h-24 w-16 sm:h-28 sm:w-20",
        selected ? "border-[var(--gold)] ring-2 ring-[var(--gold)]" : "border-black/12"
      )}
    >
      <div
        className={cn("text-left font-black leading-none", red ? "text-red-600" : "text-zinc-950")}
      >
        <div className={compact ? "text-base" : "text-lg"}>{card.rank}</div>
        <div className={compact ? "text-sm" : "text-base"}>{suitSymbol(card.suit)}</div>
      </div>
      <div
        className={cn(
          "self-center text-center text-3xl font-black",
          red ? "text-red-600" : "text-zinc-950"
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

function formatHandType(type: string): string {
  return type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMove(move: Move): string {
  return move.type === "pass" ? "Pass" : move.cards.map(formatCard).join(" ");
}

function formatRatingDelta(delta: number | null): string {
  if (delta === null) {
    return "rating";
  }

  return delta >= 0 ? `+${delta}` : `${delta}`;
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
  }
}
