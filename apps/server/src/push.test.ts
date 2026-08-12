import { describe, expect, it, vi } from "vitest";

import { createPushNotificationService } from "./push.js";

function createPersistence() {
  return {
    getSubscriptions: vi.fn(async () => [
      { id: "subscription-1", expoPushToken: "ExpoPushToken[first-device]" },
      { id: "subscription-2", expoPushToken: "ExpoPushToken[second-device]" }
    ]),
    saveTickets: vi.fn(async () => undefined),
    getPendingTickets: vi.fn(async () => [
      {
        receiptId: "receipt-1",
        subscriptionId: "subscription-1"
      },
      {
        receiptId: "receipt-2",
        subscriptionId: "subscription-2"
      }
    ]),
    resolveTickets: vi.fn(async () => undefined),
    deleteSubscriptions: vi.fn(async () => undefined)
  };
}

describe("push notification service", () => {
  it("does nothing until delivery is explicitly enabled", async () => {
    const persistence = createPersistence();
    const fetchImpl = vi.fn<typeof fetch>();
    const service = createPushNotificationService({
      enabled: false,
      persistence,
      fetchImpl
    });

    await service.sendRoomAlert(["auth-player"], {
      title: "Ranked match found",
      body: "Your table is ready.",
      roomCode: "ABC123"
    });
    await service.processPendingReceipts();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(persistence.getSubscriptions).not.toHaveBeenCalled();
    expect(persistence.getPendingTickets).not.toHaveBeenCalled();
  });

  it("stores receipt IDs and removes invalid tokens from push tickets", async () => {
    const persistence = createPersistence();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: [
          { status: "ok", id: "receipt-1" },
          { status: "error", details: { error: "DeviceNotRegistered" } }
        ]
      })
    );
    const service = createPushNotificationService({
      enabled: true,
      persistence,
      fetchImpl
    });

    await service.sendRoomAlert(["auth-player"], {
      title: "Ranked match found",
      body: "Your table is ready.",
      roomCode: "ABC123"
    });

    expect(persistence.saveTickets).toHaveBeenCalledWith([
      { subscriptionId: "subscription-1", receiptId: "receipt-1" }
    ]);
    expect(persistence.deleteSubscriptions).toHaveBeenCalledWith(["subscription-2"]);
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as readonly {
      readonly data: { readonly roomCode: string };
    }[];
    expect(request[0]?.data.roomCode).toBe("ABC123");
  });

  it("checks receipts and retires devices that are no longer registered", async () => {
    const persistence = createPersistence();
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        data: {
          "receipt-1": { status: "ok" },
          "receipt-2": {
            status: "error",
            details: { error: "DeviceNotRegistered" }
          }
        }
      })
    );
    const service = createPushNotificationService({
      enabled: true,
      persistence,
      fetchImpl
    });

    await service.processPendingReceipts();

    expect(persistence.resolveTickets).toHaveBeenCalledWith({
      checkedReceiptIds: ["receipt-1", "receipt-2"],
      invalidSubscriptionIds: ["subscription-2"]
    });
  });

  it("retries temporary Expo failures with bounded backoff", async () => {
    const persistence = createPersistence();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ data: [] }));
    const wait = vi.fn(async () => undefined);
    const service = createPushNotificationService({
      enabled: true,
      persistence,
      fetchImpl,
      wait
    });

    await service.sendRoomAlert(["auth-player"], {
      title: "Tournament match ready",
      body: "Your table is ready.",
      roomCode: "XYZ789"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(500);
  });

  it("ignores malformed Expo responses without affecting the table", async () => {
    const persistence = createPersistence();
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
    );
    const service = createPushNotificationService({
      enabled: true,
      persistence,
      fetchImpl
    });

    await expect(
      service.sendRoomAlert(["auth-player"], {
        title: "Ranked match found",
        body: "Your table is ready.",
        roomCode: "ABC123"
      })
    ).resolves.toBeUndefined();

    expect(persistence.saveTickets).toHaveBeenCalledWith([]);
    expect(persistence.deleteSubscriptions).toHaveBeenCalledWith([]);
  });

  it("includes the optional Expo access token when enhanced security is enabled", async () => {
    const persistence = createPersistence();
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ data: [] }));
    const service = createPushNotificationService({
      enabled: true,
      accessToken: "expo-access-token",
      persistence,
      fetchImpl
    });

    await service.sendRoomAlert(["auth-player"], {
      title: "Tournament match ready",
      body: "Your table is ready.",
      roomCode: "XYZ789"
    });

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer expo-access-token"
    });
  });
});
