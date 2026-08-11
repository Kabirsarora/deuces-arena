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
      style={[
        styles.card,
        compact && styles.compact,
        selected && styles.selected,
        disabled && styles.disabled
      ]}
    >
      <Text style={[styles.rank, compact && styles.compactRank, { color }]}>{card.rank}</Text>
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
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

export function CardBack({ compact = false }: { readonly compact?: boolean }) {
  return (
    <ImageBackground
      source={arenaSixCardBack}
      contentFit="cover"
      imageStyle={styles.backImage}
      style={[styles.card, styles.back, compact && styles.compact]}
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
  selected: { transform: [{ translateY: -13 }], borderColor: palette.gold, borderWidth: 2 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
  rank: { fontSize: 20, lineHeight: 22, fontWeight: "900" },
  compactRank: { fontSize: 15, lineHeight: 17 },
  suit: { fontSize: 28, lineHeight: 31, alignSelf: "flex-end" },
  compactSuit: { fontSize: 20, lineHeight: 22 },
  back: {
    backgroundColor: palette.feltDeep,
    borderColor: "#b99745",
    padding: 0,
    overflow: "hidden"
  },
  backImage: { borderRadius: 6 }
});
