const MAX_CHAT_MESSAGE_LENGTH = 240;
const BLOCKED_WORDS = ["fuck", "shit", "bitch", "asshole", "slur"] as const;

export function sanitizeChatMessage(body: string): string | null {
  const trimmed = body.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);

  if (trimmed === "") {
    return null;
  }

  return BLOCKED_WORDS.reduce(
    (message, word) => message.replace(new RegExp(`\\b${word}\\b`, "gi"), "****"),
    trimmed
  );
}
