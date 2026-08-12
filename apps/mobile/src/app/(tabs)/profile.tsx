import type {
  CosmeticKind,
  FeedbackKind,
  ProfileAvatarKey,
  PublicCosmetic
} from "@deuces-arena/shared";
import { Image } from "expo-image";
import {
  Bell,
  BellOff,
  Bug,
  Coins,
  Lightbulb,
  Palette,
  ShieldCheck,
  ShoppingBag,
  Trophy
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ActionButton, ArenaScreen, ScreenHeader, SegmentedControl } from "@/components/arena-ui";
import { PlayingCard } from "@/components/playing-card";
import { palette, radius, spacing } from "@/constants/theme";
import { useArena } from "@/providers/arena-provider";

const WEB_URL = "https://deucesarena.com";

const avatars: readonly { readonly label: string; readonly value: ProfileAvatarKey }[] = [
  { label: "D", value: "diamond" },
  { label: "C", value: "club" },
  { label: "H", value: "heart" },
  { label: "S", value: "spade" }
];

type ProfileView = "profile" | "locker" | "matches" | "feedback";
type LockerCategory = "cards" | "tables" | "profile";

const views: readonly { readonly label: string; readonly value: ProfileView }[] = [
  { label: "Me", value: "profile" },
  { label: "Locker", value: "locker" },
  { label: "Matches", value: "matches" },
  { label: "Feedback", value: "feedback" }
];

const lockerCategories: readonly { readonly label: string; readonly value: LockerCategory }[] = [
  { label: "Cards", value: "cards" },
  { label: "Tables", value: "tables" },
  { label: "Profile", value: "profile" }
];

const feedbackKinds: readonly { readonly label: string; readonly value: FeedbackKind }[] = [
  { label: "Bug", value: "BUG" },
  { label: "Idea", value: "IDEA" },
  { label: "Balance", value: "BALANCE" },
  { label: "UI", value: "UI" }
];

export default function ProfileScreen() {
  const {
    account,
    accountWorking,
    cosmetics,
    equipCosmetic,
    matchHistory,
    notice,
    notificationsEnabled,
    notificationWorking,
    playerName,
    profile,
    purchaseCosmetic,
    refreshProfileData,
    submitFeedback,
    signInWithGoogle,
    signOutAccount,
    enableNotifications,
    disableNotifications,
    updateProfile
  } = useArena();
  const [view, setView] = useState<ProfileView>("profile");
  const [name, setName] = useState(playerName);
  const [avatar, setAvatar] = useState<ProfileAvatarKey>(profile?.avatarKey ?? "diamond");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(playerName), [playerName]);
  useEffect(() => setAvatar(profile?.avatarKey ?? "diamond"), [profile?.avatarKey]);
  useEffect(() => refreshProfileData(), [refreshProfileData]);

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
        {...(profile?.isAdmin ? { description: "Creator access" } : {})}
      />

      <View style={styles.identity}>
        <View style={styles.avatar}>
          {profile?.imageUrl !== null && profile?.imageUrl !== undefined ? (
            <Image
              source={{ uri: profile.imageUrl }}
              contentFit="cover"
              style={styles.accountImage}
            />
          ) : (
            <Text style={styles.avatarText}>
              {avatars.find((item) => item.value === avatar)?.label}
            </Text>
          )}
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

      <ActionButton
        label={account === null ? "Sign in with Google" : "Sign out of Google"}
        loading={accountWorking}
        variant={account === null ? "primary" : "secondary"}
        onPress={() => void (account === null ? signInWithGoogle() : signOutAccount())}
      />

      <SegmentedControl value={view} options={views} onChange={setView} />

      {view === "profile" ? (
        <>
          <ProfileEditor
            avatar={avatar}
            name={name}
            saving={saving}
            games={profile?.gamesPlayed ?? 0}
            wins={profile?.wins ?? 0}
            averagePlacement={profile?.averagePlacement?.toFixed(1) ?? "--"}
            onAvatarChange={setAvatar}
            onNameChange={setName}
            onSave={() => void save()}
          />
          <NotificationPreferences
            signedIn={account !== null}
            enabled={notificationsEnabled}
            working={notificationWorking}
            onChange={() =>
              void (notificationsEnabled ? disableNotifications() : enableNotifications())
            }
          />
        </>
      ) : null}

      {view === "locker" ? (
        <Locker
          cosmetics={cosmetics}
          ownedIds={new Set(profile?.unlocks.map((unlock) => unlock.cosmetic.id) ?? [])}
          equippedIds={
            new Set(profile?.equippedCosmetics.map((equipped) => equipped.cosmetic.id) ?? [])
          }
          coins={profile?.arenaCoins ?? 0}
          isAdmin={profile?.isAdmin ?? false}
          onEquip={equipCosmetic}
          onPurchase={purchaseCosmetic}
        />
      ) : null}

      {view === "matches" ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Trophy color={palette.gold} size={19} />
            <Text style={styles.sectionTitle}>Recent matches</Text>
          </View>
          {matchHistory.length === 0 ? (
            <EmptyState text="Completed games will appear here." />
          ) : (
            matchHistory.map((match) => (
              <View key={match.matchId} style={styles.matchRow}>
                <View style={styles.placeBadge}>
                  <Text style={styles.placeText}>{match.placement ?? "-"}</Text>
                </View>
                <View style={styles.matchCopy}>
                  <Text style={styles.matchMode}>{formatMode(match.mode)}</Text>
                  <Text style={styles.matchMeta}>
                    {match.completedAt === null
                      ? "Completed"
                      : new Date(match.completedAt).toLocaleDateString()}
                    {match.bombsPlayed > 0 ? ` · ${match.bombsPlayed} bombs` : ""}
                  </Text>
                </View>
                <Text
                  style={[styles.ratingDelta, (match.ratingDelta ?? 0) < 0 && styles.negativeDelta]}
                >
                  {match.ratingDelta === null
                    ? `${match.cardsRemaining ?? 0} left`
                    : `${match.ratingDelta >= 0 ? "+" : ""}${match.ratingDelta}`}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {view === "feedback" ? <FeedbackPanel notice={notice} onSubmit={submitFeedback} /> : null}
    </ArenaScreen>
  );
}

function NotificationPreferences({
  signedIn,
  enabled,
  working,
  onChange
}: {
  readonly signedIn: boolean;
  readonly enabled: boolean;
  readonly working: boolean;
  readonly onChange: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.alertHeading}>
        <View style={styles.alertIcon}>
          {enabled ? (
            <Bell color={palette.mint} size={20} />
          ) : (
            <BellOff color={palette.muted} size={20} />
          )}
        </View>
        <View style={styles.alertCopy}>
          <Text style={styles.sectionTitle}>Table alerts</Text>
          <Text style={styles.alertStatus}>
            {signedIn ? (enabled ? "On" : "Off") : "Sign in required"}
          </Text>
        </View>
      </View>
      <ActionButton
        label={enabled ? "Disable alerts" : "Enable alerts"}
        loading={working}
        disabled={!signedIn}
        variant={enabled ? "secondary" : "primary"}
        onPress={onChange}
      />
    </View>
  );
}

function ProfileEditor({
  avatar,
  name,
  saving,
  games,
  wins,
  averagePlacement,
  onAvatarChange,
  onNameChange,
  onSave
}: {
  readonly avatar: ProfileAvatarKey;
  readonly name: string;
  readonly saving: boolean;
  readonly games: number;
  readonly wins: number;
  readonly averagePlacement: string;
  readonly onAvatarChange: (avatar: ProfileAvatarKey) => void;
  readonly onNameChange: (name: string) => void;
  readonly onSave: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.stats}>
        <Stat value={games} label="games" />
        <Stat value={wins} label="wins" />
        <Stat value={averagePlacement} label="avg. place" />
      </View>
      <Text style={styles.label}>Display name</Text>
      <TextInput
        value={name}
        onChangeText={onNameChange}
        maxLength={18}
        autoCorrect={false}
        style={styles.input}
        placeholderTextColor={palette.muted}
      />
      <Text style={styles.label}>Table avatar</Text>
      <SegmentedControl value={avatar} options={avatars} onChange={onAvatarChange} />
      <ActionButton
        label="Save profile"
        loading={saving}
        disabled={name.trim().length < 2}
        onPress={onSave}
      />
    </View>
  );
}

function Locker({
  cosmetics,
  ownedIds,
  equippedIds,
  coins,
  isAdmin,
  onEquip,
  onPurchase
}: {
  readonly cosmetics: readonly PublicCosmetic[];
  readonly ownedIds: ReadonlySet<string>;
  readonly equippedIds: ReadonlySet<string>;
  readonly coins: number;
  readonly isAdmin: boolean;
  readonly onEquip: (id: string) => Promise<boolean>;
  readonly onPurchase: (id: string) => Promise<boolean>;
}) {
  const [category, setCategory] = useState<LockerCategory>("cards");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const visibleCosmetics = useMemo(
    () => cosmetics.filter((cosmetic) => categoryIncludes(category, cosmetic.kind)),
    [category, cosmetics]
  );

  async function act(cosmetic: PublicCosmetic) {
    setWorkingId(cosmetic.id);
    if (ownedIds.has(cosmetic.id) || isAdmin) await onEquip(cosmetic.id);
    else await onPurchase(cosmetic.id);
    setWorkingId(null);
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <ShoppingBag color={palette.gold} size={19} />
        <Text style={styles.sectionTitle}>Shop & locker</Text>
      </View>
      <SegmentedControl value={category} options={lockerCategories} onChange={setCategory} />
      {visibleCosmetics.map((cosmetic) => {
        const owned = ownedIds.has(cosmetic.id) || isAdmin;
        const equipped = equippedIds.has(cosmetic.id);
        const purchasable = cosmetic.coinPrice !== null && !cosmetic.isSupporter;
        const disabled = equipped || (!owned && !purchasable);

        return (
          <View key={cosmetic.id} style={styles.cosmeticRow}>
            <CosmeticPreview cosmetic={cosmetic} />
            <View style={styles.cosmeticCopy}>
              <View style={styles.cosmeticNameLine}>
                <Text numberOfLines={1} style={styles.cosmeticName}>
                  {cosmetic.name}
                </Text>
                <Text style={styles.rarity}>{cosmetic.rarity}</Text>
              </View>
              <Text numberOfLines={2} style={styles.cosmeticDescription}>
                {cosmetic.kind === "CARD_BACK" ? "Full deck theme · " : ""}
                {cosmetic.description ?? kindLabel(cosmetic.kind)}
              </Text>
              <Pressable
                disabled={disabled || workingId !== null}
                onPress={() => void act(cosmetic)}
                style={({ pressed }) => [
                  styles.compactAction,
                  owned && styles.equipAction,
                  disabled && styles.disabledAction,
                  pressed && styles.pressed
                ]}
              >
                <Text style={[styles.compactActionText, owned && styles.equipActionText]}>
                  {workingId === cosmetic.id
                    ? "Working..."
                    : equipped
                      ? "Equipped"
                      : owned
                        ? "Equip"
                        : cosmetic.isSupporter
                          ? "Supporter"
                          : cosmetic.coinPrice === null
                            ? "Reward"
                            : `${cosmetic.coinPrice} coins`}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {visibleCosmetics.length === 0 ? (
        <EmptyState text="No cosmetics in this section yet." />
      ) : null}
      {!isAdmin && coins === 0 ? (
        <Text style={styles.helper}>No Arena Coins available.</Text>
      ) : null}
    </View>
  );
}

function CosmeticPreview({ cosmetic }: { readonly cosmetic: PublicCosmetic }) {
  if (cosmetic.kind === "CARD_BACK") {
    return (
      <View
        accessibilityLabel={`${cosmetic.name} deck preview showing the card back and face`}
        style={styles.deckPreview}
      >
        {cosmetic.previewUrl === null ? (
          <View style={[styles.deckBackPreview, styles.previewFallback]}>
            <Palette color={palette.mint} size={20} />
          </View>
        ) : (
          <Image
            source={{ uri: `${WEB_URL}${cosmetic.previewUrl}` }}
            contentFit="cover"
            transition={180}
            style={styles.deckBackPreview}
          />
        )}
        <View pointerEvents="none" style={styles.deckFacePreview}>
          <PlayingCard
            card={{ rank: "A", suit: "diamonds" }}
            themeSlug={cosmetic.slug}
            compact
            accessible={false}
          />
        </View>
      </View>
    );
  }

  if (cosmetic.previewUrl !== null) {
    return (
      <Image
        source={{ uri: `${WEB_URL}${cosmetic.previewUrl}` }}
        contentFit="cover"
        transition={180}
        style={styles.cosmeticPreview}
      />
    );
  }

  return (
    <View style={[styles.cosmeticPreview, styles.previewFallback]}>
      <Palette color={palette.mint} size={24} />
    </View>
  );
}

function FeedbackPanel({
  notice,
  onSubmit
}: {
  readonly notice: string;
  readonly onSubmit: (kind: FeedbackKind, body: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<FeedbackKind>("IDEA");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    const sent = await onSubmit(kind, body);
    if (sent) setBody("");
    setSending(false);
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        {kind === "BUG" ? (
          <Bug color={palette.coral} size={19} />
        ) : (
          <Lightbulb color={palette.gold} size={19} />
        )}
        <Text style={styles.sectionTitle}>Tell us what you noticed</Text>
      </View>
      <SegmentedControl value={kind} options={feedbackKinds} onChange={setKind} />
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={800}
        textAlignVertical="top"
        placeholder="Describe the issue or idea..."
        placeholderTextColor={palette.muted}
        style={[styles.input, styles.feedbackInput]}
      />
      <Text style={styles.helper}>{body.length}/800</Text>
      <ActionButton
        label="Send feedback"
        loading={sending}
        disabled={body.trim().length < 6}
        onPress={() => void send()}
      />
      <Text style={styles.notice}>{notice}</Text>
    </View>
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

function EmptyState({ text }: { readonly text: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function categoryIncludes(category: LockerCategory, kind: CosmeticKind): boolean {
  if (category === "cards") return kind === "CARD_BACK";
  if (category === "tables") return kind === "TABLE_THEME";
  return !["CARD_BACK", "TABLE_THEME"].includes(kind);
}

function kindLabel(kind: CosmeticKind): string {
  return kind
    .toLowerCase()
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function formatMode(mode: string): string {
  return mode
    .toLowerCase()
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
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
  accountImage: { width: "100%", height: "100%", borderRadius: 33 },
  avatarText: { color: palette.text, fontSize: 25, fontWeight: "900" },
  identityCopy: { flex: 1 },
  rating: { color: palette.text, fontSize: 17, fontWeight: "900" },
  coinLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  coins: { color: palette.gold, fontSize: 13, fontWeight: "700" },
  section: { gap: spacing.md },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { color: palette.text, fontSize: 18, fontWeight: "900" },
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
  },
  feedbackInput: { minHeight: 150, paddingTop: spacing.md, fontWeight: "500", lineHeight: 21 },
  cosmeticRow: {
    minHeight: 112,
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  cosmeticPreview: {
    width: 82,
    height: 96,
    borderRadius: radius.sm,
    backgroundColor: palette.felt
  },
  deckPreview: { width: 82, height: 96 },
  deckBackPreview: {
    position: "absolute",
    left: 1,
    top: 5,
    width: 55,
    height: 82,
    borderRadius: radius.sm,
    backgroundColor: palette.felt,
    transform: [{ rotate: "-5deg" }]
  },
  deckFacePreview: {
    position: "absolute",
    right: 0,
    bottom: 2,
    transform: [{ rotate: "6deg" }]
  },
  previewFallback: { alignItems: "center", justifyContent: "center" },
  cosmeticCopy: { flex: 1, justifyContent: "center", gap: 6 },
  cosmeticNameLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cosmeticName: { flex: 1, color: palette.text, fontSize: 15, fontWeight: "900" },
  rarity: { color: palette.mint, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  cosmeticDescription: { color: palette.muted, fontSize: 11, lineHeight: 15 },
  compactAction: {
    alignSelf: "flex-start",
    minWidth: 98,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: palette.gold
  },
  compactActionText: { color: palette.ink, fontSize: 11, fontWeight: "900" },
  equipAction: {
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line
  },
  equipActionText: { color: palette.text },
  disabledAction: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
  matchRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  placeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.felt
  },
  placeText: { color: palette.gold, fontSize: 15, fontWeight: "900" },
  matchCopy: { flex: 1 },
  matchMode: { color: palette.text, fontSize: 14, fontWeight: "900" },
  matchMeta: { color: palette.muted, fontSize: 11, marginTop: 3 },
  ratingDelta: { color: palette.mint, fontSize: 13, fontWeight: "900" },
  negativeDelta: { color: palette.coral },
  emptyState: {
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.line
  },
  emptyText: { color: palette.muted, fontSize: 13, textAlign: "center" },
  helper: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  notice: { color: palette.mint, fontSize: 11, textAlign: "center" },
  alertHeading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  alertIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line
  },
  alertCopy: { flex: 1, gap: 3 },
  alertStatus: { color: palette.muted, fontSize: 12, fontWeight: "700" }
});
