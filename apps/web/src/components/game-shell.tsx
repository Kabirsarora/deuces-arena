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
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null
            }
      }
    />
  );
}
