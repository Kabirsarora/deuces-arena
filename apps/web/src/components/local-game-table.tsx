"use client";

import {
  applyMove,
  chooseBotMove,
  createDeck,
  createInitialGame,
  createReplayTimeline,
  generateLegalMoves,
  getCardId,
  summarizeGame,
  type Card,
  type GameState,
  type Move,
  type PlayerGameSummary,
  type PlayerState,
  type ReplayTimelineItem
} from "@deuces-arena/game-engine";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bot, Crown, Download, History, RotateCcw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLAYER_IDS = ["you", "bot-left", "bot-top", "bot-right"] as const;
const PLAYER_NAMES: Record<string, string> = {
  you: "You",
  "bot-left": "Nova",
  "bot-top": "Kaito",
  "bot-right": "Mina"
};
const BOT_DELAY_MS = 620;

export function LocalGameTable() {
  const [game, setGame] = useState<GameState>(() =>
    createInitialGame(PLAYER_IDS, shuffleDeck(createSeededRandom(20260526)))
  );
  const [selectedCardIds, setSelectedCardIds] = useState<readonly string[]>([]);
  const [message, setMessage] = useState(
    "Win by shedding every card before the table catches you."
  );

  const human = getPlayer(game, "you");
  const selectedCards = useMemo(
    () => human.hand.filter((card) => selectedCardIds.includes(getCardId(card))),
    [human.hand, selectedCardIds]
  );
  const legalMoves = useMemo(
    () =>
      generateLegalMoves(human.hand, {
        isFirstMove: game.turnNumber === 0,
        currentTrick: game.currentTrick
      }),
    [game.currentTrick, game.turnNumber, human.hand]
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

  useEffect(() => {
    if (game.status === "complete" || game.activePlayerId === "you") {
      return;
    }

    const timeout = window.setTimeout(() => {
      const bot = getPlayer(game, game.activePlayerId);
      const decision = chooseBotMove({
        hand: bot.hand,
        context: {
          isFirstMove: game.turnNumber === 0,
          currentTrick: game.currentTrick
        },
        strategy: "lowest-legal"
      });
      const result = applyMove(game, bot.id, decision.move);

      if (result.ok) {
        setGame(result.state);
        setMessage(describeMove(bot.id, decision.move));
      } else {
        setMessage(result.reason);
      }
    }, BOT_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [game]);

  function toggleCard(card: Card) {
    const cardId = getCardId(card);
    setSelectedCardIds((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]
    );
  }

  function playSelected() {
    const result = applyMove(game, "you", {
      type: "play",
      cards: selectedCards
    });

    if (result.ok) {
      setGame(result.state);
      setSelectedCardIds([]);
      setMessage(describeMove("you", { type: "play", cards: selectedCards }));
    } else {
      setMessage(result.reason);
    }
  }

  function passTurn() {
    const result = applyMove(game, "you", {
      type: "pass"
    });

    if (result.ok) {
      setGame(result.state);
      setSelectedCardIds([]);
      setMessage("You passed.");
    } else {
      setMessage(result.reason);
    }
  }

  function resetGame() {
    setGame(createInitialGame(PLAYER_IDS, shuffleDeck()));
    setSelectedCardIds([]);
    setMessage("New table. Find the tempo, then get out first.");
  }

  function exportReplay() {
    const replay = {
      exportedAt: new Date().toISOString(),
      mode: "local-demo",
      players: PLAYER_IDS.map((id) => ({
        id,
        name: PLAYER_NAMES[id]
      })),
      status: game.status,
      placements: game.placements,
      turnNumber: game.turnNumber,
      timeline: createReplayTimeline(game.events),
      events: game.events
    };
    const blob = new Blob([JSON.stringify(replay, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `deuces-arena-replay-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen overflow-hidden px-3 py-4 text-white sm:px-5 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col gap-3">
        <TopBar game={game} onExportReplay={exportReplay} onReset={resetGame} />

        <div className="grid flex-1 grid-rows-[auto_1fr_auto] gap-3 lg:grid-cols-[14rem_1fr_14rem] lg:grid-rows-[auto_1fr_auto]">
          <OpponentPanel
            player={getPlayer(game, "bot-top")}
            activePlayerId={game.activePlayerId}
            className="lg:col-start-2"
          />
          <OpponentPanel
            player={getPlayer(game, "bot-left")}
            activePlayerId={game.activePlayerId}
            className="hidden lg:col-start-1 lg:row-start-2 lg:flex"
          />
          <div className="grid gap-3 lg:col-start-2 lg:row-start-2 xl:grid-cols-[1fr_18rem]">
            <TableCenter game={game} message={message} />
            <MoveTracker game={game} />
          </div>
          <OpponentPanel
            player={getPlayer(game, "bot-right")}
            activePlayerId={game.activePlayerId}
            className="hidden lg:col-start-3 lg:row-start-2 lg:flex"
          />

          <div className="flex gap-2 lg:hidden">
            <OpponentPanel
              player={getPlayer(game, "bot-left")}
              activePlayerId={game.activePlayerId}
            />
            <OpponentPanel
              player={getPlayer(game, "bot-right")}
              activePlayerId={game.activePlayerId}
            />
          </div>

          <HumanHand
            player={human}
            activePlayerId={game.activePlayerId}
            selectedCardIds={selectedCardIds}
            onToggleCard={toggleCard}
            onPlay={playSelected}
            onPass={passTurn}
            canPlaySelected={canPlaySelected}
            canPass={canPass}
            selectedCount={selectedCards.length}
            legalMoveCount={legalMoves.length}
            gameComplete={game.status === "complete"}
            className="lg:col-span-3"
          />
        </div>
      </section>
    </main>
  );
}

function MoveTracker({ game }: { readonly game: GameState }) {
  const summaries = summarizeGame(game);
  const recentEvents = createReplayTimeline(game.events).slice(-6).reverse();

  return (
    <aside className="hud-glass rounded-[1.25rem] border border-white/10 p-3 backdrop-blur">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span>
            <span className="flex items-center gap-2 text-sm font-bold">
              <History className="size-4 text-[var(--aqua)]" />
              Replay Log
            </span>
            <span className="mt-1 block text-xs text-zinc-400">
              {game.events.length} events · {game.status}
            </span>
          </span>
          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-zinc-300">
            Open
          </span>
        </summary>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {summaries.map((summary) => (
            <PlayerStat key={summary.playerId} summary={summary} />
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[1rem] border border-white/10 bg-black/20">
          {recentEvents.length === 0 ? (
            <div className="grid h-full min-h-32 place-items-center px-3 text-center text-xs text-zinc-400">
              Moves will appear here as the table develops.
            </div>
          ) : (
            <ol className="max-h-52 overflow-y-auto p-2">
              {recentEvents.map((event) => (
                <MoveEventRow key={`${event.turnNumber}-${event.playerId}`} event={event} />
              ))}
            </ol>
          )}
        </div>
      </details>
    </aside>
  );
}

function PlayerStat({ summary }: { readonly summary: PlayerGameSummary }) {
  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-white/7 p-2">
      <p className="truncate text-xs font-bold">{PLAYER_NAMES[summary.playerId]}</p>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-400">
        <span>{summary.cardsRemaining} cards</span>
        <span>{summary.movesPlayed} plays</span>
        <span>{summary.passes} passes</span>
        <span>{summary.bombsPlayed} bombs</span>
      </div>
    </div>
  );
}

function MoveEventRow({ event }: { readonly event: ReplayTimelineItem }) {
  return (
    <li className="mb-2 rounded-[0.9rem] border border-white/10 bg-white/6 px-2 py-2 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">{PLAYER_NAMES[event.playerId]}</p>
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
  );
}

function TopBar({
  game,
  onExportReplay,
  onReset
}: {
  readonly game: GameState;
  readonly onExportReplay: () => void;
  readonly onReset: () => void;
}) {
  return (
    <header className="hud-glass flex items-center justify-between gap-3 rounded-full border border-white/10 px-3 py-3 backdrop-blur">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-[var(--aqua)]">Deuces Arena</p>
        <h1 className="truncate text-xl font-black sm:text-2xl">Local Table</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden rounded-full border border-white/10 bg-white/7 px-3 py-2 text-sm text-zinc-200 sm:block">
          <span className="text-zinc-400">Turn</span> {game.turnNumber + 1}
        </div>
        <div className="hidden rounded-full border border-white/10 bg-white/7 px-3 py-2 text-sm text-zinc-200 md:block">
          {PLAYER_NAMES[game.activePlayerId]} to move
        </div>
        <Button variant="secondary" size="sm" onClick={onExportReplay}>
          <Download className="size-4" />
          Replay
        </Button>
        <Button variant="secondary" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" />
          Reset
        </Button>
      </div>
    </header>
  );
}

function OpponentPanel({
  player,
  activePlayerId,
  className
}: {
  readonly player: PlayerState;
  readonly activePlayerId: string;
  readonly className?: string;
}) {
  const active = player.id === activePlayerId;

  return (
    <div
      className={cn(
        "seat-panel flex min-h-24 flex-1 items-center justify-between gap-3 border px-3 py-3 transition",
        active
          ? "border-[var(--gold)] bg-[rgba(242,193,78,0.13)] shadow-[0_0_36px_rgba(242,193,78,0.12)]"
          : "border-white/10 bg-white/7",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative grid size-11 place-items-center rounded-full border border-white/10 bg-black/36">
          <Bot className="size-5 text-[var(--aqua)]" />
          {active ? (
            <span className="absolute -right-1 -top-1 size-3 rounded-full bg-[var(--gold)] shadow-[0_0_16px_rgba(242,193,78,0.8)]" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{PLAYER_NAMES[player.id]}</p>
          <p className="text-xs text-zinc-400">{player.hand.length} cards</p>
        </div>
      </div>
      <div className="flex items-center">
        <MiniCardStack count={Math.min(player.hand.length, 4)} />
      </div>
    </div>
  );
}

function MiniCardStack({ count }: { readonly count: number }) {
  return (
    <div className="relative h-10 w-14">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`card-back-${index}`}
          className="card-back absolute h-10 w-7 rounded-sm border border-white/15 shadow-lg"
          style={{
            left: index * 8,
            transform: `rotate(${(index - 1.5) * 5}deg)`
          }}
        />
      ))}
    </div>
  );
}

function TableCenter({
  game,
  message,
  className
}: {
  readonly game: GameState;
  readonly message: string;
  readonly className?: string;
}) {
  const trick = game.currentTrick;

  return (
    <section
      className={cn(
        "table-felt table-oval relative grid min-h-[20rem] place-items-center overflow-hidden border border-[var(--felt-line)] p-4",
        className
      )}
    >
      <div className="absolute inset-4 rounded-[44%/18%] border border-white/8" />
      <div className="absolute inset-8 rounded-full border border-white/8" />
      <div className="absolute inset-x-8 top-1/2 h-px bg-white/8" />
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-5 text-center">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-400">Current Trick</p>
          <h2 className="mt-1 text-xl font-black">
            {trick === null
              ? "Open table"
              : `${formatHandType(trick.hand.type)} by ${PLAYER_NAMES[trick.lastPlayedByPlayerId]}`}
          </h2>
        </div>

        <div className="flex min-h-28 flex-wrap items-center justify-center gap-2">
          <AnimatePresence mode="popLayout">
            {trick === null ? (
              <motion.div
                className="rounded-full border border-dashed border-white/18 bg-black/18 px-5 py-6 text-sm text-zinc-300"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                Winner of the last trick starts here.
              </motion.div>
            ) : (
              trick.hand.cards.map((card) => <CardView key={getCardId(card)} card={card} compact />)
            )}
          </AnimatePresence>
        </div>

        <div className="rounded-full border border-white/10 bg-black/24 px-4 py-2">
          <p className="min-h-6 max-w-lg text-sm text-zinc-200">{message}</p>
        </div>

        {game.status === "complete" ? (
          <div className="rounded-full border border-[var(--gold)] bg-black/28 px-4 py-3">
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-[var(--gold)]">
              <Sparkles className="size-4" />
              {PLAYER_NAMES[game.placements[0] ?? "you"]} wins
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HumanHand({
  player,
  activePlayerId,
  selectedCardIds,
  onToggleCard,
  onPlay,
  onPass,
  canPlaySelected,
  canPass,
  selectedCount,
  legalMoveCount,
  gameComplete,
  className
}: {
  readonly player: PlayerState;
  readonly activePlayerId: string;
  readonly selectedCardIds: readonly string[];
  readonly onToggleCard: (card: Card) => void;
  readonly onPlay: () => void;
  readonly onPass: () => void;
  readonly canPlaySelected: boolean;
  readonly canPass: boolean;
  readonly selectedCount: number;
  readonly legalMoveCount: number;
  readonly gameComplete: boolean;
  readonly className?: string;
}) {
  const active = activePlayerId === player.id;

  return (
    <section
      className={cn(
        "hand-dock border p-3 shadow-2xl backdrop-blur",
        active ? "border-[var(--gold)]" : "border-white/10",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Crown className="size-4 text-[var(--gold)]" />
            {PLAYER_NAMES[player.id]}
          </p>
          <p className="text-xs text-zinc-400">
            {active
              ? `${selectedCount} selected · ${legalMoveCount} legal options`
              : "Waiting for the table"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={onPass}
            disabled={!active || !canPass || gameComplete}
          >
            Pass
          </Button>
          <Button onClick={onPlay} disabled={!active || !canPlaySelected || gameComplete}>
            <Send className="size-4" />
            Play
          </Button>
        </div>
      </div>

      <div className="flex min-h-36 items-end overflow-x-auto px-1 pb-2 pt-5">
        <div className="flex items-end gap-1 sm:gap-2">
          {player.hand.map((card) => {
            const selected = selectedCardIds.includes(getCardId(card));

            return (
              <motion.button
                key={getCardId(card)}
                type="button"
                className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-default"
                animate={{ y: selected ? -18 : 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onToggleCard(card)}
                disabled={!active || gameComplete}
                aria-pressed={selected}
              >
                <CardView card={card} selected={selected} />
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CardView({
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
        "card-face relative grid overflow-hidden rounded-md border shadow-xl",
        compact ? "h-20 w-14 p-1.5" : "h-24 w-16 p-2 sm:h-28 sm:w-20",
        selected
          ? "border-[var(--gold)] shadow-[0_16px_34px_rgba(242,193,78,0.25)] ring-2 ring-[var(--gold)]"
          : "border-black/12"
      )}
    >
      <div className="absolute inset-x-2 top-1 h-px bg-white/70" />
      <div
        className={cn("text-left font-black leading-none", red ? "text-red-600" : "text-zinc-950")}
      >
        <div className={compact ? "text-base" : "text-lg"}>{card.rank}</div>
        <div className={compact ? "text-sm" : "text-base"}>{suitSymbol(card.suit)}</div>
      </div>
      <div
        className={cn(
          "self-center text-center font-black leading-none",
          compact ? "text-3xl" : "text-4xl",
          red ? "text-red-600" : "text-zinc-950"
        )}
      >
        {suitSymbol(card.suit)}
      </div>
      <div
        className={cn(
          "absolute bottom-1 right-1 rotate-180 font-black leading-none",
          compact ? "text-sm" : "text-base",
          red ? "text-red-600" : "text-zinc-950"
        )}
      >
        {card.rank}
      </div>
    </motion.div>
  );
}

function getPlayer(game: GameState, playerId: string): PlayerState {
  const player = game.players.find((candidate) => candidate.id === playerId);

  if (player === undefined) {
    throw new Error(`Missing player: ${playerId}`);
  }

  return player;
}

function shuffleDeck(random: () => number = Math.random): Card[] {
  const deck = createDeck();

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = deck[index];
    const swap = deck[swapIndex];

    if (current !== undefined && swap !== undefined) {
      deck[index] = swap;
      deck[swapIndex] = current;
    }
  }

  return deck;
}

function createSeededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function describeMove(playerId: string, move: Move): string {
  if (move.type === "pass") {
    return `${PLAYER_NAMES[playerId]} passed.`;
  }

  return `${PLAYER_NAMES[playerId]} played ${move.cards.map(formatCard).join(" ")}`;
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
