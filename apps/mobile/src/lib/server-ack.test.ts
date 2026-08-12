import { describe, expect, it, vi } from "vitest";

import { emitWithAck } from "./server-ack";

describe("emitWithAck", () => {
  it("returns a successful acknowledgement", async () => {
    const result = await emitWithAck<{ value: number }>((acknowledge) => {
      acknowledge({ ok: true, data: { value: 2 } });
    });

    expect(result).toEqual({ ok: true, data: { value: 2 } });
  });

  it("returns a retryable error when the server does not answer", async () => {
    vi.useFakeTimers();
    const result = emitWithAck(() => undefined, 100);

    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toEqual({
      ok: false,
      error: "The server did not respond. Check your connection and try again."
    });
    vi.useRealTimers();
  });

  it("ignores an acknowledgement that arrives after the timeout", async () => {
    vi.useFakeTimers();
    let acknowledge: ((value: { ok: true; data: string }) => void) | undefined;
    const result = emitWithAck<string>((callback) => {
      acknowledge = callback;
    }, 100);

    await vi.advanceTimersByTimeAsync(100);
    acknowledge?.({ ok: true, data: "late" });

    await expect(result).resolves.toMatchObject({ ok: false });
    vi.useRealTimers();
  });

  it("turns a synchronous transport failure into a retryable error", async () => {
    const result = await emitWithAck(() => {
      throw new Error("socket closed");
    });

    expect(result).toEqual({
      ok: false,
      error: "Unable to send that request. Check your connection and try again."
    });
  });
});
