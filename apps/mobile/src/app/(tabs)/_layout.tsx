import { Tabs } from "expo-router";
import { CircleUserRound, Gamepad2, Trophy, UsersRound } from "lucide-react-native";

import { palette } from "@/constants/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.gold,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.black,
          borderTopColor: palette.line,
          height: 70,
          paddingTop: 7,
          paddingBottom: 9
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Play",
          tabBarIcon: ({ color, size }) => <Gamepad2 color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: "Rooms",
          tabBarIcon: ({ color, size }) => <UsersRound color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="ranked"
        options={{
          title: "Ranked",
          tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size} />
        }}
      />
    </Tabs>
  );
}
