import {
  generateLegalMoves,
  getCardId,
  RANKS,
  validateMove,
  type Card,
  type DeckType,
  type Move,
  type Rank
} from "@deuces-arena/game-engine";
import { createRoomInviteUrl } from "@deuces-arena/shared";
import type {
  CosmeticKind,
  PlayerReportReason,
  PublicBotDifficulty,
  PublicBotPace,
  PublicCardTradeRequest,
  PublicRoomState,
  PublicRoomPlayer
} from "@deuces-arena/shared";
import { ImageBackground } from "expo-image";
import { router } from "expo-router";
import {
  ArrowLeft,
  CircleDot,
  Flag,
  MessageCircle,
  Play,
  RotateCcw,
  Send,
  Share2,
  ShieldBan,
  SlidersHorizontal,
  SkipForward,
  X
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share as NativeShare,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionButton, SegmentedControl, Stepper } from "@/components/arena-ui";
import { CardBack, PlayingCard } from "@/components/playing-card";
import jungleClubTable from "@/assets/images/jungle-club-table.jpg";
import { palette, radius, spacing } from "@/constants/theme";
import { useArena, type CasualRoomOptions } from "@/providers/arena-provider";

export default function TableScreen() {
  const {
    blockPlayer,
    leaveRoom,
    notice,
    reportPlayer,
    requestTrade,
    respondToTrade,
    room,
    sendChat,
    setReady,
    startCurrentRoom,
    submitMove,
    webUrl
  } = useArena();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [dealing, setDealing] = useState(false);
  const [working, setWorking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBody, setChatBody] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [lastReadChatCount, setLastReadChatCount] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(13);
  const [deckType, setDeckType] = useState<DeckType>("classic");
  const [difficulty, setDifficulty] = useState<PublicBotDifficulty>("normal");
  const [pace, setPace] = useState<PublicBotPace>("relaxed");
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [secondsPerTurn, setSecondsPerTurn] = useState(45);
  const [bombEndsTrick, setBombEndsTrick] = useState(false);
  const [tradeEnabled, setTradeEnabled] = useState(false);
  const [tradeTargetPlayerId, setTradeTargetPlayerId] = useState("");
  const [tradeRequestedRank, setTradeRequestedRank] = useState<Rank>("3");
  const [timerNow, setTimerNow] = useState(Date.now());
  const trickAnimation = useRef(new Animated.Value(1)).current;

  const selectedCards = useMemo(
    () => room?.yourHand.filter((card) => selectedIds.includes(getCardId(card))) ?? [],
    [room?.yourHand, selectedIds]
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
  const playableIds = useMemo(
    () =>
      new Set(
        legalMoves.flatMap((move) => (move.type === "play" ? move.cards.map(getCardId) : []))
      ),
    [legalMoves]
  );
  const canPass = legalMoves.some((move) => move.type === "pass");
  const canPlay =
    room !== null &&
    room.activePlayerId === room.yourPlayerId &&
    selectedCards.length > 0 &&
    validateMove(
      { type: "play", cards: selectedCards },
      { isFirstMove: room.turnNumber === 0, currentTrick: room.currentTrick }
    ).valid;
  const yourPlayer = room?.players.find((player) => player.id === room.yourPlayerId) ?? null;
  const seatedPlayers = useMemo(
    () => getClockwiseSeatedPlayers(room?.players ?? [], room?.yourPlayerId ?? null),
    [room?.players, room?.yourPlayerId]
  );
  const opponents = seatedPlayers.slice(1);
  const activePlayer = room?.players.find((player) => player.id === room.activePlayerId) ?? null;
  const latestEvent = room?.recentEvents.at(-1) ?? null;
  const unreadChat = Math.max(0, (room?.recentChat.length ?? 0) - lastReadChatCount);
  const yourCardBackUrl = cosmeticPreviewUrl(yourPlayer, "CARD_BACK", webUrl);
  const yourCardThemeSlug = cosmeticSlug(yourPlayer, "CARD_BACK");
  const trickPlayer =
    room?.players.find((player) => player.id === room.currentTrick?.lastPlayedByPlayerId) ?? null;
  const trickCardThemeSlug = cosmeticSlug(trickPlayer, "CARD_BACK");
  const tableThemeUrl = cosmeticPreviewUrl(yourPlayer, "TABLE_THEME", webUrl);
  const selectedPlayer = room?.players.find((player) => player.id === selectedPlayerId) ?? null;
  const tradeOpen = room?.tradePhase.status === "open";
  const incomingTrade = room?.tradePhase.requests.find(
    (request) => request.toPlayerId === room.yourPlayerId
  );
  const outgoingTrade = room?.tradePhase.requests.find(
    (request) => request.fromPlayerId === room.yourPlayerId
  );

  useEffect(() => {
    if (room?.status !== "in-progress" || room.turnNumber !== 0 || room.yourHand.length === 0)
      return;
    setDealing(true);
    const timeout = setTimeout(() => setDealing(false), 1650);
    return () => clearTimeout(timeout);
  }, [room?.roomCode, room?.status, room?.turnNumber, room?.yourHand.length]);

  useEffect(() => {
    setSelectedIds([]);
    trickAnimation.setValue(0);
    Animated.spring(trickAnimation, {
      toValue: 1,
      damping: 15,
      stiffness: 170,
      mass: 0.8,
      useNativeDriver: true
    }).start();
  }, [room?.turnNumber, trickAnimation]);

  useEffect(() => {
    if (!tradeOpen) return;
    const interval = setInterval(() => setTimerNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [tradeOpen]);

  if (room === null) {
    return (
      <SafeAreaView style={styles.missing}>
        <Text style={styles.missingTitle}>No active table</Text>
        <ActionButton label="Back to Play" onPress={() => router.replace("/(tabs)")} />
      </SafeAreaView>
    );
  }

  async function leave() {
    await leaveRoom();
    router.replace("/(tabs)");
  }

  async function move(nextMove: Move) {
    setWorking(true);
    await submitMove(nextMove);
    setWorking(false);
  }

  function openChat() {
    setLastReadChatCount(room?.recentChat.length ?? 0);
    setChatOpen(true);
  }

  async function sendMessage() {
    if (chatBody.trim() === "") return;
    setSendingChat(true);
    const sent = await sendChat(chatBody);
    if (sent) setChatBody("");
    setSendingChat(false);
  }

  async function shareRoomInvite(roomCode: string) {
    const inviteUrl = createRoomInviteUrl(webUrl, roomCode);
    await NativeShare.share({
      title: "Join my Deuces Arena table",
      message: `Join table ${roomCode} in Deuces Arena: ${inviteUrl}`,
      url: inviteUrl
    });
  }

  function toggleCard(card: Card) {
    const id = getCardId(card);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  if (room.status === "waiting") {
    const humanPlayers = room.players.filter((player) => player.kind === "human");
    const isHost = room.yourPlayerId === room.players[0]?.id;
    const yourWaitingPlayer = room.players.find((player) => player.id === room.yourPlayerId);
    const allHumansReady = humanPlayers.length <= 1 || humanPlayers.every((player) => player.ready);
    const safePlayerCount = Math.max(humanPlayers.length, playerCount);
    const emptySeats = Math.max(0, safePlayerCount - room.players.length);
    const maximumCards = Math.min(
      20,
      Math.floor((deckType === "arena-six" ? 78 : 52) / safePlayerCount)
    );
    const safeCards = Math.min(cardsPerPlayer, maximumCards);
    const startOptions: CasualRoomOptions = {
      playerCount: safePlayerCount,
      botCount: emptySeats,
      cardsPerPlayer: safeCards,
      deckType,
      difficulty,
      pace,
      timerEnabled,
      secondsPerTurn,
      bombEndsTrick,
      tradeEnabled
    };
    return (
      <SafeAreaView style={styles.waiting}>
        <View style={styles.waitingHeader}>
          <Pressable
            accessibilityLabel="Leave waiting room"
            accessibilityRole="button"
            onPress={() => void leave()}
            style={styles.backButton}
          >
            <ArrowLeft color={palette.text} size={22} />
          </Pressable>
          <View style={styles.waitingHeaderActions}>
            {isHost ? (
              <Pressable
                accessibilityLabel="Open table settings"
                accessibilityRole="button"
                onPress={() => setSettingsOpen(true)}
                style={styles.roundButton}
              >
                <SlidersHorizontal color={palette.text} size={18} />
              </Pressable>
            ) : null}
            <ChatButton unread={unreadChat} onPress={openChat} />
          </View>
        </View>
        <View style={styles.waitingCenter}>
          <View style={styles.waitingTable}>
            <Text style={styles.waitingEyebrow}>Casual table</Text>
            <Text style={styles.waitingCode}>{room.roomCode}</Text>
            <Pressable
              accessibilityLabel={`Share invite for table ${room.roomCode}`}
              accessibilityRole="button"
              onPress={() => void shareRoomInvite(room.roomCode)}
              style={({ pressed }) => [styles.copyLine, pressed && styles.pressed]}
            >
              <Share2 color={palette.gold} size={16} />
              <Text style={styles.copyText}>Invite friends</Text>
            </Pressable>
          </View>
          <Text style={styles.seatStatus}>
            {room.players.length}/{safePlayerCount} seats filled ·{" "}
            {humanPlayers.filter((player) => player.ready).length}/{humanPlayers.length} ready
          </Text>
          <Text style={styles.waitingNotice}>{notice}</Text>
        </View>
        <View style={styles.waitingActions}>
          {humanPlayers.length > 1 ? (
            <ActionButton
              label={yourWaitingPlayer?.ready ? "Not ready" : "Ready"}
              variant={yourWaitingPlayer?.ready ? "secondary" : "primary"}
              loading={working}
              onPress={() => {
                setWorking(true);
                void setReady(!yourWaitingPlayer?.ready).finally(() => setWorking(false));
              }}
            />
          ) : null}
          {isHost ? (
            <ActionButton
              label={
                emptySeats === 0
                  ? "Start table"
                  : `Start with ${emptySeats} bot${emptySeats === 1 ? "" : "s"}`
              }
              loading={working}
              disabled={!allHumansReady}
              onPress={() => {
                setWorking(true);
                void startCurrentRoom(startOptions).finally(() => setWorking(false));
              }}
            />
          ) : null}
          <ActionButton label="Leave room" variant="secondary" onPress={() => void leave()} />
        </View>
        <ChatSheet
          visible={chatOpen}
          messages={room.recentChat}
          yourPlayerId={room.yourPlayerId}
          body={chatBody}
          sending={sendingChat}
          notice={notice}
          onBodyChange={setChatBody}
          onClose={() => setChatOpen(false)}
          onSend={() => void sendMessage()}
        />
        <RoomSettingsSheet
          visible={settingsOpen}
          minimumPlayers={Math.max(2, humanPlayers.length)}
          playerCount={safePlayerCount}
          cardsPerPlayer={safeCards}
          maximumCards={maximumCards}
          deckType={deckType}
          difficulty={difficulty}
          pace={pace}
          timerEnabled={timerEnabled}
          secondsPerTurn={secondsPerTurn}
          bombEndsTrick={bombEndsTrick}
          tradeEnabled={tradeEnabled}
          onPlayerCountChange={setPlayerCount}
          onCardsPerPlayerChange={setCardsPerPlayer}
          onDeckTypeChange={setDeckType}
          onDifficultyChange={setDifficulty}
          onPaceChange={setPace}
          onTimerEnabledChange={setTimerEnabled}
          onSecondsPerTurnChange={setSecondsPerTurn}
          onBombEndsTrickChange={setBombEndsTrick}
          onTradeEnabledChange={setTradeEnabled}
          onClose={() => setSettingsOpen(false)}
        />
      </SafeAreaView>
    );
  }

  const rankedPlayers = [
    ...room.placements,
    ...room.players.map((player) => player.id).filter((id) => !room.placements.includes(id))
  ];

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.tableHeader}>
        <Pressable
          accessibilityLabel="Leave table"
          accessibilityRole="button"
          onPress={() => void leave()}
          style={styles.roundButton}
        >
          <ArrowLeft color={palette.text} size={20} />
        </Pressable>
        <View style={styles.tableIdentity}>
          <Text style={styles.tableMode}>{room.mode}</Text>
          <Text style={styles.tableCode}>{room.roomCode}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Share table invite"
            accessibilityRole="button"
            onPress={() => void shareRoomInvite(room.roomCode)}
            style={styles.roundButton}
          >
            <Share2 color={palette.text} size={18} />
          </Pressable>
          <ChatButton unread={unreadChat} onPress={openChat} />
          <View style={styles.turnPill}>
            <CircleDot color={palette.mint} size={13} />
            <Text style={styles.turnText}>{activePlayer?.name ?? "Table"}</Text>
          </View>
        </View>
      </View>

      <ImageBackground
        source={tableThemeUrl === null ? jungleClubTable : { uri: tableThemeUrl }}
        contentFit="cover"
        imageStyle={styles.feltImage}
        style={styles.felt}
      >
        <View pointerEvents="none" style={styles.feltShade} />
        <View pointerEvents="box-none" style={styles.opponents}>
          {opponents.map((player, opponentIndex) => {
            const position = opponentIndex + 1;
            const orientation = getSeatHandOrientation(position, seatedPlayers.length);

            return (
              <Pressable
                accessibilityLabel={`${player.name}, ${player.cardsRemaining} cards remaining${
                  player.id === room.activePlayerId ? ", taking their turn" : ""
                }`}
                accessibilityHint="Shows player details and safety controls"
                accessibilityRole="button"
                key={player.id}
                onPress={() => setSelectedPlayerId(player.id)}
                style={({ pressed }) => [
                  styles.opponent,
                  getMobileSeatPosition(position, seatedPlayers.length),
                  orientation !== "top" && styles.sideOpponent,
                  player.id === room.activePlayerId && styles.activeSeat,
                  pressed && styles.pressed
                ]}
              >
                <OpponentCardFan
                  count={player.cardsRemaining}
                  imageUrl={cosmeticPreviewUrl(player, "CARD_BACK", webUrl)}
                  orientation={orientation}
                />
                <Text numberOfLines={1} style={styles.opponentName}>
                  {player.name}
                </Text>
                <Text style={styles.opponentCount}>{player.cardsRemaining} cards</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.trickArea}>
          {latestEvent?.wasPass ? (
            <Text style={styles.passFlash}>
              {room.players.find((player) => player.id === latestEvent.playerId)?.name} passed
            </Text>
          ) : null}
          <Text style={styles.trickLabel}>
            {room.currentTrick === null
              ? "Lead the next trick"
              : formatHandType(room.currentTrick.hand.type)}
          </Text>
          <Animated.View
            style={[
              styles.trickCards,
              { opacity: trickAnimation, transform: [{ scale: trickAnimation }] }
            ]}
          >
            {room.currentTrick === null ? (
              <View style={styles.emptyTrick}>
                <Text style={styles.emptyTrickText}>Your table is open</Text>
              </View>
            ) : (
              room.currentTrick.hand.cards.map((card) => (
                <PlayingCard
                  key={getCardId(card)}
                  card={card}
                  themeSlug={trickCardThemeSlug}
                  compact
                />
              ))
            )}
          </Animated.View>
        </View>

        {room.status !== "complete" ? (
          <View style={styles.handArea}>
            <View style={styles.handHeading}>
              <View>
                <Text style={styles.handTitle}>{yourPlayer?.name ?? "Your hand"}</Text>
                <Text style={styles.handMeta}>
                  {selectedCards.length} selected ·{" "}
                  {legalMoves.filter((move) => move.type === "play").length} legal plays
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Clear selected cards"
                accessibilityRole="button"
                disabled={selectedIds.length === 0}
                onPress={() => setSelectedIds([])}
                style={[styles.roundButton, selectedIds.length === 0 && styles.disabled]}
              >
                <RotateCcw color={palette.muted} size={17} />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              contentContainerStyle={styles.hand}
              showsHorizontalScrollIndicator={false}
            >
              {dealing ? (
                <View style={styles.dealing}>
                  <View style={styles.dealDeck}>
                    <CardBack imageUrl={yourCardBackUrl} />
                  </View>
                  <Text accessibilityLiveRegion="polite" style={styles.dealingText}>
                    Shuffling and dealing...
                  </Text>
                </View>
              ) : (
                room.yourHand.map((card) => (
                  <PlayingCard
                    key={getCardId(card)}
                    card={card}
                    themeSlug={yourCardThemeSlug}
                    selected={selectedIds.includes(getCardId(card))}
                    disabled={!tradeOpen && !playableIds.has(getCardId(card))}
                    onPress={() => toggleCard(card)}
                  />
                ))
              )}
            </ScrollView>
            {tradeOpen ? (
              <TradeActions
                room={room}
                selectedCards={selectedCards}
                incomingTrade={incomingTrade}
                outgoingTrade={outgoingTrade}
                targetPlayerId={tradeTargetPlayerId}
                requestedRank={tradeRequestedRank}
                timerNow={timerNow}
                working={working}
                onTargetChange={setTradeTargetPlayerId}
                onRankChange={setTradeRequestedRank}
                onRequest={() => {
                  const card = selectedCards[0];
                  if (card === undefined || tradeTargetPlayerId === "") return;
                  setWorking(true);
                  void requestTrade(tradeTargetPlayerId, card, tradeRequestedRank).finally(() => {
                    setWorking(false);
                    setSelectedIds([]);
                  });
                }}
                onRespond={(accept) => {
                  if (incomingTrade === undefined) return;
                  setWorking(true);
                  void respondToTrade(
                    incomingTrade.id,
                    accept,
                    accept ? selectedCards[0] : undefined
                  ).finally(() => {
                    setWorking(false);
                    setSelectedIds([]);
                  });
                }}
              />
            ) : (
              <View style={styles.moveActions}>
                <Pressable
                  accessibilityLabel="Pass this turn"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !canPass || room.activePlayerId !== room.yourPlayerId || working
                  }}
                  disabled={!canPass || room.activePlayerId !== room.yourPlayerId || working}
                  onPress={() => void move({ type: "pass" })}
                  style={({ pressed }) => [
                    styles.passButton,
                    (!canPass || room.activePlayerId !== room.yourPlayerId) && styles.disabled,
                    pressed && styles.pressed
                  ]}
                >
                  <SkipForward color={palette.text} size={19} />
                  <Text style={styles.passLabel}>Pass</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Play ${selectedCards.length} selected card${
                    selectedCards.length === 1 ? "" : "s"
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canPlay || working }}
                  disabled={!canPlay || working}
                  onPress={() => void move({ type: "play", cards: selectedCards })}
                  style={({ pressed }) => [
                    styles.playButton,
                    !canPlay && styles.disabled,
                    pressed && styles.pressed
                  ]}
                >
                  <Play color={palette.ink} fill={palette.ink} size={18} />
                  <Text style={styles.playLabel}>Play</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        {room.status === "complete" ? (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>Match complete</Text>
            {rankedPlayers.map((playerId, index) => {
              const player = room.players.find((item) => item.id === playerId);
              return (
                <View key={playerId} style={styles.resultRow}>
                  <Text style={styles.place}>{index + 1}</Text>
                  <Text style={styles.resultName}>{player?.name ?? "Player"}</Text>
                  <Text style={styles.cardsLeft}>{player?.cardsRemaining ?? 0} left</Text>
                </View>
              );
            })}
            <ActionButton label="Back to lobby" onPress={() => void leave()} />
          </View>
        ) : null}
      </ImageBackground>
      <ChatSheet
        visible={chatOpen}
        messages={room.recentChat}
        yourPlayerId={room.yourPlayerId}
        body={chatBody}
        sending={sendingChat}
        notice={notice}
        onBodyChange={setChatBody}
        onClose={() => setChatOpen(false)}
        onSend={() => void sendMessage()}
      />
      <PlayerSheet
        player={selectedPlayer}
        blocked={selectedPlayer !== null && room.blockedPlayerIds.includes(selectedPlayer.id)}
        onBlock={(blocked) => blockPlayer(selectedPlayer?.id ?? "", blocked)}
        onClose={() => setSelectedPlayerId(null)}
        onReport={(reason, details) => reportPlayer(selectedPlayer?.id ?? "", reason, details)}
      />
    </SafeAreaView>
  );
}

function OpponentCardFan({
  count,
  imageUrl,
  orientation
}: {
  readonly count: number;
  readonly imageUrl: string | null;
  readonly orientation: "top" | "left" | "right";
}) {
  const vertical = orientation !== "top";
  const overlap = 4;
  const width = vertical ? 28 : count === 0 ? 28 : 28 + Math.max(0, count - 1) * overlap;
  const height = vertical ? 42 + Math.max(0, count - 1) * overlap : 48;
  const middle = Math.max(0, count - 1) / 2;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.opponentCards, { width, height }]}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            styles.fannedCard,
            {
              left: vertical ? 0 : index * overlap,
              top: vertical ? index * overlap : Math.abs(index - middle) * 0.45,
              transform: [{ rotate: `${(index - middle) * (vertical ? 0.35 : 1.35)}deg` }]
            }
          ]}
        >
          <CardBack accessible={false} imageUrl={imageUrl} mini />
        </View>
      ))}
    </View>
  );
}

function getClockwiseSeatedPlayers(
  players: readonly PublicRoomPlayer[],
  yourPlayerId: string | null
): readonly PublicRoomPlayer[] {
  const anchorIndex = players.findIndex((player) => player.id === yourPlayerId);
  if (anchorIndex <= 0) return players;
  return [...players.slice(anchorIndex), ...players.slice(0, anchorIndex)];
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

function getMobileSeatPosition(position: number, seatCount: number): ViewStyle {
  const layouts: Readonly<Record<number, readonly ViewStyle[]>> = {
    2: [{ top: 12, left: "50%", transform: [{ translateX: -47 }] }],
    3: [
      { left: 5, top: "35%", transform: [{ translateY: -55 }] },
      { right: 5, top: "35%", transform: [{ translateY: -55 }] }
    ],
    4: [
      { left: 5, top: "36%", transform: [{ translateY: -58 }] },
      { top: 12, left: "50%", transform: [{ translateX: -47 }] },
      { right: 5, top: "36%", transform: [{ translateY: -58 }] }
    ],
    5: [
      { left: 5, top: "50%", transform: [{ translateY: -58 }] },
      { top: 12, left: "28%", transform: [{ translateX: -47 }] },
      { top: 12, right: "28%", transform: [{ translateX: 47 }] },
      { right: 5, top: "50%", transform: [{ translateY: -58 }] }
    ],
    6: [
      { left: 5, top: "55%", transform: [{ translateY: -58 }] },
      { left: 5, top: "25%", transform: [{ translateY: -58 }] },
      { top: 12, left: "50%", transform: [{ translateX: -47 }] },
      { right: 5, top: "25%", transform: [{ translateY: -58 }] },
      { right: 5, top: "55%", transform: [{ translateY: -58 }] }
    ]
  };

  return layouts[seatCount]?.[position - 1] ?? { top: 12, left: "50%" };
}

function cosmeticPreviewUrl(
  player: PublicRoomPlayer | null,
  kind: CosmeticKind,
  webUrl: string
): string | null {
  const previewUrl = player?.equippedCosmetics.find((item) => item.kind === kind)?.cosmetic
    .previewUrl;
  if (previewUrl === null || previewUrl === undefined) return null;
  if (/^https?:\/\//.test(previewUrl)) return previewUrl;
  return `${webUrl.replace(/\/$/, "")}${previewUrl.startsWith("/") ? "" : "/"}${previewUrl}`;
}

function cosmeticSlug(player: PublicRoomPlayer | null, kind: CosmeticKind): string | null {
  return player?.equippedCosmetics.find((item) => item.kind === kind)?.cosmetic.slug ?? null;
}

function ChatButton({
  unread,
  onPress
}: {
  readonly unread: number;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={unread > 0 ? `Open table chat, ${unread} unread` : "Open table chat"}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.roundButton}
    >
      <MessageCircle color={palette.text} size={19} />
      {unread > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{Math.min(unread, 9)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function RoomSettingsSheet({
  visible,
  minimumPlayers,
  playerCount,
  cardsPerPlayer,
  maximumCards,
  deckType,
  difficulty,
  pace,
  timerEnabled,
  secondsPerTurn,
  bombEndsTrick,
  tradeEnabled,
  onPlayerCountChange,
  onCardsPerPlayerChange,
  onDeckTypeChange,
  onDifficultyChange,
  onPaceChange,
  onTimerEnabledChange,
  onSecondsPerTurnChange,
  onBombEndsTrickChange,
  onTradeEnabledChange,
  onClose
}: {
  readonly visible: boolean;
  readonly minimumPlayers: number;
  readonly playerCount: number;
  readonly cardsPerPlayer: number;
  readonly maximumCards: number;
  readonly deckType: DeckType;
  readonly difficulty: PublicBotDifficulty;
  readonly pace: PublicBotPace;
  readonly timerEnabled: boolean;
  readonly secondsPerTurn: number;
  readonly bombEndsTrick: boolean;
  readonly tradeEnabled: boolean;
  readonly onPlayerCountChange: (value: number) => void;
  readonly onCardsPerPlayerChange: (value: number) => void;
  readonly onDeckTypeChange: (value: DeckType) => void;
  readonly onDifficultyChange: (value: PublicBotDifficulty) => void;
  readonly onPaceChange: (value: PublicBotPace) => void;
  readonly onTimerEnabledChange: (value: boolean) => void;
  readonly onSecondsPerTurnChange: (value: number) => void;
  readonly onBombEndsTrickChange: (value: boolean) => void;
  readonly onTradeEnabledChange: (value: boolean) => void;
  readonly onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="Close table settings"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={styles.settingsSheet}>
          <View style={styles.chatHeader}>
            <View>
              <Text style={styles.playerSheetTitle}>Table settings</Text>
              <Text style={styles.chatSubtitle}>Applied when the host starts the match</Text>
            </View>
            <Pressable
              accessibilityLabel="Close table settings"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.roundButton}
            >
              <X color={palette.text} size={19} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.settingsBody}>
            <Stepper
              label="Players"
              value={playerCount}
              minimum={minimumPlayers}
              maximum={6}
              onChange={onPlayerCountChange}
            />
            <Stepper
              label="Cards each"
              value={cardsPerPlayer}
              minimum={5}
              maximum={maximumCards}
              onChange={onCardsPerPlayerChange}
            />
            <SettingsGroup title="Deck">
              <SegmentedControl
                value={deckType}
                options={[
                  { label: "Classic", value: "classic" },
                  { label: "Arena 6", value: "arena-six" }
                ]}
                onChange={onDeckTypeChange}
              />
            </SettingsGroup>
            <SettingsGroup title="Bot difficulty">
              <SegmentedControl
                value={difficulty}
                options={[
                  { label: "Easy", value: "easy" },
                  { label: "Normal", value: "normal" },
                  { label: "Hard", value: "hard" }
                ]}
                onChange={onDifficultyChange}
              />
            </SettingsGroup>
            <SettingsGroup title="Bot pace">
              <SegmentedControl
                value={pace}
                options={[
                  { label: "Quick", value: "quick" },
                  { label: "Normal", value: "normal" },
                  { label: "Relaxed", value: "relaxed" }
                ]}
                onChange={onPaceChange}
              />
            </SettingsGroup>
            <SettingsToggle
              label="Turn timer"
              detail={
                timerEnabled ? `${secondsPerTurn} seconds per turn` : "No automatic turn limit"
              }
              value={timerEnabled}
              onChange={onTimerEnabledChange}
            />
            {timerEnabled ? (
              <Stepper
                label="Timer seconds"
                value={secondsPerTurn}
                minimum={15}
                maximum={120}
                onChange={onSecondsPerTurnChange}
              />
            ) : null}
            <SettingsToggle
              label="Bomb ends trick"
              detail="A bomb immediately wins the current trick"
              value={bombEndsTrick}
              onChange={onBombEndsTrickChange}
            />
            <SettingsToggle
              label="Pregame card trades"
              detail="One request per player during a 20-second casual-only window"
              value={tradeEnabled}
              onChange={onTradeEnabledChange}
            />
          </ScrollView>
          <ActionButton label="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function TradeActions({
  room,
  selectedCards,
  incomingTrade,
  outgoingTrade,
  targetPlayerId,
  requestedRank,
  timerNow,
  working,
  onTargetChange,
  onRankChange,
  onRequest,
  onRespond
}: {
  readonly room: PublicRoomState;
  readonly selectedCards: readonly Card[];
  readonly incomingTrade: PublicCardTradeRequest | undefined;
  readonly outgoingTrade: PublicCardTradeRequest | undefined;
  readonly targetPlayerId: string;
  readonly requestedRank: Rank;
  readonly timerNow: number;
  readonly working: boolean;
  readonly onTargetChange: (playerId: string) => void;
  readonly onRankChange: (rank: Rank) => void;
  readonly onRequest: () => void;
  readonly onRespond: (accept: boolean) => void;
}) {
  const targets = room.players.filter(
    (player) => player.id !== room.yourPlayerId && player.kind === "human" && player.connected
  );
  const secondsRemaining =
    room.tradePhase.deadlineAt === null
      ? 0
      : Math.max(0, Math.ceil((new Date(room.tradePhase.deadlineAt).getTime() - timerNow) / 1_000));
  const selectedCard = selectedCards[0];

  return (
    <View style={styles.tradePanel}>
      <View style={styles.tradeHeading}>
        <View>
          <Text style={styles.tradeTitle}>Card trade</Text>
          <Text style={styles.chatSubtitle}>One request and one accepted trade per player</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.tradeTimer}>
          {secondsRemaining}s
        </Text>
      </View>

      {incomingTrade !== undefined ? (
        <View style={styles.tradeBody}>
          <Text style={styles.tradeCopy}>
            {room.players.find((player) => player.id === incomingTrade.fromPlayerId)?.name ??
              "Player"}{" "}
            offers a card for one of your {incomingTrade.requestedRank}s. Select one matching card.
          </Text>
          <View style={styles.safetyActions}>
            <ActionButton
              label="Decline"
              variant="secondary"
              disabled={working}
              onPress={() => onRespond(false)}
              style={styles.safetyAction}
            />
            <ActionButton
              label="Accept"
              loading={working}
              disabled={
                selectedCards.length !== 1 || selectedCard?.rank !== incomingTrade.requestedRank
              }
              onPress={() => onRespond(true)}
              style={styles.safetyAction}
            />
          </View>
        </View>
      ) : outgoingTrade !== undefined ? (
        <Text style={styles.tradeCopy}>
          Waiting for{" "}
          {room.players.find((player) => player.id === outgoingTrade.toPlayerId)?.name ??
            "the player"}{" "}
          to answer your request for a {outgoingTrade.requestedRank}.
        </Text>
      ) : room.tradePhase.yourTradeCompleted ? (
        <Text style={styles.tradeCopy}>Trade complete. Normal play begins when time expires.</Text>
      ) : room.tradePhase.yourRequestUsed ? (
        <Text style={styles.tradeCopy}>
          Your request is finished. Waiting for the window to close.
        </Text>
      ) : targets.length === 0 ? (
        <Text style={styles.tradeCopy}>No other connected human is available to trade.</Text>
      ) : (
        <View style={styles.tradeBody}>
          <Text style={styles.tradeCopy}>
            Select one card to offer, then choose a player and rank.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tradeChoices}
          >
            {targets.map((player) => (
              <Pressable
                key={player.id}
                accessibilityRole="button"
                accessibilityState={{ selected: targetPlayerId === player.id }}
                onPress={() => onTargetChange(player.id)}
                style={[styles.tradeChoice, targetPlayerId === player.id && styles.selectedReason]}
              >
                <Text style={styles.reasonText}>{player.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tradeChoices}
          >
            {RANKS.map((rank) => (
              <Pressable
                key={rank}
                accessibilityLabel={`Request rank ${rank}`}
                accessibilityRole="button"
                accessibilityState={{ selected: requestedRank === rank }}
                onPress={() => onRankChange(rank)}
                style={[styles.rankChoice, requestedRank === rank && styles.selectedReason]}
              >
                <Text style={styles.reasonText}>{rank}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ActionButton
            label="Send trade request"
            loading={working}
            disabled={selectedCards.length !== 1 || targetPlayerId === ""}
            onPress={onRequest}
          />
        </View>
      )}
    </View>
  );
}

function SettingsGroup({
  title,
  children
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.settingsGroup}>
      <Text style={styles.safetyTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SettingsToggle({
  label,
  detail,
  value,
  onChange
}: {
  readonly label: string;
  readonly detail: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingsToggle}>
      <View style={styles.settingsToggleCopy}>
        <Text style={styles.safetyTitle}>{label}</Text>
        <Text style={styles.chatSubtitle}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: palette.line, true: palette.felt }}
        thumbColor={value ? palette.gold : palette.muted}
      />
    </View>
  );
}

function ChatSheet({
  visible,
  messages,
  yourPlayerId,
  body,
  sending,
  notice,
  onBodyChange,
  onClose,
  onSend
}: {
  readonly visible: boolean;
  readonly messages: readonly {
    readonly id: string;
    readonly playerId: string;
    readonly playerName: string;
    readonly body: string;
    readonly createdAt: string;
  }[];
  readonly yourPlayerId: string | null;
  readonly body: string;
  readonly sending: boolean;
  readonly notice: string;
  readonly onBodyChange: (body: string) => void;
  readonly onClose: () => void;
  readonly onSend: () => void;
}) {
  const messageScroll = useRef<ScrollView | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalRoot}
      >
        <Pressable
          accessibilityLabel="Close table chat"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={styles.chatSheet}>
          <View style={styles.chatHeader}>
            <View>
              <Text style={styles.chatTitle}>Table chat</Text>
              <Text style={styles.chatSubtitle}>{messages.length} recent messages</Text>
            </View>
            <Pressable
              accessibilityLabel="Close table chat"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.roundButton}
            >
              <X color={palette.text} size={19} />
            </Pressable>
          </View>
          <ScrollView
            ref={messageScroll}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => messageScroll.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <MessageCircle color={palette.muted} size={24} />
                <Text style={styles.emptyChatText}>No messages yet.</Text>
              </View>
            ) : (
              messages.map((message) => {
                const own = message.playerId === yourPlayerId;
                return (
                  <View key={message.id} style={[styles.message, own && styles.ownMessage]}>
                    <Text style={[styles.messageName, own && styles.ownMessageName]}>
                      {own ? "You" : message.playerName}
                    </Text>
                    <Text style={styles.messageBody}>{message.body}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Table chat message"
              value={body}
              onChangeText={onBodyChange}
              onSubmitEditing={onSend}
              maxLength={240}
              returnKeyType="send"
              placeholder="Message the table..."
              placeholderTextColor={palette.muted}
              style={styles.chatInput}
            />
            <Pressable
              accessibilityLabel="Send message"
              accessibilityRole="button"
              accessibilityState={{ disabled: body.trim() === "" || sending, busy: sending }}
              disabled={body.trim() === "" || sending}
              onPress={onSend}
              style={[styles.sendButton, (body.trim() === "" || sending) && styles.disabled]}
            >
              <Send color={palette.ink} size={18} />
            </Pressable>
          </View>
          {notice.toLowerCase().includes("message") ? (
            <Text style={styles.chatNotice}>{notice}</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const REPORT_REASONS: readonly {
  readonly label: string;
  readonly value: PlayerReportReason;
}[] = [
  { label: "Harassment", value: "HARASSMENT" },
  { label: "Hate speech", value: "HATE_SPEECH" },
  { label: "Spam", value: "SPAM" },
  { label: "Cheating", value: "CHEATING" },
  { label: "Player name", value: "INAPPROPRIATE_NAME" },
  { label: "Other", value: "OTHER" }
];

function PlayerSheet({
  player,
  blocked,
  onBlock,
  onClose,
  onReport
}: {
  readonly player: PublicRoomPlayer | null;
  readonly blocked: boolean;
  readonly onBlock: (blocked: boolean) => Promise<boolean>;
  readonly onClose: () => void;
  readonly onReport: (reason: PlayerReportReason, details?: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState<PlayerReportReason>("HARASSMENT");
  const [details, setDetails] = useState("");
  const [working, setWorking] = useState<"block" | "report" | null>(null);

  useEffect(() => {
    setReason("HARASSMENT");
    setDetails("");
    setWorking(null);
  }, [player?.id]);

  if (player === null) return null;
  const canModerate = player.kind !== "bot";

  async function toggleBlock() {
    setWorking("block");
    await onBlock(!blocked);
    setWorking(null);
  }

  async function submitReport() {
    setWorking("report");
    const sent = await onReport(reason, details);
    setWorking(null);
    if (sent) onClose();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="Close player details"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={styles.playerSheet}>
          <View style={styles.chatHeader}>
            <View>
              <Text style={styles.playerSheetTitle}>{player.name}</Text>
              <Text style={styles.chatSubtitle}>
                {player.kind === "bot" ? "Bot opponent" : "Player profile"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close player details"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.roundButton}
            >
              <X color={palette.text} size={19} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.playerSheetBody}>
            <View style={styles.playerStats}>
              <PlayerStat label="Cards left" value={String(player.cardsRemaining)} />
              <PlayerStat label="Rating" value={player.stats?.rating.toString() ?? "--"} />
              <PlayerStat label="Games" value={player.stats?.gamesPlayed.toString() ?? "--"} />
              <PlayerStat label="Wins" value={player.stats?.wins.toString() ?? "--"} />
            </View>

            {canModerate ? (
              <>
                <View style={styles.safetyHeading}>
                  <Flag color={palette.coral} size={17} />
                  <Text style={styles.safetyTitle}>Report player</Text>
                </View>
                <View style={styles.reasonGrid}>
                  {REPORT_REASONS.map((option) => {
                    const selected = option.value === reason;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setReason(option.value)}
                        style={[styles.reasonButton, selected && styles.selectedReason]}
                      >
                        <Text style={[styles.reasonText, selected && styles.selectedReasonText]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  accessibilityLabel="Optional report details"
                  maxLength={500}
                  multiline
                  onChangeText={setDetails}
                  placeholder="Optional details"
                  placeholderTextColor={palette.muted}
                  style={styles.reportInput}
                  textAlignVertical="top"
                  value={details}
                />
                <View style={styles.safetyActions}>
                  <ActionButton
                    label={blocked ? "Unblock" : "Block"}
                    loading={working === "block"}
                    disabled={working !== null}
                    variant="secondary"
                    onPress={() => void toggleBlock()}
                    style={styles.safetyAction}
                  />
                  <ActionButton
                    label="Send report"
                    loading={working === "report"}
                    disabled={working !== null}
                    variant="danger"
                    onPress={() => void submitReport()}
                    style={styles.safetyAction}
                  />
                </View>
                <View style={styles.blockNote}>
                  <ShieldBan color={palette.muted} size={15} />
                  <Text style={styles.blockNoteText}>
                    Blocking hides this player&apos;s table chat.
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.botNote}>Bot opponents use the selected table difficulty.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlayerStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.playerStat}>
      <Text style={styles.playerStatValue}>{value}</Text>
      <Text style={styles.playerStatLabel}>{label}</Text>
    </View>
  );
}

function formatHandType(type: string): string {
  return type
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.black },
  tableHeader: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    backgroundColor: palette.black
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line
  },
  tableIdentity: { alignItems: "center" },
  tableMode: { color: palette.mint, fontSize: 10, fontWeight: "900" },
  tableCode: { color: palette.text, fontSize: 14, fontWeight: "900" },
  turnPill: {
    maxWidth: 108,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 17,
    backgroundColor: palette.surface
  },
  turnText: { flexShrink: 1, color: palette.text, fontSize: 11, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  unreadBadge: {
    position: "absolute",
    right: -3,
    top: -3,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.coral
  },
  unreadText: { color: palette.white, fontSize: 9, fontWeight: "900" },
  felt: {
    flex: 1,
    minHeight: 500,
    marginHorizontal: 5,
    marginBottom: 5,
    overflow: "hidden",
    backgroundColor: palette.feltDeep,
    borderRadius: radius.table,
    borderWidth: 3,
    borderColor: "#1c332b"
  },
  feltImage: { borderRadius: radius.table },
  feltShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(3, 12, 9, 0.52)"
  },
  opponents: {
    ...StyleSheet.absoluteFill,
    zIndex: 3
  },
  opponent: {
    position: "absolute",
    width: 94,
    alignItems: "center",
    padding: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent"
  },
  sideOpponent: { width: 56, paddingHorizontal: 3 },
  activeSeat: { backgroundColor: "rgba(241,199,91,0.11)", borderColor: "rgba(241,199,91,0.65)" },
  opponentCards: { height: 48, maxWidth: 88, alignSelf: "center" },
  fannedCard: { position: "absolute" },
  opponentName: {
    width: "100%",
    color: palette.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  opponentCount: { color: palette.muted, fontSize: 10, marginTop: 2 },
  trickArea: {
    flex: 1,
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  passFlash: { color: palette.gold, fontSize: 13, fontWeight: "900", marginBottom: 5 },
  trickLabel: { color: palette.text, fontSize: 17, fontWeight: "900" },
  trickCards: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: spacing.sm
  },
  emptyTrick: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 24
  },
  emptyTrickText: { color: palette.muted, fontSize: 12 },
  handArea: {
    minHeight: 220,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(3, 9, 7, 0.48)"
  },
  handHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm
  },
  handTitle: { color: palette.text, fontSize: 15, fontWeight: "900" },
  handMeta: { color: palette.muted, fontSize: 11, marginTop: 2 },
  hand: {
    minWidth: "100%",
    minHeight: 111,
    alignItems: "flex-end",
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 5
  },
  dealing: {
    width: 330,
    height: 104,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg
  },
  dealDeck: { transform: [{ rotate: "-5deg" }] },
  dealingText: { color: palette.text, fontSize: 14, fontWeight: "800" },
  moveActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs
  },
  passButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line
  },
  passLabel: { color: palette.text, fontSize: 15, fontWeight: "900" },
  playButton: {
    flex: 1.45,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: palette.gold,
    borderRadius: radius.md
  },
  playLabel: { color: palette.ink, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.72 },
  results: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    backgroundColor: "rgba(5,7,6,0.94)",
    padding: spacing.xl,
    justifyContent: "center",
    gap: spacing.sm
  },
  resultsTitle: { color: palette.gold, fontSize: 27, fontWeight: "900", marginBottom: spacing.sm },
  resultRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  place: { width: 28, color: palette.gold, fontSize: 18, fontWeight: "900" },
  resultName: { flex: 1, color: palette.text, fontSize: 15, fontWeight: "800" },
  cardsLeft: { color: palette.muted, fontSize: 12 },
  missing: {
    flex: 1,
    backgroundColor: palette.ink,
    padding: spacing.xl,
    justifyContent: "center",
    gap: spacing.xl
  },
  missingTitle: { color: palette.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
  waiting: { flex: 1, backgroundColor: palette.ink, padding: spacing.lg },
  waitingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  waitingHeaderActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised
  },
  waitingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  waitingTable: {
    width: "100%",
    aspectRatio: 1.65,
    borderRadius: 80,
    backgroundColor: palette.felt,
    borderWidth: 9,
    borderColor: "#24332e",
    alignItems: "center",
    justifyContent: "center"
  },
  waitingEyebrow: {
    color: palette.mint,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  waitingCode: { color: palette.text, fontSize: 38, fontWeight: "900", marginVertical: 6 },
  copyLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  copyText: { color: palette.gold, fontSize: 12, fontWeight: "700" },
  seatStatus: { color: palette.text, fontSize: 16, fontWeight: "800" },
  waitingNotice: { color: palette.muted, fontSize: 12, textAlign: "center" },
  waitingActions: { gap: spacing.sm },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.58)" },
  chatSheet: {
    height: "68%",
    minHeight: 430,
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.line,
    padding: spacing.lg,
    paddingBottom: spacing.xl
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md
  },
  chatTitle: { color: palette.text, fontSize: 20, fontWeight: "900" },
  chatSubtitle: { color: palette.muted, fontSize: 10, marginTop: 2 },
  messages: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  emptyChat: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyChatText: { color: palette.muted, fontSize: 12 },
  message: {
    alignSelf: "flex-start",
    maxWidth: "82%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceRaised
  },
  ownMessage: { alignSelf: "flex-end", backgroundColor: palette.felt },
  messageName: { color: palette.mint, fontSize: 9, fontWeight: "900", marginBottom: 3 },
  ownMessageName: { color: palette.gold },
  messageBody: { color: palette.text, fontSize: 13, lineHeight: 18 },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  chatInput: {
    flex: 1,
    height: 48,
    color: palette.text,
    backgroundColor: palette.ink,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.gold
  },
  chatNotice: { color: palette.coral, fontSize: 10, textAlign: "center", marginTop: spacing.sm },
  playerSheet: {
    maxHeight: "86%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.line,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md
  },
  playerSheetTitle: { color: palette.text, fontSize: 22, fontWeight: "900" },
  playerSheetBody: { gap: spacing.md, paddingBottom: spacing.sm },
  playerStats: { flexDirection: "row", gap: spacing.sm },
  playerStat: {
    flex: 1,
    minHeight: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: palette.ink
  },
  playerStatValue: { color: palette.text, fontSize: 17, fontWeight: "900" },
  playerStatLabel: { color: palette.muted, fontSize: 9, marginTop: 2 },
  safetyHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  safetyTitle: { color: palette.text, fontSize: 14, fontWeight: "900" },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  reasonButton: {
    width: "48%",
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.ink
  },
  selectedReason: { borderColor: palette.gold, backgroundColor: "rgba(241,199,91,0.12)" },
  reasonText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  selectedReasonText: { color: palette.gold },
  reportInput: {
    minHeight: 74,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    backgroundColor: palette.ink,
    padding: spacing.md,
    fontSize: 13
  },
  safetyActions: { flexDirection: "row", gap: spacing.sm },
  safetyAction: { flex: 1 },
  blockNote: { flexDirection: "row", alignItems: "center", gap: 7 },
  blockNoteText: { flex: 1, color: palette.muted, fontSize: 10 },
  botNote: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  tradePanel: {
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(241,199,91,0.38)",
    backgroundColor: "rgba(5,12,9,0.88)"
  },
  tradeHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  tradeTitle: { color: palette.gold, fontSize: 15, fontWeight: "900" },
  tradeTimer: {
    minWidth: 42,
    color: palette.ink,
    backgroundColor: palette.gold,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: "hidden",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "900"
  },
  tradeBody: { gap: spacing.sm },
  tradeCopy: { color: palette.text, fontSize: 12, lineHeight: 17 },
  tradeChoices: { gap: spacing.sm, paddingVertical: 2 },
  tradeChoice: {
    minHeight: 38,
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.ink
  },
  rankChoice: {
    width: 40,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.ink
  },
  settingsSheet: {
    height: "88%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.line,
    padding: spacing.lg,
    paddingBottom: spacing.xl
  },
  settingsBody: { gap: spacing.md, paddingBottom: spacing.xl },
  settingsGroup: { gap: spacing.sm },
  settingsToggle: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  settingsToggleCopy: { flex: 1 }
});
