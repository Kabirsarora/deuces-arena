import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { ArenaProvider } from "@/providers/arena-provider";
import { palette } from "@/constants/theme";

export default function RootLayout() {
  return (
    <ArenaProvider>
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
  );
}
