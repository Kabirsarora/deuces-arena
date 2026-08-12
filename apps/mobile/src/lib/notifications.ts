import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type TableAlertTokenResult =
  | {
      readonly ok: true;
      readonly expoPushToken: string;
      readonly platform: "ios" | "android";
    }
  | { readonly ok: false; readonly message: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export async function requestTableAlertToken(): Promise<TableAlertTokenResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { ok: false, message: "Table alerts are available in the iOS and Android apps." };
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("table-alerts", {
        name: "Table alerts",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 120, 180],
        lightColor: "#76dfb4"
      });
    }

    const currentPermissions = await Notifications.getPermissionsAsync();
    const permissions =
      currentPermissions.status === "granted"
        ? currentPermissions
        : await Notifications.requestPermissionsAsync();

    if (permissions.status !== "granted") {
      return { ok: false, message: "Notifications are disabled in this device's settings." };
    }

    const projectId =
      Constants.easConfig?.projectId ??
      (Constants.expoConfig?.extra?.eas as { readonly projectId?: string } | undefined)?.projectId;

    if (projectId === undefined || projectId.trim() === "") {
      return { ok: false, message: "The mobile build is not linked to its EAS project yet." };
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return {
      ok: true,
      expoPushToken: token.data,
      platform: Platform.OS
    };
  } catch {
    return {
      ok: false,
      message: "This build cannot register table alerts. Try a development or store build."
    };
  }
}

export function readRoomCodeFromNotification(
  response: Notifications.NotificationResponse
): string | null {
  const value = response.notification.request.content.data?.roomCode;

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(normalized) ? normalized : null;
}
