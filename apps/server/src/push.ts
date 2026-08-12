import {
  deletePersistedPushSubscriptionsByIds,
  getPendingPersistedPushDeliveryTickets,
  getPersistedPushSubscriptions,
  resolvePersistedPushDeliveryTickets,
  savePersistedPushDeliveryTickets,
  type PersistedPushDeliveryTicket,
  type PersistedPushSubscription
} from "./persistence.js";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const MAX_SEND_BATCH = 100;
const MAX_RECEIPT_BATCH = 1_000;

type ExpoErrorDetails = {
  readonly error?: string;
};

type ExpoPushTicket =
  | { readonly status: "ok"; readonly id: string }
  | {
      readonly status: "error";
      readonly message?: string;
      readonly details?: ExpoErrorDetails;
    };

type ExpoPushReceipt =
  | { readonly status: "ok" }
  | {
      readonly status: "error";
      readonly message?: string;
      readonly details?: ExpoErrorDetails;
    };

type PushPersistence = {
  readonly getSubscriptions: (
    profileIds: readonly string[]
  ) => Promise<readonly PersistedPushSubscription[]>;
  readonly saveTickets: (
    tickets: readonly { readonly subscriptionId: string; readonly receiptId: string }[]
  ) => Promise<void>;
  readonly getPendingTickets: (limit?: number) => Promise<readonly PersistedPushDeliveryTicket[]>;
  readonly resolveTickets: (input: {
    readonly checkedReceiptIds: readonly string[];
    readonly invalidSubscriptionIds: readonly string[];
  }) => Promise<void>;
  readonly deleteSubscriptions: (subscriptionIds: readonly string[]) => Promise<void>;
};

type PushNotificationServiceOptions = {
  readonly enabled: boolean;
  readonly accessToken?: string;
  readonly fetchImpl?: typeof fetch;
  readonly persistence?: PushPersistence;
  readonly wait?: (milliseconds: number) => Promise<void>;
};

export type PushRoomAlert = {
  readonly title: string;
  readonly body: string;
  readonly roomCode: string;
};

const defaultPersistence: PushPersistence = {
  getSubscriptions: getPersistedPushSubscriptions,
  saveTickets: savePersistedPushDeliveryTickets,
  getPendingTickets: getPendingPersistedPushDeliveryTickets,
  resolveTickets: resolvePersistedPushDeliveryTickets,
  deleteSubscriptions: deletePersistedPushSubscriptionsByIds
};

export function createPushNotificationService(options: PushNotificationServiceOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const persistence = options.persistence ?? defaultPersistence;
  const wait =
    options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  async function sendRoomAlert(profileIds: readonly string[], alert: PushRoomAlert): Promise<void> {
    if (!options.enabled || profileIds.length === 0) {
      return;
    }

    const subscriptions = await persistence.getSubscriptions(profileIds);

    for (const batch of chunk(subscriptions, MAX_SEND_BATCH)) {
      const messages = batch.map((subscription) => ({
        to: subscription.expoPushToken,
        title: alert.title,
        body: alert.body,
        sound: "default" as const,
        priority: "high" as const,
        channelId: "table-alerts",
        data: { roomCode: alert.roomCode }
      }));

      const response = await requestWithRetry(
        EXPO_SEND_URL,
        { method: "POST", headers: headers(), body: JSON.stringify(messages) },
        fetchImpl,
        wait
      );

      if (response === null) {
        continue;
      }

      const body = await readJson<{ readonly data?: readonly ExpoPushTicket[] }>(response);
      const tickets = Array.isArray(body?.data) ? body.data : [];
      const savedTickets: { readonly subscriptionId: string; readonly receiptId: string }[] = [];
      const invalidSubscriptionIds: string[] = [];

      tickets.forEach((ticket, index) => {
        const subscription = batch[index];
        if (subscription === undefined || !isExpoPushTicket(ticket)) return;

        if (ticket.status === "ok") {
          savedTickets.push({ subscriptionId: subscription.id, receiptId: ticket.id });
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          invalidSubscriptionIds.push(subscription.id);
        }
      });

      await Promise.all([
        persistence.saveTickets(savedTickets),
        persistence.deleteSubscriptions(invalidSubscriptionIds)
      ]);
    }
  }

  async function processPendingReceipts(): Promise<void> {
    if (!options.enabled) {
      return;
    }

    const pendingTickets = await persistence.getPendingTickets(MAX_RECEIPT_BATCH);

    for (const batch of chunk(pendingTickets, MAX_RECEIPT_BATCH)) {
      const response = await requestWithRetry(
        EXPO_RECEIPTS_URL,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ids: batch.map((ticket) => ticket.receiptId) })
        },
        fetchImpl,
        wait
      );

      if (response === null) {
        continue;
      }

      const body = await readJson<{
        readonly data?: Readonly<Record<string, ExpoPushReceipt>>;
      }>(response);
      const receipts = isRecord(body?.data) ? body.data : {};
      const checkedReceiptIds: string[] = [];
      const invalidSubscriptionIds: string[] = [];

      for (const ticket of batch) {
        const receipt = receipts[ticket.receiptId];
        if (!isExpoPushReceipt(receipt)) continue;

        checkedReceiptIds.push(ticket.receiptId);
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
          invalidSubscriptionIds.push(ticket.subscriptionId);
        }
      }

      await persistence.resolveTickets({ checkedReceiptIds, invalidSubscriptionIds });
    }
  }

  function headers(): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.accessToken === undefined
        ? {}
        : { Authorization: `Bearer ${options.accessToken}` })
    };
  }

  return { sendRoomAlert, processPendingReceipts };
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  wait: (milliseconds: number) => Promise<void>
): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, init);
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) return null;
    } catch {
      // Network failures are retried with the same bounded backoff as temporary HTTP errors.
    }

    if (attempt < 2) await wait(500 * 2 ** attempt);
  }

  return null;
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, ExpoPushReceipt>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExpoPushTicket(value: unknown): value is ExpoPushTicket {
  if (typeof value !== "object" || value === null) return false;

  const ticket = value as { readonly status?: unknown; readonly id?: unknown };
  return (ticket.status === "ok" && typeof ticket.id === "string") || ticket.status === "error";
}

function isExpoPushReceipt(value: unknown): value is ExpoPushReceipt {
  if (typeof value !== "object" || value === null) return false;
  const receipt = value as { readonly status?: unknown };
  return receipt.status === "ok" || receipt.status === "error";
}
