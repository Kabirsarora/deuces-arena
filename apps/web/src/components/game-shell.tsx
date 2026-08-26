import { createRealtimeAuthToken } from "@deuces-arena/shared";

import { auth } from "@/auth";
import { LanguageProvider } from "@/components/language-provider";
import { OnlineRoomPanel } from "@/components/online-room-panel";
import { createAuthProfileId } from "@/lib/auth-profile";

export async function GameShell() {
  const session = await auth();
  const authUser =
    session?.user === undefined
      ? null
      : {
          profileId: createAuthProfileId(session.user.email ?? session.user.name ?? "unknown"),
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null
        };
  const realtimeAuthSecret = process.env.REALTIME_AUTH_SECRET?.trim();
  const realtimeAuthToken =
    authUser === null || realtimeAuthSecret === undefined || realtimeAuthSecret === ""
      ? null
      : createRealtimeAuthToken({ profileId: authUser.profileId }, realtimeAuthSecret);

  return (
    <LanguageProvider>
      <OnlineRoomPanel authUser={authUser} realtimeAuthToken={realtimeAuthToken} />
    </LanguageProvider>
  );
}
