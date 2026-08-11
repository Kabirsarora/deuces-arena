import type { Card, Suit } from "@deuces-arena/game-engine";
import { ImageBackground } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import arenaSixCardBack from "@/assets/images/arena-six-card-back.jpg";
import { palette } from "@/constants/theme";

const suitSymbols: Record<Suit, string> = {
  diamonds: "♦",
  clubs: "♣",
  hearts: "♥",
  spades: "♠",
  stars: "★",
  crowns: "♛"
};

export function PlayingCard({
  card,
  selected = false,
  compact = false,
  disabled = false,
  onPress
}: {
  readonly card: Card;
  readonly selected?: boolean;
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
}) {
  const red = card.suit === "diamonds" || card.suit === "hearts";
  const arena = card.suit === "stars" || card.suit === "crowns";
  const color = red ? "#d92929" : arena ? palette.felt : "#111111";
  const body = (
    <View
      accessible={onPress === undefined}
      accessibilityLabel={`${card.rank} of ${card.suit}`}
      style={[
        styles.card,
        compact && styles.compact,
        selected && styles.selected,
        disabled && styles.disabled
      ]}
    >
      <View pointerEvents="none" style={styles.faceInset} />
      <View style={styles.cornerMark}>
        <Text style={[styles.rank, compact && styles.compactRank, { color }]}>{card.rank}</Text>
        <Text style={[styles.cornerSuit, compact && styles.compactCornerSuit, { color }]}>
          {suitSymbols[card.suit]}
        </Text>
      </View>
      <Text style={[styles.suit, compact && styles.compactSuit, { color }]}>
        {suitSymbols[card.suit]}
      </Text>
    </View>
  );

  return onPress === undefined ? (
    body
  ) : (
    <Pressable
      accessibilityLabel={`${card.rank} of ${card.suit}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

export function CardBack({
  compact = false,
  mini = false,
  imageUrl = null,
  accessible = true
}: {
  readonly compact?: boolean;
  readonly mini?: boolean;
  readonly imageUrl?: string | null;
  readonly accessible?: boolean;
}) {
  return (
    <ImageBackground
      {...(accessible ? { accessibilityLabel: "Face-down card" } : {})}
      accessible={accessible}
      source={imageUrl === null ? arenaSixCardBack : { uri: imageUrl }}
      contentFit="cover"
      imageStyle={styles.backImage}
      transition={imageUrl === null ? 0 : 120}
      style={[styles.card, styles.back, compact && styles.compact, mini && styles.mini]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    width: 62,
    height: 92,
    borderRadius: 7,
    backgroundColor: "#fbfaf5",
    borderWidth: 1,
    borderColor: "#d6d4cd",
    padding: 7,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5
  },
  compact: { width: 46, height: 68, padding: 5 },
  mini: { width: 28, height: 42, borderRadius: 4, padding: 0 },
  selected: { transform: [{ translateY: -13 }], borderColor: palette.gold, borderWidth: 2 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
  rank: { fontSize: 20, lineHeight: 22, fontWeight: "900" },
  compactRank: { fontSize: 15, lineHeight: 17 },
  cornerMark: { zIndex: 2, alignSelf: "flex-start", alignItems: "center" },
  cornerSuit: { fontSize: 12, lineHeight: 13, fontWeight: "900" },
  compactCornerSuit: { fontSize: 9, lineHeight: 10 },
  suit: { zIndex: 2, fontSize: 34, lineHeight: 36, alignSelf: "center", marginBottom: 3 },
  compactSuit: { fontSize: 25, lineHeight: 27 },
  faceInset: {
    position: "absolute",
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(19, 62, 50, 0.12)"
  },
  back: {
    backgroundColor: palette.feltDeep,
    borderColor: "#b99745",
    padding: 0,
    overflow: "hidden"
  },
  backImage: { borderRadius: 5 }
});
