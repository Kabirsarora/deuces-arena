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

type CardFaceTheme = {
  readonly paper: string;
  readonly border: string;
  readonly inset: string;
  readonly motifBackground: string;
  readonly motif: string;
  readonly motifColor: string;
  readonly suitMotifs?: Partial<Record<Suit, string>>;
  readonly royalMotifs?: Partial<Record<Card["rank"], string>>;
};

const defaultFaceTheme: CardFaceTheme = {
  paper: "#fbfaf5",
  border: "#d6d4cd",
  inset: "rgba(19, 62, 50, 0.12)",
  motifBackground: "rgba(255, 255, 255, 0.42)",
  motif: "DA",
  motifColor: "rgba(19, 62, 50, 0.2)"
};

const cardFaceThemes: Readonly<Record<string, CardFaceTheme>> = {
  "classic-red-card-back": {
    paper: "#fff9ef",
    border: "#c98b82",
    inset: "rgba(153, 27, 27, 0.28)",
    motifBackground: "rgba(254, 226, 226, 0.56)",
    motif: "♦",
    motifColor: "rgba(153, 27, 27, 0.35)"
  },
  "neon-grid-card-back": {
    paper: "#effcff",
    border: "#67c8d9",
    inset: "rgba(8, 145, 178, 0.34)",
    motifBackground: "rgba(207, 250, 254, 0.7)",
    motif: "#",
    motifColor: "rgba(8, 145, 178, 0.45)"
  },
  "ember-court-card-back": {
    paper: "#fff6df",
    border: "#d79a55",
    inset: "rgba(180, 83, 9, 0.4)",
    motifBackground: "rgba(254, 215, 170, 0.58)",
    motif: "✦",
    motifColor: "rgba(154, 52, 18, 0.42)"
  },
  "pool-shark-card-back": {
    paper: "#effcf5",
    border: "#5db9a8",
    inset: "rgba(13, 148, 136, 0.36)",
    motifBackground: "rgba(167, 243, 208, 0.55)",
    motif: "8",
    motifColor: "rgba(6, 95, 70, 0.48)"
  },
  "koi-current-card-back": {
    paper: "#f1f7ff",
    border: "#7a9cca",
    inset: "rgba(30, 64, 175, 0.32)",
    motifBackground: "rgba(219, 234, 254, 0.72)",
    motif: "≈",
    motifColor: "rgba(30, 64, 175, 0.42)"
  },
  "orchard-salon-card-back": {
    paper: "#fffaf0",
    border: "#a67c3f",
    inset: "rgba(120, 53, 15, 0.38)",
    motifBackground: "rgba(255, 251, 235, 0.7)",
    motif: "✿",
    motifColor: "rgba(120, 53, 15, 0.42)",
    suitMotifs: {
      diamonds: "🍐",
      clubs: "🍇",
      hearts: "🍎",
      spades: "🫐",
      stars: "🍊",
      crowns: "🍒"
    },
    royalMotifs: {
      J: "⚜",
      Q: "♕",
      K: "♔"
    }
  },
  "bengal-bloom-card-back": {
    paper: "#fff9df",
    border: "#c5944a",
    inset: "rgba(146, 64, 14, 0.4)",
    motifBackground: "rgba(254, 240, 138, 0.4)",
    motif: "///",
    motifColor: "rgba(120, 53, 15, 0.48)"
  },
  "arena-six-crest-card-back": {
    paper: "#effbf5",
    border: "#4ba997",
    inset: "rgba(13, 148, 136, 0.4)",
    motifBackground: "rgba(204, 251, 241, 0.6)",
    motif: "VI",
    motifColor: "rgba(6, 95, 70, 0.46)"
  },
  "celestial-vault-card-back": {
    paper: "#f4f8fc",
    border: "#8292a6",
    inset: "rgba(71, 85, 105, 0.38)",
    motifBackground: "rgba(226, 232, 240, 0.65)",
    motif: "✧",
    motifColor: "rgba(51, 65, 85, 0.45)"
  },
  "ember-sovereign-card-back": {
    paper: "#fff5dc",
    border: "#b36f4b",
    inset: "rgba(127, 29, 29, 0.48)",
    motifBackground: "rgba(254, 215, 170, 0.56)",
    motif: "♛",
    motifColor: "rgba(127, 29, 29, 0.46)"
  },
  "voidglass-prism-card-back": {
    paper: "#f6f3ff",
    border: "#8878c7",
    inset: "rgba(79, 70, 229, 0.4)",
    motifBackground: "rgba(221, 214, 254, 0.64)",
    motif: "◇",
    motifColor: "rgba(79, 70, 229, 0.48)"
  }
};

export function PlayingCard({
  card,
  themeSlug = null,
  selected = false,
  compact = false,
  disabled = false,
  accessible = true,
  onPress
}: {
  readonly card: Card;
  readonly themeSlug?: string | null;
  readonly selected?: boolean;
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly accessible?: boolean;
  readonly onPress?: () => void;
}) {
  const theme =
    themeSlug === null ? defaultFaceTheme : (cardFaceThemes[themeSlug] ?? defaultFaceTheme);
  const red = card.suit === "diamonds" || card.suit === "hearts";
  const arena = card.suit === "stars" || card.suit === "crowns";
  const color = red ? "#d92929" : arena ? palette.felt : "#111111";
  const themedMotif =
    theme.royalMotifs?.[card.rank] ?? theme.suitMotifs?.[card.suit] ?? theme.motif;
  const body = (
    <View
      accessible={accessible && onPress === undefined}
      {...(accessible ? { accessibilityLabel: `${card.rank} of ${card.suit}` } : {})}
      style={[
        styles.card,
        { backgroundColor: theme.paper, borderColor: theme.border },
        compact && styles.compact,
        selected && styles.selected,
        disabled && styles.disabled
      ]}
    >
      <View pointerEvents="none" style={[styles.faceInset, { borderColor: theme.inset }]} />
      <View
        pointerEvents="none"
        style={[
          styles.faceMotif,
          compact && styles.compactFaceMotif,
          { backgroundColor: theme.motifBackground, borderColor: theme.inset }
        ]}
      >
        <Text style={[styles.faceMotifText, { color: theme.motifColor }]}>{themedMotif}</Text>
      </View>
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
      {...(accessible ? { accessibilityLabel: `${card.rank} of ${card.suit}` } : {})}
      accessible={accessible}
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
  faceMotif: {
    position: "absolute",
    alignSelf: "center",
    top: 25,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  compactFaceMotif: { top: 18, width: 28, height: 28, borderRadius: 14 },
  faceMotifText: { fontSize: 12, lineHeight: 14, fontWeight: "900" },
  back: {
    backgroundColor: palette.feltDeep,
    borderColor: "#b99745",
    padding: 0,
    overflow: "hidden"
  },
  backImage: { borderRadius: 5 }
});
