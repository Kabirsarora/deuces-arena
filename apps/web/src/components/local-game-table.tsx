"use client";

import {
  applyMove,
  chooseBotMove,
  createDeck,
  createInitialGame,
  generateLegalMoves,
  getCardId,
  type Card,
  type GameState,
  type Move,
  type PlayerState
} from "@deuces-arena/game-engine";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, RotateCcw, Send, Sparkles } from "lucide-react";
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
  const [game, setGame] = useState<GameState>(() => createInitialGame(PLAYER_IDS, shuffleDeck()));
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

  return (
    <main className="min-h-screen overflow-hidden px-3 py-4 text-white sm:px-5 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col gap-3">
        <TopBar game={game} onReset={resetGame} />

        <div className="grid flex-1 grid-rows-[auto_1fr_auto] gap-3 lg:grid-cols-[13rem_1fr_13rem] lg:grid-rows-[auto_1fr_auto]">
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
          <TableCenter game={game} message={message} className="lg:col-start-2 lg:row-start-2" />
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
            gameComplete={game.status === "complete"}
            className="lg:col-span-3"
          />
        </div>
      </section>
    </main>
  );
}

function TopBar({ game, onReset }: { readonly game: GameState; readonly onReset: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/24 px-3 py-3 backdrop-blur">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--aqua)]">
          Deuces Arena
        </p>
        <h1 className="truncate text-xl font-bold sm:text-2xl">Local Table</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden rounded-md border border-white/10 bg-white/7 px-3 py-2 text-sm text-zinc-200 sm:block">
          Turn {game.turnNumber + 1}
        </div>
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
        "flex min-h-20 flex-1 items-center justify-between rounded-md border px-3 py-3 transition",
        active ? "border-[var(--gold)] bg-[rgba(242,193,78,0.12)]" : "border-white/10 bg-white/7",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 place-items-center rounded-md bg-black/32">
          <Bot className="size-5 text-[var(--aqua)]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{PLAYER_NAMES[player.id]}</p>
          <p className="text-xs text-zinc-400">{player.hand.length} cards</p>
        </div>
      </div>
      {active ? <span className="text-xs font-bold text-[var(--gold)]">TURN</span> : null}
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
        "relative grid min-h-[18rem] place-items-center overflow-hidden rounded-md border border-[var(--felt-line)] bg-[radial-gradient(circle_at_center,_var(--table)_0%,_var(--table-deep)_72%)] p-4 shadow-2xl",
        className
      )}
    >
      <div className="absolute inset-4 rounded-md border border-white/7" />
      <div className="absolute inset-x-8 top-1/2 h-px bg-white/8" />
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-4 text-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Current Trick
          </p>
          <h2 className="mt-1 text-lg font-bold">
            {trick === null
              ? "Open table"
              : `${formatHandType(trick.hand.type)} by ${PLAYER_NAMES[trick.lastPlayedByPlayerId]}`}
          </h2>
        </div>

        <div className="flex min-h-24 flex-wrap items-center justify-center gap-2">
          <AnimatePresence mode="popLayout">
            {trick === null ? (
              <motion.div
                className="rounded-md border border-dashed border-white/18 px-4 py-6 text-sm text-zinc-300"
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

        <p className="min-h-6 max-w-lg text-sm text-zinc-200">{message}</p>

        {game.status === "complete" ? (
          <div className="rounded-md border border-[var(--gold)] bg-black/28 px-4 py-3">
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
  readonly gameComplete: boolean;
  readonly className?: string;
}) {
  const active = activePlayerId === player.id;

  return (
    <section
      className={cn(
        "rounded-md border bg-black/22 p-3 backdrop-blur",
        active ? "border-[var(--gold)]" : "border-white/10",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{PLAYER_NAMES[player.id]}</p>
          <p className="text-xs text-zinc-400">{active ? "Your move" : "Waiting for the table"}</p>
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

      <div className="flex min-h-32 items-end overflow-x-auto px-1 pb-2 pt-4">
        <div className="flex items-end gap-1 sm:gap-2">
          {player.hand.map((card) => {
            const selected = selectedCardIds.includes(getCardId(card));

            return (
              <motion.button
                key={getCardId(card)}
                type="button"
                className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
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
        "card-face grid rounded-md border shadow-xl",
        compact ? "h-20 w-14 p-1.5" : "h-24 w-16 p-2 sm:h-28 sm:w-20",
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
          "self-center text-center font-black leading-none",
          compact ? "text-2xl" : "text-3xl",
          red ? "text-red-600" : "text-zinc-950"
        )}
      >
        {suitSymbol(card.suit)}
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

function shuffleDeck(): Card[] {
  const deck = createDeck();

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = deck[index];
    const swap = deck[swapIndex];

    if (current !== undefined && swap !== undefined) {
      deck[index] = swap;
      deck[swapIndex] = current;
    }
  }

  return deck;
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
