import { router } from "expo-router";
import { DoorOpen, RefreshCw, UsersRound } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ActionButton, ArenaScreen, ScreenHeader } from "@/components/arena-ui";
import { palette, radius, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

export default function RoomsScreen() {
  const { connectionStatus, createCasualRoom, joinRoom, lobby, refreshLobby } = useArena();
  const [roomCode, setRoomCode] = useState("");
  const [working, setWorking] = useState(false);

  async function enter(action: () => Promise<boolean>) {
    setWorking(true);
    const joined = await action();
    setWorking(false);
    if (joined) router.push("/table");
  }

  const activity = lobby?.activity;
  return (
    <ArenaScreen>
      <ScreenHeader
        eyebrow="Live tables"
        title="Rooms"
        description="Find a seat or open a table for friends."
      />

      <View style={styles.activityRow}>
        <Activity value={activity?.connectedUsers ?? 0} label="online" />
        <View style={styles.activityDivider} />
        <Activity value={activity?.openRooms ?? 0} label="open" />
        <View style={styles.activityDivider} />
        <Activity value={activity?.activeRooms ?? 0} label="active" />
        <Pressable accessibilityLabel="Refresh rooms" onPress={refreshLobby} style={styles.refresh}>
          <RefreshCw color={palette.muted} size={18} />
        </Pressable>
      </View>

      <View style={styles.joinRow}>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          onChangeText={setRoomCode}
          placeholder="ROOM CODE"
          placeholderTextColor={palette.muted}
          style={styles.input}
          value={roomCode}
        />
        <ActionButton
          label="Join"
          loading={working}
          disabled={roomCode.trim().length < 4 || connectionStatus !== "online"}
          onPress={() => void enter(() => joinRoom(roomCode))}
          style={styles.joinButton}
        />
      </View>

      <View style={styles.roomList}>
        <View style={styles.listHeading}>
          <Text style={styles.listTitle}>Open tables</Text>
          <Text style={styles.listCount}>{lobby?.openRooms.length ?? 0}</Text>
        </View>
        {lobby?.openRooms.length ? (
          lobby.openRooms.map((openRoom) => (
            <Pressable
              key={openRoom.roomCode}
              onPress={() => void enter(() => joinRoom(openRoom.roomCode))}
              style={({ pressed }) => [styles.roomRow, pressed && styles.pressed]}
            >
              <View style={styles.roomIcon}>
                <UsersRound color={palette.mint} size={20} />
              </View>
              <View style={styles.roomCopy}>
                <Text style={styles.roomName}>{openRoom.hostName}'s table</Text>
                <Text style={styles.roomMeta}>
                  {openRoom.seatedPlayers}/{openRoom.maxPlayers} players ·{" "}
                  {openRoom.rules.cardsPerPlayer} cards
                </Text>
              </View>
              <Text style={styles.roomCode}>{openRoom.roomCode}</Text>
            </Pressable>
          ))
        ) : (
          <View style={styles.empty}>
            <DoorOpen color={palette.muted} size={27} />
            <Text style={styles.emptyTitle}>No open rooms</Text>
            <Text style={styles.emptyCopy}>Create one and share its code with friends.</Text>
          </View>
        )}
      </View>

      <ActionButton
        label="Create a casual room"
        variant="secondary"
        loading={working}
        disabled={connectionStatus !== "online"}
        onPress={() => void enter(createCasualRoom)}
      />
    </ArenaScreen>
  );
}

function Activity({ value, label }: { readonly value: number; readonly label: string }) {
  return (
    <View style={styles.activity}>
      <Text style={styles.activityValue}>{value}</Text>
      <Text style={styles.activityLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  activityRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line
  },
  activity: { flex: 1, alignItems: "center" },
  activityValue: { color: palette.text, fontSize: 21, fontWeight: "900" },
  activityLabel: { color: palette.muted, fontSize: 11, marginTop: 1 },
  activityDivider: { width: 1, height: 28, backgroundColor: palette.line },
  refresh: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center"
  },
  joinRow: { flexDirection: "row", gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 52,
    color: palette.text,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontWeight: "800",
    letterSpacing: 0
  },
  joinButton: { width: 102 },
  roomList: { gap: spacing.sm },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs
  },
  listTitle: { color: palette.text, fontSize: 18, fontWeight: "900" },
  listCount: { color: palette.gold, fontSize: 14, fontWeight: "900" },
  roomRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  roomIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised
  },
  roomCopy: { flex: 1 },
  roomName: { color: palette.text, fontSize: 15, fontWeight: "800" },
  roomMeta: { color: palette.muted, fontSize: 12, marginTop: 3 },
  roomCode: { color: palette.gold, fontSize: 12, fontWeight: "900" },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: "800" },
  emptyCopy: { color: palette.muted, fontSize: 13, textAlign: "center" },
  pressed: { opacity: 0.68 }
});
