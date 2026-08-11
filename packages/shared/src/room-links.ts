const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function normalizeRoomCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
}

export function createRoomInviteUrl(webOrigin: string, roomCode: string): string {
  const origin = webOrigin.trim().replace(/\/+$/, "");
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  if (!/^https?:\/\//.test(origin)) {
    throw new Error("Room invite origin must be an HTTP or HTTPS URL.");
  }

  if (!isValidRoomCode(normalizedRoomCode)) {
    throw new Error("Room invite code must contain exactly 6 letters or numbers.");
  }

  return `${origin}/join/${encodeURIComponent(normalizedRoomCode)}`;
}
