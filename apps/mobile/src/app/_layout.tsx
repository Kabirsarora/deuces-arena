import * as Notifications from "expo-notifications";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";

import { ArenaProvider } from "@/providers/arena-provider";
import { MobileErrorBoundary } from "@/components/mobile-error-boundary";
import { palette } from "@/constants/theme";
import { readRoomCodeFromNotification } from "@/lib/notifications";
import { useArena } from "@/providers/arena-provider";

export default function RootLayout() {
  return (
    <MobileErrorBoundary>
      <ArenaProvider>
        <NotificationRouteListener />
        <CompetitiveTableRouteListener />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: palette.ink },
            headerShown: false,
            animation: "fade"
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="join/[roomCode]" />
          <Stack.Screen name="table" options={{ gestureEnabled: false }} />
        </Stack>
      </ArenaProvider>
    </MobileErrorBoundary>
  );
}

function CompetitiveTableRouteListener() {
  const pathname = usePathname();
  const router = useRouter();
  const { room } = useArena();

  useEffect(() => {
    if (
      room === null ||
      room.status === "complete" ||
      (room.mode !== "RANKED" && room.mode !== "TOURNAMENT") ||
      pathname === "/table"
    ) {
      return;
    }

    router.replace("/table");
  }, [pathname, room, router]);

  return null;
}

function NotificationRouteListener() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    function openRoom(response: Notifications.NotificationResponse): void {
      const roomCode = readRoomCodeFromNotification(response);
      if (roomCode !== null) {
        router.push(`/join/${roomCode}`);
        Notifications.clearLastNotificationResponse();
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(openRoom);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response !== null) openRoom(response);
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}
