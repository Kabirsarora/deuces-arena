import type { ServerAck } from "@deuces-arena/shared";

export const SERVER_ACK_TIMEOUT_MS = 15_000;

export function emitWithAck<T = undefined>(
  emit: (callback: (ack: ServerAck<T>) => void) => void,
  timeoutMs = SERVER_ACK_TIMEOUT_MS
): Promise<ServerAck<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        error: "The server did not respond. Check your connection and try again."
      });
    }, timeoutMs);
    const finish = (ack: ServerAck<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack);
    };

    try {
      emit(finish);
    } catch {
      finish({
        ok: false,
        error: "Unable to send that request. Check your connection and try again."
      });
    }
  });
}
