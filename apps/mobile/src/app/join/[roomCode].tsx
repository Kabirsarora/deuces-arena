import { isValidRoomCode, normalizeRoomCode } from "@deuces-arena/shared";
import { router, useLocalSearchParams } from "expo-router";
import { DoorOpen, Link2, Wifi } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ActionButton, ArenaScreen, ConnectionBadge } from "@/components/arena-ui";
import { palette, radius, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

export default function JoinRoomScreen() {
  const params = useLocalSearchParams<{ roomCode?: string | string[] }>();
  const rawRoomCode = Array.isArray(params.roomCode) ? params.roomCode[0] : params.roomCode;
  const roomCode = normalizeRoomCode(rawRoomCode ?? "");
  const validRoomCode = isValidRoomCode(roomCode);
  const { connectionStatus, joinRoom, leaveRoom, notice, room } = useArena();
  const attemptedKey = useRef<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (room?.roomCode === roomCode) {
      router.replace("/table");
      return;
    }

    if (
      !validRoomCode ||
      room !== null ||
      connectionStatus !== "online" ||
      attemptedKey.current === `${roomCode}-${retryCount}`
    ) {
      return;
    }

    attemptedKey.current = `${roomCode}-${retryCount}`;
    setJoining(true);
    void joinRoom(roomCode).then((joined) => {
      setJoining(false);
      if (joined) router.replace("/table");
    });
  }, [connectionStatus, joinRoom, retryCount, room, roomCode, validRoomCode]);

  async function switchTables() {
    setJoining(true);
    await leaveRoom();
    const joined = await joinRoom(roomCode);
    setJoining(false);
    if (joined) router.replace("/table");
  }

  if (!validRoomCode) {
    return (
      <ArenaScreen scroll={false} style={styles.screen}>
        <InvitePanel
          icon={<Link2 color={palette.coral} size={29} />}
          eyebrow="Invalid invitation"
          title="This room link is incomplete"
          message="Ask the host to send a new Deuces Arena invitation."
        />
        <ActionButton label="Open Rooms" onPress={() => router.replace("/(tabs)/rooms")} />
      </ArenaScreen>
    );
  }

  if (room !== null && room.roomCode !== roomCode) {
    return (
      <ArenaScreen scroll={false} style={styles.screen}>
        <InvitePanel
          icon={<DoorOpen color={palette.gold} size={29} />}
          eyebrow={`Invitation ${roomCode}`}
          title="You already have a table open"
          message={`Switching will leave table ${room.roomCode}.`}
        />
        <ActionButton
          label={`Switch to ${roomCode}`}
          loading={joining}
          onPress={() => void switchTables()}
        />
        <ActionButton
          label="Keep current table"
          variant="secondary"
          onPress={() => router.replace("/table")}
        />
      </ArenaScreen>
    );
  }

  return (
    <ArenaScreen scroll={false} style={styles.screen}>
      <View style={styles.connectionRow}>
        <ConnectionBadge />
      </View>
      <InvitePanel
        icon={<Wifi color={palette.mint} size={29} />}
        eyebrow={`Invitation ${roomCode}`}
        title={connectionStatus === "online" ? "Joining your table" : "Connecting to the arena"}
        message={notice}
      />
      <ActionButton
        label="Try again"
        variant="secondary"
        loading={joining}
        disabled={connectionStatus !== "online"}
        onPress={() => setRetryCount((current) => current + 1)}
      />
      <ActionButton label="Cancel" variant="secondary" onPress={() => router.replace("/(tabs)")} />
    </ArenaScreen>
  );
}

function InvitePanel({
  icon,
  eyebrow,
  title,
  message
}: {
  readonly icon: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
  readonly message: string;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.icon}>{icon}</View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center" },
  connectionRow: { position: "absolute", top: spacing.lg, right: spacing.lg },
  panel: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  icon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceRaised,
    marginBottom: spacing.sm
  },
  eyebrow: {
    color: palette.gold,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: { color: palette.text, fontSize: 25, fontWeight: "900", textAlign: "center" },
  message: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center" }
});
