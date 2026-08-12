import * as Linking from "expo-linking";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { palette, radius, spacing } from "@/constants/theme";

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://deucesarena.com";

type ErrorBoundaryState = {
  readonly failed: boolean;
};

export class MobileErrorBoundary extends Component<
  { readonly children: ReactNode },
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) console.error("Deuces Arena render failure", error, info.componentStack);
  }

  public render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>Deuces Arena</Text>
          <Text accessibilityRole="header" style={styles.title}>
            The table needs a fresh deal
          </Text>
          <Text style={styles.description}>
            Something unexpected interrupted this screen. Your online match remains on the server,
            so retrying can reconnect you safely.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState({ failed: false })}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>Try again</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(WEB_URL)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryLabel}>Open web app</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.ink },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg
  },
  eyebrow: {
    color: palette.mint,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0
  },
  title: { color: palette.text, fontSize: 30, lineHeight: 36, fontWeight: "900" },
  description: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: palette.gold
  },
  primaryLabel: { color: palette.ink, fontSize: 16, fontWeight: "900" },
  secondaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceRaised
  },
  secondaryLabel: { color: palette.text, fontSize: 16, fontWeight: "900" },
  pressed: { opacity: 0.72 }
});
