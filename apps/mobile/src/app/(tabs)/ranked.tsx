import { Crown, LockKeyhole, Medal, Trophy } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { ArenaScreen, ScreenHeader } from "@/components/arena-ui";
import { palette, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

export default function RankedScreen() {
  const { rankedQueue, tournamentQueue } = useArena();

  return (
    <ArenaScreen>
      <ScreenHeader
        eyebrow="Competition"
        title="Ranked"
        description="Four-player matchmaking with placement-based rating."
      />

      <QueueSection
        icon={<Trophy color={palette.gold} size={27} />}
        title="Ranked queue"
        detail="4 players · 45 second turns · no bots"
        queued={rankedQueue?.queuedPlayers ?? 0}
        required={rankedQueue?.requiredPlayers ?? 4}
        eta={rankedQueue?.etaSeconds ?? null}
      />

      <QueueSection
        icon={<Crown color={palette.mint} size={27} />}
        title="Arena tournament"
        detail="Two semifinals. One final table."
        queued={tournamentQueue?.queuedPlayers ?? 0}
        required={tournamentQueue?.requiredPlayers ?? 8}
        eta={tournamentQueue?.etaSeconds ?? null}
      />

      <View style={styles.lockedNotice}>
        <LockKeyhole color={palette.muted} size={20} />
        <View style={styles.lockedCopy}>
          <Text style={styles.lockedTitle}>Account sign-in comes next</Text>
          <Text style={styles.lockedText}>
            Native Google sign-in is the next mobile milestone. Ranked progress stays protected
            until accounts are connected.
          </Text>
        </View>
      </View>

      <View style={styles.rewardLine}>
        <Medal color={palette.gold} size={19} />
        <Text style={styles.rewardText}>
          Rank rewards and Arena Coins use the same account economy as the website.
        </Text>
      </View>
    </ArenaScreen>
  );
}

function QueueSection({
  icon,
  title,
  detail,
  queued,
  required,
  eta
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly queued: number;
  readonly required: number;
  readonly eta: number | null;
}) {
  return (
    <View style={styles.queue}>
      <View style={styles.queueTop}>
        {icon}
        <View style={styles.queueCopy}>
          <Text style={styles.queueTitle}>{title}</Text>
          <Text style={styles.queueDetail}>{detail}</Text>
        </View>
      </View>
      <View style={styles.queueStats}>
        <View>
          <Text style={styles.statValue}>
            {queued}/{required}
          </Text>
          <Text style={styles.statLabel}>queued</Text>
        </View>
        <View>
          <Text style={styles.statValue}>{eta === null ? "--" : `~${eta}s`}</Text>
          <Text style={styles.statLabel}>estimated wait</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  queue: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line
  },
  queueTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  queueCopy: { flex: 1 },
  queueTitle: { color: palette.text, fontSize: 21, fontWeight: "900" },
  queueDetail: { color: palette.muted, fontSize: 13, marginTop: 3 },
  queueStats: { flexDirection: "row", justifyContent: "space-between" },
  statValue: { color: palette.text, fontSize: 19, fontWeight: "900" },
  statLabel: { color: palette.muted, fontSize: 11, marginTop: 2 },
  lockedNotice: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    paddingVertical: spacing.md
  },
  lockedCopy: { flex: 1 },
  lockedTitle: { color: palette.text, fontSize: 15, fontWeight: "800" },
  lockedText: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  rewardLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rewardText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 17 }
});
