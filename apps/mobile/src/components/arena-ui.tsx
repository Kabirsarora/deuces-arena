import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Minus, Plus, Wifi, WifiOff } from "lucide-react-native";

import { palette, radius, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

export function ArenaScreen({
  children,
  scroll = true,
  style
}: {
  readonly children: ReactNode;
  readonly scroll?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[styles.content, style]}>{children}</View>;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  description
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {description === undefined ? null : <Text style={styles.description}>{description}</Text>}
      </View>
      <ConnectionBadge />
    </View>
  );
}

export function ConnectionBadge() {
  const { connectionStatus } = useArena();
  const online = connectionStatus === "online";

  return (
    <View style={[styles.badge, online ? styles.onlineBadge : styles.offlineBadge]}>
      {online ? (
        <Wifi color={palette.mint} size={14} />
      ) : (
        <WifiOff color={palette.coral} size={14} />
      )}
      <Text style={[styles.badgeText, { color: online ? palette.mint : palette.coral }]}>
        {online ? "Live" : connectionStatus === "waking" ? "Waking" : "Offline"}
      </Text>
    </View>
  );
}

export function ActionButton({
  label,
  loading = false,
  variant = "primary",
  ...props
}: PressableProps & {
  readonly label: string;
  readonly loading?: boolean;
  readonly variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      {...props}
      disabled={props.disabled === true || loading}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "primary" && styles.primaryButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "danger" && styles.dangerButton,
        (props.disabled === true || loading) && styles.disabled,
        pressed && styles.pressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? palette.ink : palette.text} />
      ) : (
        <Text style={[styles.actionLabel, variant === "primary" && styles.primaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: {
  readonly value: T;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.selectedSegment,
              pressed && styles.pressed
            ]}
          >
            <Text style={[styles.segmentLabel, selected && styles.selectedSegmentLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  label,
  value,
  minimum,
  maximum,
  onChange
}: {
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <View>
        <Text style={styles.controlLabel}>{label}</Text>
        <Text style={styles.stepperValue}>{value}</Text>
      </View>
      <View style={styles.stepperActions}>
        <IconButton
          accessibilityLabel={`Decrease ${label}`}
          disabled={value <= minimum}
          onPress={() => onChange(Math.max(minimum, value - 1))}
        >
          <Minus color={palette.text} size={18} />
        </IconButton>
        <IconButton
          accessibilityLabel={`Increase ${label}`}
          disabled={value >= maximum}
          onPress={() => onChange(Math.min(maximum, value + 1))}
        >
          <Plus color={palette.text} size={18} />
        </IconButton>
      </View>
    </View>
  );
}

function IconButton({ children, ...props }: PressableProps & { readonly children: ReactNode }) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.iconButton,
        props.disabled === true && styles.disabled,
        pressed && styles.pressed
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.ink },
  scrollContent: { flexGrow: 1, paddingBottom: 88 },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.xl
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: palette.mint,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0
  },
  title: {
    color: palette.text,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 3
  },
  description: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 32
  },
  onlineBadge: { backgroundColor: "#102a22", borderColor: "#275443" },
  offlineBadge: { backgroundColor: "#2b1715", borderColor: "#5a2d27" },
  badgeText: { fontSize: 12, fontWeight: "800" },
  actionButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1
  },
  primaryButton: { backgroundColor: palette.gold, borderColor: palette.gold },
  secondaryButton: { backgroundColor: palette.surfaceRaised, borderColor: palette.line },
  dangerButton: { backgroundColor: "#321c1a", borderColor: "#60332d" },
  actionLabel: { color: palette.text, fontWeight: "900", fontSize: 16 },
  primaryLabel: { color: palette.ink },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
  segmented: {
    flexDirection: "row",
    backgroundColor: palette.black,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    padding: 4,
    minHeight: 48
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm
  },
  selectedSegment: { backgroundColor: palette.felt },
  segmentLabel: { color: palette.muted, fontSize: 13, fontWeight: "800" },
  selectedSegmentLabel: { color: palette.text },
  stepper: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  controlLabel: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  stepperValue: { color: palette.text, fontSize: 22, fontWeight: "900", marginTop: 2 },
  stepperActions: { flexDirection: "row", gap: spacing.sm },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line
  }
});
