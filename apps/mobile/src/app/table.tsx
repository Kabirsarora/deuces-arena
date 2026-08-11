import {
  generateLegalMoves,
  getCardId,
  validateMove,
  type Card,
  type Move
} from "@deuces-arena/game-engine";
import { router } from "expo-router";
import {
  ArrowLeft,
  CircleDot,
  Copy,
  MessageCircle,
  Play,
  RotateCcw,
  Send,
  SkipForward,
  X
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionButton } from "@/components/arena-ui";
import { CardBack, PlayingCard } from "@/components/playing-card";
import { palette, radius, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

export default function TableScreen() {
  const { leaveRoom, notice, room, sendChat, startCurrentRoom, submitMove } = useArena();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [dealing, setDealing] = useState(false);
  const [working, setWorking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBody, setChatBody] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [lastReadChatCount, setLastReadChatCount] = useState(0);
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
  const opponents = room?.players.filter((player) => player.id !== room.yourPlayerId) ?? [];
  const activePlayer = room?.players.find((player) => player.id === room.activePlayerId) ?? null;
  const latestEvent = room?.recentEvents.at(-1) ?? null;
  const unreadChat = Math.max(0, (room?.recentChat.length ?? 0) - lastReadChatCount);

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

  function toggleCard(card: Card) {
    const id = getCardId(card);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  if (room.status === "waiting") {
    const emptySeats = Math.max(0, room.rules.playerCount - room.players.length);
    return (
      <SafeAreaView style={styles.waiting}>
        <View style={styles.waitingHeader}>
          <Pressable onPress={() => void leave()} style={styles.backButton}>
            <ArrowLeft color={palette.text} size={22} />
          </Pressable>
          <ChatButton unread={unreadChat} onPress={openChat} />
        </View>
        <View style={styles.waitingCenter}>
          <View style={styles.waitingTable}>
            <Text style={styles.waitingEyebrow}>Casual table</Text>
            <Text style={styles.waitingCode}>{room.roomCode}</Text>
            <View style={styles.copyLine}>
              <Copy color={palette.gold} size={16} />
              <Text style={styles.copyText}>Share this code with friends</Text>
            </View>
          </View>
          <Text style={styles.seatStatus}>
            {room.players.length}/{room.rules.playerCount} seats filled
          </Text>
          <Text style={styles.waitingNotice}>{notice}</Text>
        </View>
        <View style={styles.waitingActions}>
          <ActionButton
            label={
              emptySeats === 0
                ? "Start table"
                : `Fill ${emptySeats} seat${emptySeats === 1 ? "" : "s"} with bots`
            }
            loading={working}
            onPress={() => {
              setWorking(true);
              void startCurrentRoom(emptySeats).finally(() => setWorking(false));
            }}
          />
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
          <ChatButton unread={unreadChat} onPress={openChat} />
          <View style={styles.turnPill}>
            <CircleDot color={palette.mint} size={13} />
            <Text style={styles.turnText}>{activePlayer?.name ?? "Table"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.felt}>
        <ScrollView
          horizontal
          contentContainerStyle={styles.opponents}
          showsHorizontalScrollIndicator={false}
        >
          {opponents.map((player) => (
            <View
              key={player.id}
              style={[styles.opponent, player.id === room.activePlayerId && styles.activeSeat]}
            >
              <View style={styles.opponentCards}>
                <CardBack compact />
                <View style={styles.secondBack}>
                  <CardBack compact />
                </View>
              </View>
              <Text numberOfLines={1} style={styles.opponentName}>
                {player.name}
              </Text>
              <Text style={styles.opponentCount}>{player.cardsRemaining} cards</Text>
            </View>
          ))}
        </ScrollView>

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
                <PlayingCard key={getCardId(card)} card={card} compact />
              ))
            )}
          </Animated.View>
        </View>

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
              onPress={() => setSelectedIds([])}
              style={styles.roundButton}
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
                  <CardBack />
                </View>
                <Text style={styles.dealingText}>Shuffling and dealing...</Text>
              </View>
            ) : (
              room.yourHand.map((card) => (
                <PlayingCard
                  key={getCardId(card)}
                  card={card}
                  selected={selectedIds.includes(getCardId(card))}
                  disabled={!playableIds.has(getCardId(card))}
                  onPress={() => toggleCard(card)}
                />
              ))
            )}
          </ScrollView>
          <View style={styles.moveActions}>
            <Pressable
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
        </View>
      ) : null}
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
    </SafeAreaView>
  );
}

function ChatButton({
  unread,
  onPress
}: {
  readonly unread: number;
  readonly onPress: () => void;
}) {
  return (
    <Pressable accessibilityLabel="Open table chat" onPress={onPress} style={styles.roundButton}>
      <MessageCircle color={palette.text} size={19} />
      {unread > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{Math.min(unread, 9)}</Text>
        </View>
      ) : null}
    </Pressable>
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
        <Pressable accessibilityLabel="Close table chat" onPress={onClose} style={styles.scrim} />
        <View style={styles.chatSheet}>
          <View style={styles.chatHeader}>
            <View>
              <Text style={styles.chatTitle}>Table chat</Text>
              <Text style={styles.chatSubtitle}>{messages.length} recent messages</Text>
            </View>
            <Pressable
              accessibilityLabel="Close table chat"
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
    minHeight: 310,
    overflow: "hidden",
    backgroundColor: palette.feltDeep,
    borderTopLeftRadius: radius.table,
    borderTopRightRadius: radius.table,
    borderWidth: 3,
    borderBottomWidth: 0,
    borderColor: "#1c332b"
  },
  opponents: {
    minWidth: "100%",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
    justifyContent: "center"
  },
  opponent: {
    width: 94,
    alignItems: "center",
    padding: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent"
  },
  activeSeat: { backgroundColor: "rgba(241,199,91,0.11)", borderColor: "rgba(241,199,91,0.65)" },
  opponentCards: { height: 42, width: 58, transform: [{ scale: 0.56 }] },
  secondBack: { position: "absolute", left: 15, top: 2 },
  opponentName: {
    width: "100%",
    color: palette.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  opponentCount: { color: palette.muted, fontSize: 10, marginTop: 2 },
  trickArea: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md },
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
    minHeight: 230,
    backgroundColor: palette.surface,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.line
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
    paddingTop: spacing.sm
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
  chatNotice: { color: palette.coral, fontSize: 10, textAlign: "center", marginTop: spacing.sm }
});
