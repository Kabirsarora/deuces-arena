import { Crown, LockKeyhole, Medal, Trophy } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionButton, ArenaScreen, ScreenHeader } from "@/components/arena-ui";
import { palette, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

type WorkingAction = "ranked" | "tournament" | "account" | null;

export default function RankedScreen() {
  const {
    account,
    joinRanked,
    joinTournament,
    leaveRanked,
    leaveTournament,
    notice,
    rankedQueue,
    signInWithGoogle,
    tournamentQueue
  } = useArena();
  const [working, setWorking] = useState<WorkingAction>(null);

  async function run(target: Exclude<WorkingAction, null>, action: () => Promise<unknown>) {
    setWorking(target);
    await action();
    setWorking(null);
  }

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
        detail="4 players · 20 second turns · no bots"
        queued={rankedQueue?.queuedPlayers ?? 0}
        required={rankedQueue?.requiredPlayers ?? 4}
        eta={rankedQueue?.etaSeconds ?? null}
        joined={rankedQueue?.joined ?? false}
        working={working === "ranked"}
        disabled={account === null}
        onAction={() => void run("ranked", rankedQueue?.joined === true ? leaveRanked : joinRanked)}
      />

      <QueueSection
        icon={<Crown color={palette.mint} size={27} />}
        title="Arena tournament"
        detail="Two semifinals. One final table."
        queued={tournamentQueue?.queuedPlayers ?? 0}
        required={tournamentQueue?.requiredPlayers ?? 8}
        eta={tournamentQueue?.etaSeconds ?? null}
        joined={tournamentQueue?.joined ?? false}
        working={working === "tournament"}
        disabled={account === null}
        onAction={() =>
          void run(
            "tournament",
            tournamentQueue?.joined === true ? leaveTournament : joinTournament
          )
        }
      />

      {account === null ? (
        <View style={styles.accountPrompt}>
          <View style={styles.lockedNotice}>
            <LockKeyhole color={palette.muted} size={20} />
            <View style={styles.lockedCopy}>
              <Text style={styles.lockedTitle}>Connect your Arena account</Text>
              <Text style={styles.lockedText}>
                Google sign-in protects rating, tournament progress, rewards, and cosmetics.
              </Text>
            </View>
          </View>
          <ActionButton
            label="Sign in with Google"
            loading={working === "account"}
            onPress={() => void run("account", signInWithGoogle)}
          />
        </View>
      ) : null}

      <Text style={styles.notice}>{notice}</Text>

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
  eta,
  joined,
  working,
  disabled,
  onAction
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly queued: number;
  readonly required: number;
  readonly eta: number | null;
  readonly joined: boolean;
  readonly working: boolean;
  readonly disabled: boolean;
  readonly onAction: () => void;
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
      <ActionButton
        label={joined ? "Leave queue" : "Join queue"}
        loading={working}
        disabled={disabled}
        variant={joined ? "secondary" : "primary"}
        onPress={onAction}
      />
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
  accountPrompt: { gap: spacing.md },
  lockedNotice: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start"
  },
  lockedCopy: { flex: 1 },
  lockedTitle: { color: palette.text, fontSize: 15, fontWeight: "800" },
  lockedText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  notice: { color: palette.mint, fontSize: 11, textAlign: "center" },
  rewardLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md
  },
  rewardText: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 17 }
});
