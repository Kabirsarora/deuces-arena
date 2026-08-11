import type { ProfileAvatarKey } from "@deuces-arena/shared";
import { Coins, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { ActionButton, ArenaScreen, ScreenHeader, SegmentedControl } from "@/components/arena-ui";
import { palette, radius, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

const avatars: readonly { readonly label: string; readonly value: ProfileAvatarKey }[] = [
  { label: "♦", value: "diamond" },
  { label: "♣", value: "club" },
  { label: "♥", value: "heart" },
  { label: "♠", value: "spade" }
];

export default function ProfileScreen() {
  const { playerName, profile, updateProfile } = useArena();
  const [name, setName] = useState(playerName);
  const [avatar, setAvatar] = useState<ProfileAvatarKey>(profile?.avatarKey ?? "diamond");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(playerName), [playerName]);
  useEffect(() => setAvatar(profile?.avatarKey ?? "diamond"), [profile?.avatarKey]);

  async function save() {
    setSaving(true);
    await updateProfile(name, avatar);
    setSaving(false);
  }

  return (
    <ArenaScreen>
      <ScreenHeader
        eyebrow="Player card"
        title={profile?.displayName ?? playerName}
        description="Your guest profile persists on this device."
      />

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {avatars.find((item) => item.value === avatar)?.label}
          </Text>
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.rating}>{profile?.rating ?? 1000} rating</Text>
          <View style={styles.coinLine}>
            <Coins color={palette.gold} size={16} />
            <Text style={styles.coins}>
              {profile?.isAdmin ? "Unlimited" : (profile?.arenaCoins ?? 0)} Arena Coins
            </Text>
          </View>
        </View>
        {profile?.isAdmin ? <ShieldCheck color={palette.mint} size={23} /> : null}
      </View>

      <View style={styles.stats}>
        <Stat value={profile?.gamesPlayed ?? 0} label="games" />
        <Stat value={profile?.wins ?? 0} label="wins" />
        <Stat value={profile?.averagePlacement?.toFixed(1) ?? "--"} label="avg. place" />
      </View>

      <View style={styles.editor}>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={24}
          autoCorrect={false}
          style={styles.input}
          placeholderTextColor={palette.muted}
        />
        <Text style={styles.label}>Table avatar</Text>
        <SegmentedControl value={avatar} options={avatars} onChange={setAvatar} />
        <ActionButton
          label="Save profile"
          loading={saving}
          disabled={name.trim().length < 2}
          onPress={() => void save()}
        />
      </View>
    </ArenaScreen>
  );
}

function Stat({ value, label }: { readonly value: number | string; readonly label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.felt,
    borderWidth: 1,
    borderColor: palette.mint
  },
  avatarText: { color: palette.text, fontSize: 28, fontWeight: "900" },
  identityCopy: { flex: 1 },
  rating: { color: palette.text, fontSize: 17, fontWeight: "900" },
  coinLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  coins: { color: palette.gold, fontSize: 13, fontWeight: "700" },
  stats: {
    flexDirection: "row",
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: palette.text, fontSize: 22, fontWeight: "900" },
  statLabel: { color: palette.muted, fontSize: 11, marginTop: 2 },
  editor: { gap: spacing.md },
  label: { color: palette.text, fontSize: 13, fontWeight: "800" },
  input: {
    minHeight: 52,
    color: palette.text,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    fontWeight: "700"
  }
});
