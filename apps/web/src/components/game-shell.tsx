import { auth } from "@/auth";
import { OnlineRoomPanel } from "@/components/online-room-panel";
import { createAuthProfileId } from "@/lib/auth-profile";

export async function GameShell() {
  const session = await auth();

  return (
    <OnlineRoomPanel
      authUser={
        session?.user === undefined
          ? null
          : {
              profileId: createAuthProfileId(session.user.email ?? session.user.name ?? "unknown"),
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null
            }
      }
    />
  );
}
