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
  PublicRoomPlayer,
  PublicRoomState,
  ServerAck,
  ServerToClientEvents
} from "@deuces-arena/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Copy, History, Play, Send, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const ROOM_SESSION_KEY = "deuces-arena-room-session";

export function OnlineRoomPanel() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState("Player");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<readonly string[]>([]);
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

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
      autoConnect: true
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setMessage("Connected to realtime server.");
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
    socket.on("game:error", (payload) => {
      setMessage(payload.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function createRoom() {
    socketRef.current?.emit("room:create", { playerName }, handleRoomAck("Room created."));
  }

  function joinRoom() {
    socketRef.current?.emit(
      "room:join",
      {
        roomCode: joinCode,
        playerName
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
      { roomCode: room.roomCode },
      handleRoomAck("Game started.")
    );
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
        setMessage(successMessage);
      } else {
        setMessage(ack.error);
      }
    };
  }

  return (
    <main className="min-h-screen px-3 py-16 text-white sm:px-5 lg:px-8">
      <section className="mx-auto grid w-full max-w-7xl gap-3 lg:grid-cols-[24rem_1fr]">
        <aside className="rounded-md border border-white/10 bg-black/28 p-4 shadow-2xl backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--aqua)]">Online Rooms</p>
              <h1 className="text-2xl font-black">Realtime Table</h1>
            </div>
            <span
              className={cn(
                "rounded-md px-2 py-1 text-xs font-bold",
                connected ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"
              )}
            >
              {connected ? "Online" : "Offline"}
            </span>
          </div>

          <label className="mb-3 block text-xs font-bold text-zinc-300">
            Display name
            <input
              className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/8 px-3 text-sm text-white outline-none focus:border-[var(--gold)]"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </label>

          <div className="grid gap-2">
            <Button onClick={createRoom} disabled={!connected}>
              <Users className="size-4" />
              Create Room
            </Button>
            <div className="flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-white/8 px-3 text-sm uppercase text-white outline-none focus:border-[var(--gold)]"
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
            <div className="mt-4 rounded-md border border-white/10 bg-white/7 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-400">Room code</p>
                  <p className="font-mono text-lg font-black">{room.roomCode}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(room.roomCode)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <Button
                className="mt-3 w-full"
                onClick={startRoom}
                disabled={room.status !== "waiting"}
              >
                <Play className="size-4" />
                Start With Bots
              </Button>
            </div>
          ) : null}

          <p className="mt-4 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
            {message}
          </p>
        </aside>

        <section className="grid gap-3">
          <div className="grid gap-3 xl:grid-cols-[1fr_18rem]">
            <OnlineTable room={room} />
            <OnlineMoveTracker room={room} />
          </div>

          <section className="rounded-md border border-white/10 bg-black/28 p-3 shadow-2xl backdrop-blur">
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

function OnlineMoveTracker({ room }: { readonly room: PublicRoomState | null }) {
  const recentEvents = createReplayTimeline(room?.recentEvents ?? [])
    .slice(-6)
    .reverse();

  return (
    <aside className="flex min-h-64 flex-col rounded-md border border-white/10 bg-black/24 p-3 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <History className="size-4 text-[var(--aqua)]" />
            Room Tracker
          </p>
          <p className="text-xs text-zinc-400">{room?.recentEvents.length ?? 0} synced events</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/7 px-2 py-1 text-xs text-zinc-300">
          {room?.status ?? "idle"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(room?.players ?? []).map((player) => (
          <OnlinePlayerStat key={player.id} player={player} />
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/20">
        {recentEvents.length === 0 ? (
          <div className="grid h-full min-h-32 place-items-center px-3 text-center text-xs text-zinc-400">
            Accepted moves will stream here.
          </div>
        ) : (
          <ol className="max-h-52 overflow-y-auto p-2">
            {recentEvents.map((event) => (
              <li
                key={`${event.turnNumber}-${event.playerId}`}
                className="mb-2 rounded-md border border-white/10 bg-white/6 px-2 py-2 last:mb-0"
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
                  <span className="rounded-sm bg-black/28 px-1.5 py-0.5 text-[10px] text-zinc-400">
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
    </aside>
  );
}

function OnlinePlayerStat({ player }: { readonly player: PublicRoomPlayer }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/7 p-2">
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
        <span>{player.kind}</span>
      </div>
    </div>
  );
}

function OnlineTable({ room }: { readonly room: PublicRoomState | null }) {
  return (
    <section className="table-felt min-h-[28rem] rounded-md border border-white/10 p-4 shadow-2xl">
      <div className="grid gap-3 md:grid-cols-4">
        {(room?.players ?? []).map((player) => (
          <div
            key={player.id}
            className={cn(
              "rounded-md border p-3",
              room?.activePlayerId === player.id
                ? "border-[var(--gold)] bg-[rgba(242,193,78,0.13)]"
                : "border-white/10 bg-black/24"
            )}
          >
            <p className="truncate text-sm font-bold">{player.name}</p>
            <p className="text-xs text-zinc-400">
              {player.kind} · {player.cardsRemaining} cards ·{" "}
              {player.connected ? "connected" : "away"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid place-items-center text-center">
        <p className="text-xs font-semibold uppercase text-zinc-400">Current Trick</p>
        <h2 className="mt-1 text-xl font-black">
          {room?.currentTrick === null || room === null
            ? "Open table"
            : room.currentTrick.hand.type}
        </h2>
        <div className="mt-4 flex min-h-24 flex-wrap justify-center gap-2">
          <AnimatePresence mode="popLayout">
            {room?.currentTrick?.hand.cards.map((card) => (
              <OnlineCard key={getCardId(card)} card={card} compact />
            ))}
          </AnimatePresence>
        </div>

        {room?.status === "complete" ? (
          <div className="mt-5 rounded-md border border-[var(--gold)] bg-black/28 px-4 py-3">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-[var(--gold)]">
              <Sparkles className="size-4" />
              {getRoomPlayerName(room, room.placements[0] ?? "")} wins
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
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
