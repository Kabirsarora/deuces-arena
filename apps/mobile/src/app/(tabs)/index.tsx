import type { DeckType } from "@deuces-arena/game-engine";
import type { PublicBotDifficulty, PublicBotPace } from "@deuces-arena/shared";
import { router } from "expo-router";
import { ImageBackground } from "expo-image";
import { Bot, ChevronRight, Sparkles } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import jungleClubTable from "@/assets/images/jungle-club-table.jpg";
import {
  ActionButton,
  ArenaScreen,
  ScreenHeader,
  SegmentedControl,
  Stepper
} from "@/components/arena-ui";
import { palette, radius, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

export default function PlayScreen() {
  const { connectionStatus, createBotGame, notice, room } = useArena();
  const [playerCount, setPlayerCount] = useState(4);
  const [cardsPerPlayer, setCardsPerPlayer] = useState(13);
  const [deckType, setDeckType] = useState<DeckType>("classic");
  const [difficulty, setDifficulty] = useState<PublicBotDifficulty>("normal");
  const [pace, setPace] = useState<PublicBotPace>("relaxed");
  const [starting, setStarting] = useState(false);
  const maximumCards = useMemo(
    () => Math.floor((deckType === "arena-six" ? 78 : 52) / playerCount),
    [deckType, playerCount]
  );
  const safeCards = Math.min(cardsPerPlayer, maximumCards);

  async function startGame() {
    setStarting(true);
    const started = await createBotGame({
      playerCount,
      botCount: playerCount - 1,
      cardsPerPlayer: safeCards,
      deckType,
      difficulty,
      pace
    });
    setStarting(false);
    if (started) router.push("/table");
  }

  return (
    <ArenaScreen>
      <ScreenHeader eyebrow="Deuces Arena" title="Play" description={notice} />

      {room === null ? null : (
        <ActionButton
          label={
            room.status === "complete" ? "View match results" : `Resume table ${room.roomCode}`
          }
          onPress={() => router.push("/table")}
        />
      )}

      <ImageBackground
        source={jungleClubTable}
        contentFit="cover"
        imageStyle={styles.image}
        style={styles.feature}
      >
        <View style={styles.featureShade} />
        <View style={styles.featureCopy}>
          <View style={styles.iconDisc}>
            <Bot color={palette.gold} size={28} />
          </View>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Quick match</Text>
            <Text style={styles.featureDetail}>
              {playerCount - 1} bots · {safeCards} cards each
            </Text>
          </View>
          <ChevronRight color={palette.text} size={22} />
        </View>
      </ImageBackground>

      <View style={styles.settings}>
        <Stepper
          label="Players"
          value={playerCount}
          minimum={2}
          maximum={6}
          onChange={(value) => {
            setPlayerCount(value);
            const max = Math.floor((deckType === "arena-six" ? 78 : 52) / value);
            setCardsPerPlayer((current) => Math.min(current, max));
          }}
        />
        <Stepper
          label="Cards each"
          value={safeCards}
          minimum={5}
          maximum={maximumCards}
          onChange={setCardsPerPlayer}
        />

        <View style={styles.controlGroup}>
          <View style={styles.controlHeading}>
            <Text style={styles.controlTitle}>Deck</Text>
            <Sparkles color={deckType === "arena-six" ? palette.gold : palette.muted} size={16} />
          </View>
          <SegmentedControl
            value={deckType}
            options={[
              { label: "Classic", value: "classic" },
              { label: "Arena 6", value: "arena-six" }
            ]}
            onChange={(value) => {
              setDeckType(value);
              const max = Math.floor((value === "arena-six" ? 78 : 52) / playerCount);
              setCardsPerPlayer((current) => Math.min(current, max));
            }}
          />
          <Text style={styles.hint}>
            {deckType === "arena-six"
              ? "Stars and crowns add two higher suits."
              : "The traditional four-suit deck."}
          </Text>
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlTitle}>Bot difficulty</Text>
          <SegmentedControl
            value={difficulty}
            options={[
              { label: "Easy", value: "easy" },
              { label: "Normal", value: "normal" },
              { label: "Hard", value: "hard" }
            ]}
            onChange={setDifficulty}
          />
        </View>

        <View style={styles.controlGroup}>
          <Text style={styles.controlTitle}>Table pace</Text>
          <SegmentedControl
            value={pace}
            options={[
              { label: "Quick", value: "quick" },
              { label: "Normal", value: "normal" },
              { label: "Relaxed", value: "relaxed" }
            ]}
            onChange={setPace}
          />
        </View>
      </View>

      <ActionButton
        label="Deal cards"
        loading={starting}
        disabled={connectionStatus !== "online" || room !== null}
        onPress={() => void startGame()}
      />
    </ArenaScreen>
  );
}

const styles = StyleSheet.create({
  feature: { height: 148, borderRadius: radius.md, overflow: "hidden", justifyContent: "flex-end" },
  image: { borderRadius: radius.md },
  featureShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(3, 10, 8, 0.52)" },
  featureCopy: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  iconDisc: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7,16,13,0.76)",
    borderWidth: 1,
    borderColor: "rgba(241,199,91,0.5)"
  },
  featureText: { flex: 1 },
  featureTitle: { color: palette.text, fontSize: 22, fontWeight: "900" },
  featureDetail: { color: "#d5dbd7", fontSize: 13, marginTop: 3 },
  settings: { borderTopWidth: 1, borderTopColor: palette.line },
  controlGroup: { gap: spacing.sm, paddingVertical: spacing.md },
  controlHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlTitle: { color: palette.text, fontSize: 14, fontWeight: "800" },
  hint: { color: palette.muted, fontSize: 12, lineHeight: 17 }
});
