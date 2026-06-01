import { createHash } from "node:crypto";

import { auth } from "@/auth";
import { OnlineRoomPanel } from "@/components/online-room-panel";

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

function createAuthProfileId(identifier: string): string {
  return `auth-${createHash("sha256").update(identifier.toLowerCase()).digest("hex").slice(0, 32)}`;
}
